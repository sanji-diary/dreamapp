import { STAGES, isValidShot, simulateShot } from './public/physics.mjs';

const gameId = 'egg-hole-in-one';
const day = 86_400_000;
const hexKey = /^[0-9a-f]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json = (data, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
const digest = async key => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(key.match(/../g), pair => parseInt(pair, 16)))));

// UI and API replay the same launches. Only the first two misses affect assistance.
export function isCompleteRound(shots, rulesVersion = 2) {
  if (!Array.isArray(shots) || shots.length < 5 || shots.length > 15) return false;
  let stage = 0, goals = 0, misses = 0;
  for (const shot of shots) {
    if (stage === STAGES.length || !isValidShot(shot)) return false;
    if (simulateShot(stage, shot, misses, goals, rulesVersion).hit) {
      misses = 0;
      goals++;
      if (goals === STAGES[stage].target) {
        stage++;
        goals = 0;
      }
    } else {
      if (misses === 2) return false;
      misses++;
    }
  }
  return stage === STAGES.length;
}

export async function gameApi(request, store) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'POST') return json({error:'post_required'}, 405);
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return json({error:'body_too_large'}, 413);
    input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
  } catch { return json({error:'invalid_json'}, 400); }
  const now = Date.now();
  if (path === '/api/rounds') {
    const launch = input.launchId;
    if (launch != null && (typeof launch !== 'string' || !hexKey.test(launch))) return json({error:'invalid_launch'}, 400);
    // Previously loaded clients omit this field and still play the original courses.
    const {rulesVersion = 1} = input;
    if (rulesVersion !== 1 && rulesVersion !== 2) return json({error:'unsupported_rules'}, 400);
    const roundId = crypto.randomUUID();
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await store.run('DELETE FROM egg_rounds WHERE expires_at <= ?', now);
    await store.run('INSERT INTO egg_rounds(round_id,token_hash,launch_id,expires_at,rules_version) VALUES (?,?,?,?,?)',
      roundId, await digest(token), launch ?? null, now + day, rulesVersion);
    return json({roundId,token,rulesVersion}, 201);
  }
  const finish = /^\/api\/rounds\/([^/]+)\/finish$/.exec(path);
  if (finish && uuid.test(finish[1])) {
    const roundId = finish[1];
    if (typeof input.token !== 'string' || !hexKey.test(input.token)) return json({error:'invalid_ticket'}, 403);
    const row = await store.first('SELECT token_hash,result_id,completed_at,rules_version FROM egg_rounds WHERE round_id=? AND expires_at>?', roundId, now);
    if (!row || row.token_hash !== await digest(input.token)) return json({error:'invalid_ticket'}, 403);
    if (row.result_id) return json({roundId,resultId:row.result_id,completedAt:row.completed_at,verified:true});
    if (!isCompleteRound(input.shots, row.rules_version)) return json({error:'course_incomplete'}, 422);
    await store.run('UPDATE egg_rounds SET result_id=?,completed_at=?,expires_at=? WHERE round_id=? AND result_id IS NULL',
      crypto.randomUUID(), now, now + 90 * day, roundId);
    const saved = await store.first('SELECT result_id,completed_at FROM egg_rounds WHERE round_id=?', roundId);
    return json({roundId,resultId:saved.result_id,completedAt:saved.completed_at,verified:true});
  }
  if (path === '/api/results/verify') {
    const {launchSecret, roundId = null, after = 0} = input;
    if (typeof launchSecret !== 'string' || !hexKey.test(launchSecret) ||
        (roundId !== null && (typeof roundId !== 'string' || !uuid.test(roundId))) ||
        !Number.isSafeInteger(after) || after < 0) return json({error:'invalid_lookup'}, 400);
    const rows = await store.all('SELECT seq,round_id AS roundId,result_id AS resultId,completed_at AS completedAt FROM egg_rounds WHERE launch_id=? AND result_id IS NOT NULL AND expires_at>? AND seq>? AND (? IS NULL OR round_id=?) ORDER BY seq LIMIT 51',
      await digest(launchSecret), now, after, roundId, roundId);
    const results = rows.slice(0,50).map(({seq,...result}) => ({...result, goals:5, completedStages:3}));
    return json({gameId,results,nextCursor:rows.length > 50 ? rows[49].seq : null});
  }
  return json({error:'unknown_route'}, 404);
}

