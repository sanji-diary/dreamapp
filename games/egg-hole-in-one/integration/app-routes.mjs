// Register the routes behind the app's usual authentication and CSRF middleware.
// authenticate(request) must read the verified session or native app credential.
export function createEggRoutes({ rewards, authenticate, appOrigin }) {
  const origin = new URL(appOrigin).origin;
  const prefix = '/api/minigames/egg-hole-in-one/';
  const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

  return async function handle(request) {
    const path = new URL(request.url).pathname;
    const endpoint = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    if (!['launch', 'claim', 'reconcile'].includes(endpoint)) return json({ error: 'unknown_route' }, 404);
    if (request.method !== 'POST') return json({ error: 'post_required' }, 405);
    const callerOrigin = request.headers.get('origin');
    if (callerOrigin && callerOrigin !== origin) return json({ error: 'origin_mismatch' }, 403);
    try {
      const memberId = await authenticate(request);
      if (memberId == null || memberId === '') return json({ error: 'login_required' }, 401);
      if (endpoint === 'launch') return json(rewards.createLaunch(memberId, origin), 201);
      if (endpoint === 'claim') {
        let input;
        try { input = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
        return json(await rewards.collectRewards(memberId, input?.launchId, input?.roundId));
      }
      let awardedDrops = 0;
      for (const launchId of rewards.listLaunchIds(memberId)) {
        const receipt = await rewards.collectRewards(memberId, launchId);
        awardedDrops += receipt.awardedDrops;
      }
      return json({ awardedDrops, balance: rewards.getBalance(memberId) });
    } catch (error) {
      return json({ error: 'reward_request_failed' }, error.status >= 400 && error.status <= 599 ? error.status : 503);
    }
  };
}
