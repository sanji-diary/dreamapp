// Run only on the church app's authenticated backend. The browser receives gameUrl and launchId.
import {createHash, randomBytes} from 'node:crypto';

export const GAME_ID = 'shepherd-coop';
export const DEFAULT_GAME_ORIGIN = 'https://dreamforest-shepherd-trail.sanji574633.chatgpt.site';

function failure(status, message) {
  return Object.assign(new Error(message), {status});
}

function authenticatedId(memberId) {
  if (typeof memberId === 'string' && memberId.trim()) return memberId;
  if (Number.isSafeInteger(memberId)) return String(memberId);
  throw failure(401, '로그인한 참가자를 확인해 주세요.');
}

function webOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('프로토콜, 호스트, 포트로 구성된 origin을 지정해 주세요.');
  }
  return url.origin;
}

function identifier(value) {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 256;
}

export function createRewardAdapter({
  database, gameOrigin = DEFAULT_GAME_ORIGIN, dropsPerWin = 1, fetchImpl = fetch
}) {
  if (!Number.isSafeInteger(dropsPerWin) || dropsPerWin < 1) throw new RangeError('물방울 수량은 양의 정수여야 해요.');
  const origin = webOrigin(gameOrigin);
  const verifyUrl = new URL('/api/results/verify', origin);
  const db = database;
  db.exec(`
    CREATE TABLE IF NOT EXISTS shepherd_app_launches (
      launch_id TEXT PRIMARY KEY, member_id TEXT NOT NULL, secret_hex TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS shepherd_app_launch_member ON shepherd_app_launches(member_id,created_at);
    CREATE TABLE IF NOT EXISTS shepherd_app_reward_ledger (
      result_id TEXT PRIMARY KEY, member_id TEXT NOT NULL, round_id TEXT NOT NULL,
      launch_id TEXT NOT NULL, completed_at INTEGER NOT NULL, drops INTEGER NOT NULL,
      UNIQUE(member_id,round_id)
    );
    CREATE TABLE IF NOT EXISTS shepherd_app_wallets (
      member_id TEXT PRIMARY KEY, drops INTEGER NOT NULL DEFAULT 0
    );
  `);
  const insertLaunch = db.prepare('INSERT INTO shepherd_app_launches VALUES (?,?,?,?)');
  const lookupLaunch = db.prepare('SELECT secret_hex FROM shepherd_app_launches WHERE member_id=? AND launch_id=?');
  const launches = db.prepare('SELECT launch_id FROM shepherd_app_launches WHERE member_id=? ORDER BY created_at DESC');
  const wallet = db.prepare('SELECT drops FROM shepherd_app_wallets WHERE member_id=?');
  const insertCredit = db.prepare(`
    INSERT INTO shepherd_app_reward_ledger(result_id,member_id,round_id,launch_id,completed_at,drops)
    VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING
  `);
  const addDrops = db.prepare(`
    INSERT INTO shepherd_app_wallets(member_id,drops) VALUES (?,?)
    ON CONFLICT(member_id) DO UPDATE SET drops=drops+excluded.drops
  `);

  function createLaunch(memberId, parentOrigin) {
    const owner = authenticatedId(memberId);
    const secret = randomBytes(32);
    const launchId = createHash('sha256').update(secret).digest('hex');
    const gameUrl = new URL('/', origin);
    const fragment = new URLSearchParams({launch:launchId});
    if (parentOrigin) fragment.set('parentOrigin', webOrigin(parentOrigin));
    gameUrl.hash = fragment.toString();
    insertLaunch.run(launchId, owner, secret.toString('hex'), Date.now());
    return {launchId, gameUrl:gameUrl.href};
  }

  function getBalance(memberId) {
    return wallet.get(authenticatedId(memberId))?.drops ?? 0;
  }

  function listLaunchIds(memberId) {
    return launches.all(authenticatedId(memberId)).map(row => row.launch_id);
  }

  async function collectRewards(memberId, launchId, roundId) {
    const owner = authenticatedId(memberId);
    if (typeof launchId !== 'string' || !/^[0-9a-f]{64}$/.test(launchId) ||
        (roundId !== undefined && !identifier(roundId))) {
      throw failure(400, '게임 실행 정보가 올바르지 않아요.');
    }
    const launch = lookupLaunch.get(owner, launchId);
    if (!launch) throw failure(404, '이 참가자의 게임 실행 기록을 찾지 못했어요.');
    const verified = [];
    let after = 0;
    while (true) {
      let page;
      try {
        const response = await fetchImpl(verifyUrl, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({launchSecret:launch.secret_hex, roundId, after}),
          cache:'no-store', redirect:'error', signal:AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error('verify');
        page = await response.json();
      } catch {
        throw failure(502, '게임 결과를 확인하지 못했어요. 같은 실행 기록으로 다시 시도해 주세요.');
      }
      if (page?.gameId !== GAME_ID || !Array.isArray(page.results)) throw failure(502, '게임 결과 형식을 확인해 주세요.');
      for (const result of page.results) {
        if (!identifier(result?.resultId) || !identifier(result.roundId) || result.savedCount !== 6 ||
            !Number.isSafeInteger(result.completedAt) || result.completedAt <= 0 ||
            (roundId !== undefined && result.roundId !== roundId) ||
            (result.launchId !== undefined && result.launchId !== launchId)) {
          throw failure(502, '완주 결과의 참가 정보가 일치하지 않아요.');
        }
        verified.push(result);
      }
      if (page.nextCursor == null) break;
      if (!Number.isSafeInteger(page.nextCursor) || page.nextCursor <= after) throw failure(502, '결과를 다시 조회해 주세요.');
      after = page.nextCursor;
    }

    // Keep both writes in the wallet database. Retries after a lost response return the committed balance.
    db.exec('BEGIN IMMEDIATE');
    try {
      let awardedDrops = 0;
      for (const result of verified) {
        const inserted = insertCredit.run(result.resultId, owner, result.roundId, launchId, result.completedAt, dropsPerWin);
        if (inserted.changes === 1) awardedDrops += dropsPerWin;
      }
      if (awardedDrops > 0) addDrops.run(owner, awardedDrops);
      const balance = getBalance(owner);
      db.exec('COMMIT');
      const status = awardedDrops > 0 ? 'awarded' : verified.length ? 'already_awarded' : 'pending';
      return {status, awardedDrops, balance};
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {createLaunch, collectRewards, getBalance, listLaunchIds};
}
