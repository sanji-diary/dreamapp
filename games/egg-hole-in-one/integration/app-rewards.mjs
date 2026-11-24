// Import on the authenticated church app backend. Browser/WebView code gets only gameUrl and launchId.
import { createHash, randomBytes } from 'node:crypto';

export const GAME_ID = 'egg-hole-in-one';
export const DEFAULT_GAME_ORIGIN = 'https://dreamforest-egg-hole-in-one.sanji574633.chatgpt.site';
const PUBLIC_LAUNCH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const failure = (status, message) => Object.assign(new Error(message), { status });

function ownerId(id) {
  if (typeof id === 'string' && id.trim()) return id;
  if (Number.isSafeInteger(id)) return String(id);
  throw failure(401, '로그인이 필요해요.');
}

function webOrigin(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new TypeError('게임이나 앱의 웹 origin을 확인해 주세요.');
  }
  return url.origin;
}

export function createRewardAdapter({ database, gameOrigin = DEFAULT_GAME_ORIGIN, dropsPerWin = 1, fetchImpl = fetch }) {
  if (!Number.isSafeInteger(dropsPerWin) || dropsPerWin < 1) throw new RangeError('물방울 수량은 양의 정수여야 해요.');
  const origin = webOrigin(gameOrigin);
  const verificationUrl = new URL('/api/results/verify', origin);
  // The wallet table name matches the previously shipped shepherd game.
  // Both adapters can share the same app database and member balance.
  database.exec(`
    CREATE TABLE IF NOT EXISTS egg_app_launches (
      launch_id TEXT PRIMARY KEY, member_id TEXT NOT NULL, secret_hex TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS egg_launch_member ON egg_app_launches(member_id, created_at);
    CREATE TABLE IF NOT EXISTS egg_app_reward_ledger (
      result_id TEXT PRIMARY KEY, member_id TEXT NOT NULL, round_id TEXT NOT NULL,
      launch_id TEXT NOT NULL, completed_at INTEGER NOT NULL, drops INTEGER NOT NULL,
      UNIQUE(member_id, round_id)
    );
    CREATE TABLE IF NOT EXISTS shepherd_app_wallets (
      member_id TEXT PRIMARY KEY, drops INTEGER NOT NULL DEFAULT 0
    );
  `);
  const insertLaunch = database.prepare('INSERT INTO egg_app_launches (launch_id,member_id,secret_hex,created_at) VALUES (?,?,?,?)');
  const lookup = database.prepare('SELECT secret_hex FROM egg_app_launches WHERE member_id=? AND launch_id=?');
  const launches = database.prepare('SELECT launch_id FROM egg_app_launches WHERE member_id=? ORDER BY created_at DESC');
  const wallet = database.prepare('SELECT drops FROM shepherd_app_wallets WHERE member_id=?');
  const insertCredit = database.prepare(`
    INSERT INTO egg_app_reward_ledger(result_id,member_id,round_id,launch_id,completed_at,drops)
    VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING
  `);
  const creditWallet = database.prepare(`
    INSERT INTO shepherd_app_wallets(member_id,drops) VALUES (?,?)
    ON CONFLICT(member_id) DO UPDATE SET drops=drops+excluded.drops
  `);

  function createLaunch(memberId, parentOrigin) {
    const owner = ownerId(memberId);
    const secret = randomBytes(32);
    const launchId = createHash('sha256').update(secret).digest('hex');
    const gameUrl = new URL('/', origin);
    const fragment = new URLSearchParams({ launch: launchId });
    if (parentOrigin) fragment.set('parentOrigin', webOrigin(parentOrigin));
    gameUrl.hash = fragment.toString();
    insertLaunch.run(launchId, owner, secret.toString('hex'), Date.now());
    return { launchId, gameUrl: gameUrl.href };
  }

  function getBalance(memberId) {
    return wallet.get(ownerId(memberId))?.drops ?? 0;
  }

  function listLaunchIds(memberId) {
    return launches.all(ownerId(memberId)).map(row => row.launch_id);
  }

  async function collectRewards(memberId, launchId, roundId) {
    const owner = ownerId(memberId);
    if (typeof launchId !== 'string' || !PUBLIC_LAUNCH.test(launchId) ||
        (roundId !== undefined && (typeof roundId !== 'string' || !UUID.test(roundId)))) {
      throw failure(400, '게임 실행 정보를 확인해 주세요.');
    }
    const launch = lookup.get(owner, launchId);
    if (!launch) throw failure(404, '이 참가자의 게임 실행 기록을 찾지 못했어요.');

    const verified = [];
    let after = 0;
    while (true) {
      let page;
      try {
        const response = await fetchImpl(verificationUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ launchSecret: launch.secret_hex, roundId, after }),
          cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error();
        page = await response.json();
      } catch {
        throw failure(502, '게임 서버에서 완주 기록을 확인하지 못했어요. 다시 시도해 주세요.');
      }
      if (page?.gameId !== GAME_ID || !Array.isArray(page.results)) throw failure(502, '게임 결과 형식이 올바르지 않아요.');
      for (const result of page.results) {
        if (typeof result?.resultId !== 'string' || !UUID.test(result.resultId) ||
            typeof result.roundId !== 'string' || !UUID.test(result.roundId) ||
            (roundId !== undefined && result.roundId !== roundId) ||
            (result.launchId !== undefined && result.launchId !== launchId) ||
            result.completedStages !== 3 || result.goals !== 5 ||
            !Number.isSafeInteger(result.completedAt) || result.completedAt <= 0) {
          throw failure(502, '세 코스를 모두 완주한 기록인지 확인할 수 없어요.');
        }
        verified.push(result);
      }
      if (page.nextCursor == null) break;
      if (!Number.isSafeInteger(page.nextCursor) || page.nextCursor <= after) throw failure(502, '결과 목록을 다시 확인해 주세요.');
      after = page.nextCursor;
    }

    database.exec('BEGIN IMMEDIATE');
    try {
      let awardedDrops = 0;
      for (const result of verified) {
        const inserted = insertCredit.run(result.resultId, owner, result.roundId, launchId, result.completedAt, dropsPerWin);
        if (inserted.changes === 1) awardedDrops += dropsPerWin;
      }
      if (awardedDrops > 0) creditWallet.run(owner, awardedDrops);
      const balance = getBalance(owner);
      database.exec('COMMIT');
      const status = awardedDrops > 0 ? 'awarded' : verified.length ? 'already_awarded' : 'pending';
      return { status, awardedDrops, balance };
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
  return { createLaunch, collectRewards, getBalance, listLaunchIds };
}
