// Mount these Fetch-compatible routes behind the app's existing login and CSRF middleware.
// authenticate(request) returns the member ID from a verified session or null.
export function createShepherdRoutes({rewards, authenticate, appOrigin}) {
  const origin = new URL(appOrigin).origin;
  const json = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
  const prefix = '/api/minigames/shepherd/';
  return async function handle(request) {
    const path = new URL(request.url).pathname;
    const endpoints = ['launch','claim','reconcile'];
    if (!endpoints.some(name=>path===prefix+name)) return json({error:'unknown_route'},404);
    if (request.method !== 'POST') return json({error:'post_required'},405);
    if (request.headers.get('origin') && request.headers.get('origin')!==origin) return json({error:'origin_mismatch'},403);
    const memberId = await authenticate(request);
    if (memberId == null || memberId === '') return json({error:'login_required'},401);
    try {
      if (path===prefix+'launch') return json(rewards.createLaunch(memberId,origin),201);
      if (path===prefix+'claim') {
        let input;
        try { input = await request.json(); } catch { return json({error:'invalid_json'},400); }
        if (!/^[0-9a-f]{64}$/.test(input?.launchId ?? '') ||
            (input.roundId !== undefined && (typeof input.roundId !== 'string' || !input.roundId.length || input.roundId.length>100))) {
          return json({error:'invalid_claim'},400);
        }
        return json(await rewards.collectRewards(memberId,input.launchId,input.roundId));
      }
      let awardedDrops = 0;
      for(const launchId of rewards.listLaunchIds(memberId)) {
        const result = await rewards.collectRewards(memberId,launchId);
        awardedDrops += result.awardedDrops;
      }
      return json({awardedDrops,balance:rewards.getBalance(memberId)});
    } catch (error) {
      // Keep verification failures retryable and private launch secrets out of the response.
      return json({error:'reward_request_failed'},error.status >= 400 && error.status <= 599 ? error.status : 503);
    }
  };
}
