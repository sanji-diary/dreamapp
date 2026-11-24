import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createRewardAdapter, GAME_ID } from '../integration/app-rewards.mjs';
import { createEggRoutes } from '../integration/app-routes.mjs';
import { mountEggGame } from '../integration/web-host.mjs';
import { gameApi } from '../rounds.mjs';
import { openStore } from '../server.mjs';
import { guide, simulateShot } from '../public/physics.mjs';

const gameOrigin = 'https://game.example';
const appOrigin = 'https://app.example';
const gameShots = [0, 0, 1, 1, 2].map((stage, i) => guide(stage, 5.97 * i, 0, i % 2));
// Loft the first egg over the wall, then bounce the second off the cushion.
gameShots[2] = {vx:292,vy:-515,phase:0};

test('one signed-in player finishes the real game, credits the existing shared wallet once and reconciles on return', async t => {
  const game = openStore(':memory:');
  const db = new DatabaseSync(':memory:');
  t.after(() => { game.close(); db.close(); });
  // Recreate the wallet shipped with the shepherd game, including a preexisting award.
  db.exec('CREATE TABLE shepherd_app_wallets(member_id TEXT PRIMARY KEY,drops INTEGER NOT NULL DEFAULT 0)');
  db.prepare('INSERT INTO shepherd_app_wallets VALUES (?,?)').run('spring', 3);
  const fetchGame = (url, options) => gameApi(new Request(url, options), game);
  const rewards = createRewardAdapter({ database: db, gameOrigin, fetchImpl: fetchGame });
  const asApp = async (memberId, endpoint, body = {}) => {
    const route = createEggRoutes({ rewards, appOrigin, authenticate: () => memberId });
    const response = await route(new Request(appOrigin + '/api/minigames/egg-hole-in-one/' + endpoint, {
      method: 'POST', headers: { origin: appOrigin }, body: JSON.stringify(body),
    }));
    return { code: response.status, ...await response.json() };
  };
  const postGame = async (path, body) => {
    const response = await fetchGame(gameOrigin + path, { method: 'POST', body: JSON.stringify(body) });
    return { code: response.status, ...await response.json() };
  };

  assert.equal((await asApp(null, 'launch')).code, 401);
  const launch = await asApp('spring', 'launch', { memberId: 'other' });
  assert.equal(launch.code, 201);
  assert.deepEqual(Object.keys(launch).sort(), ['code', 'gameUrl', 'launchId']);
  const fragment = new URLSearchParams(new URL(launch.gameUrl).hash.slice(1));
  assert.deepEqual([...fragment.keys()], ['launch', 'parentOrigin']);
  assert.equal(fragment.get('parentOrigin'), appOrigin);
  const ticket = await postGame('/api/rounds', { launchId: fragment.get('launch'), rulesVersion:2 });
  assert.equal(ticket.code, 201);
  assert.equal(simulateShot(1,gameShots[2]).banked,false);
  assert.equal(simulateShot(1,gameShots[3],0,1).banked,true);
  const finishPath = '/api/rounds/' + ticket.roundId + '/finish';
  const claim = { launchId: launch.launchId, roundId: ticket.roundId };
  assert.equal((await postGame(finishPath, { token: ticket.token, shots: gameShots.slice(0, 4) })).code, 422);
  assert.deepEqual(await asApp('spring', 'claim', claim), { code: 200, status: 'pending', awardedDrops: 0, balance: 3 });
  const saved = await postGame(finishPath, { token: ticket.token, shots: gameShots });
  assert.equal(saved.verified, true);
  const retried = await postGame(finishPath, { token: ticket.token, shots: gameShots });
  assert.equal(saved.resultId, retried.resultId);
  assert.equal((await asApp('other', 'claim', claim)).code, 404);
  const otherLaunch = await asApp('other', 'launch');
  assert.deepEqual(await asApp('other', 'claim', { ...claim, launchId: otherLaunch.launchId }),
    { code: 200, status: 'pending', awardedDrops: 0, balance: 0 });
  const attempts = await Promise.all([asApp('spring', 'claim', claim), asApp('spring', 'claim', claim)]);
  assert.equal(attempts.reduce((sum, row) => sum + row.awardedDrops, 0), 1);
  assert.deepEqual(attempts.map(row => row.status).sort(), ['already_awarded', 'awarded']);
  assert.equal(db.prepare('SELECT drops FROM shepherd_app_wallets WHERE member_id=?').get('spring').drops, 4);

  // Close the game before notification: the second round is recovered through the app session.
  const replay = await postGame('/api/rounds', { launchId: launch.launchId, rulesVersion:2 });
  assert.equal((await postGame('/api/rounds/' + replay.roundId + '/finish', {
    token: replay.token, shots: [{ vx: 60, vy: -70, phase: 0 }, ...gameShots],
  })).verified, true);
  assert.deepEqual(await asApp('spring', 'reconcile'), { code: 200, awardedDrops: 1, balance: 5 });
  assert.deepEqual(await asApp('spring', 'reconcile'), { code: 200, awardedDrops: 0, balance: 5 });
  assert.equal(db.prepare('SELECT count(*) AS n FROM egg_app_reward_ledger').get().n, 2);
});

test('only fully verified egg results are credited and ledger and wallet roll back together', async t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const result = { resultId: randomUUID(), roundId: randomUUID(), completedAt: Date.now(), completedStages: 3, goals: 5 };
  let page;
  const adapter = createRewardAdapter({ database: db, gameOrigin, dropsPerWin: 2, fetchImpl: async () => Response.json(page) });
  const { launchId } = adapter.createLaunch('member');
  for (const invalid of [
    { gameId: 'shepherd-coop', results: [result] },
    { gameId: GAME_ID, results: [{ ...result, completedStages: 2 }] },
    { gameId: GAME_ID, results: [{ ...result, goals: 4 }] },
    { gameId: GAME_ID, results: [{ ...result, roundId: randomUUID() }] },
  ]) {
    page = invalid;
    await assert.rejects(adapter.collectRewards('member', launchId, result.roundId), { status: 502 });
    assert.equal(adapter.getBalance('member'), 0);
  }
  page = { gameId: GAME_ID, results: [result] };
  db.exec("CREATE TRIGGER wallet_failure BEFORE INSERT ON shepherd_app_wallets BEGIN SELECT RAISE(ABORT, 'wallet unavailable'); END");
  await assert.rejects(adapter.collectRewards('member', launchId), /wallet unavailable/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM egg_app_reward_ledger').get().n, 0);
  db.exec('DROP TRIGGER wallet_failure');
  assert.deepEqual(await adapter.collectRewards('member', launchId), { status: 'awarded', awardedDrops: 2, balance: 2 });
});

test('the web host forwards only the mounted game and launch to the authenticated claim route', async t => {
  const host = new EventTarget();
  const previous = globalThis.window;
  globalThis.window = host;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const iframe = { contentWindow: {} };
  const launch = { launchId: 'c'.repeat(64), gameUrl: gameOrigin + '/#launch=' + 'c'.repeat(64) };
  const calls = [];
  const unmount = mountEggGame({ iframe, launch, gameOrigin, collect: body => calls.push(body) });
  const roundId = randomUUID();
  const data = { type: 'dreamforest.minigame.completed', version: 1, gameId: GAME_ID, launchId: launch.launchId, roundId };
  function dispatch(origin, source, message) {
    const event = new Event('message');
    Object.assign(event, { origin, source, data: message });
    host.dispatchEvent(event);
  }
  dispatch(appOrigin, iframe.contentWindow, data);
  dispatch(gameOrigin, {}, data);
  dispatch(gameOrigin, iframe.contentWindow, { ...data, launchId: 'other' });
  dispatch(gameOrigin, iframe.contentWindow, { ...data, gameId: 'shepherd-coop' });
  dispatch(gameOrigin, iframe.contentWindow, data);
  unmount();
  dispatch(gameOrigin, iframe.contentWindow, data);
  assert.deepEqual(calls, [{ launchId: launch.launchId, roundId }]);
});
