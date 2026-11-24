import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { findGame } from "@/games/registry";
import { db, one } from "@/lib/db";
import { completeMissionIn, lockChild, missionsForChild } from "@/lib/game";
import { addDays, todayKst, weekStart } from "@/lib/time";
import { eggResults } from "./egg-game";

/**
 * Mission games that run on their own game server ("hosted" games in src/games/registry.ts).
 *
 * How a finished game becomes drops, and why the browser is never believed:
 *
 * 1. The child opens the mission. This server makes a launch: 32 random bytes it keeps (the secret)
 *    and their SHA-256 (the launch id), tied to the signed-in child and the mission. Only the launch
 *    id goes to the browser, inside the game's address.
 * 2. The game server plays the game itself: the phones only send the joystick, the server moves the
 *    sheep and decides when the game is finished. It then records "this launch finished this round".
 * 3. The game tells the page it is finished (a message to the frame's parent). That message is only a
 *    hint. This server asks the game server, with the secret, which rounds the launch really finished.
 * 4. Each finished round is written once (game_results) together with the mission completion, in one
 *    transaction with the child locked. Drops, points, the weekly cap and "once a week" all come from
 *    the mission, exactly as for every other mission (completeMissionIn in src/lib/game.ts).
 *
 * So a repeated message, two phones, a refresh or a lost answer cannot pay twice, and closing the
 * app right after the last sheep loses nothing: the next visit asks again (catchUpGames).
 *
 * Another game, alone or together, with another finishing rule, is one more entry in HOSTED and in
 * the registry. The game server can also be this app itself (HostedServer.own: 〈달걀 홀인원〉, whose
 * rounds are kept in this app's database by src/lib/kid/egg-game.ts); everything above stays the same,
 * only the question in step 3 is asked without the network. A hosted game server must speak this
 * small protocol:
 * - address: <origin>/#launch=<launch id>&parentOrigin=<this app's origin>
 * - when finished: window.parent.postMessage({ type: "dreamforest.minigame.completed", version: 1,
 *   gameId, launchId, roundId }, parentOrigin)
 * - POST <origin>/api/results/verify  { launchSecret, roundId?, after }  ->
 *   { gameId, results: [{ resultId, roundId, completedAt (epoch ms), ... }], nextCursor? }
 */
export interface HostedServer {
  /** Environment variable that moves the game to another address (a self-hosted copy, a local test server). */
  originEnv: string;
  /** Where the game server is; null for a game this app serves itself (see `own`). */
  defaultOrigin: string | null;
  /** The id the game server calls itself in its message and its answers. */
  remoteId: string;
  /** The finishing rule: true when a result the game server returned is a finished game. */
  finished(result: Record<string, unknown>): boolean;
  /**
   * A game this app serves itself: this app is its game server. `page` is where the game is shown
   * from, at the app's own address; `results` answers what "POST /api/results/verify" would, without
   * going over the network. Used unless the environment variable moves the game elsewhere.
   */
  own?: {
    page: string;
    results(launchSecret: string, roundId: string | undefined, after: number): Promise<unknown>;
  };
}

export const HOSTED: Record<string, HostedServer> = {
  "shepherd-coop": {
    originEnv: "SHEPHERD_GAME_ORIGIN",
    defaultOrigin: "https://dreamforest-shepherd-trail.sanji574633.chatgpt.site",
    remoteId: "shepherd-coop",
    // All six sheep are in the church.
    finished: (r) => r.savedCount === 6,
  },
  "egg-hole-in-one": {
    originEnv: "EGG_GAME_ORIGIN",
    defaultOrigin: null,
    remoteId: "egg-hole-in-one",
    // All three courses, five eggs in the baskets (two, two and one).
    finished: (r) => r.completedStages === 3 && r.goals === 5,
    own: { page: "/minigames/egg-hole-in-one/index.html", results: eggResults },
  },
};

const HEX64 = /^[0-9a-f]{64}$/;
/** After a child was last in the game, a round already under way can still end for this long. */
const SETTLE_MINUTES = 15;
const VERIFY_TIMEOUT_MS = 8000;
const MAX_PAGES = 20;
/** The game server's clock and ours may differ a little. */
const CLOCK_SLACK_MS = 10 * 60_000;

export interface HostedDeps {
  fetchImpl?: typeof fetch;
  now?: Date;
}

/** Scheme, host and port only; anything else in the configured address is a mistake. */
function exactOrigin(value: string): string | null {
  try {
    const u = new URL(value);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || u.search || u.hash || u.pathname !== "/") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * The game server's address when the game lives somewhere else. Null when the game is unknown, its
 * address is not usable, or this app serves it itself (HostedServer.own).
 */
export function gameOrigin(gameId: string): string | null {
  const server = HOSTED[gameId];
  if (!server) return null;
  const configured = process.env[server.originEnv]?.trim() || server.defaultOrigin;
  return configured ? exactOrigin(configured) : null;
}

/** True when this app is the game's server now: it has its own copy, and nothing moved the game elsewhere. */
function servedHere(server: HostedServer): boolean {
  return server.own !== undefined && !process.env[server.originEnv]?.trim();
}

export interface Launch {
  launchId: string;
  /** The address to show in the frame. */
  gameUrl: string;
  gameOrigin: string;
  /** The game server's own id, as it appears in the "finished" message. */
  remoteId: string;
}

/**
 * The child's launch for a hosted game mission: made on the first visit of the week, the same one
 * afterwards (so a refresh returns to the same room). Null when the mission is not a hosted game the
 * child can open now. A mission the child has already done can still be opened, to help a friend;
 * finishing it again gives nothing more.
 */
export async function openLaunch(childId: number, missionId: number, parentOrigin: string, date: string = todayKst()): Promise<Launch | null> {
  if (!Number.isInteger(missionId)) return null;
  const m = (await missionsForChild(db, childId, date)).find((x) => x.id === missionId);
  if (!m || m.kind !== "game") return null;
  const game = findGame(m.game_id);
  const server = game ? HOSTED[game.id] : undefined;
  const parent = exactOrigin(parentOrigin);
  if (!game || game.host !== "hosted" || !server || !parent) return null;
  // A game this app serves itself is shown from the app's own address, the one the child is at.
  const here = servedHere(server);
  const origin = here ? parent : gameOrigin(game.id);
  if (!origin) return null;

  const secret = randomBytes(32);
  const fresh = createHash("sha256").update(secret).digest("hex");
  // The first visit of the week keeps this secret; later visits only note that the child is here again.
  const rows = await db.query<{ launch_id: string }>(
    `insert into game_launches (launch_id, child_id, mission_id, game_id, secret_hex, week_start) values ($1,$2,$3,$4,$5,$6)
     on conflict (child_id, mission_id, game_id, week_start) do update set opened_at = now()
     returning launch_id`,
    [fresh, childId, m.id, game.id, secret.toString("hex"), weekStart(date)],
  );
  const launchId = rows[0].launch_id;
  const url = new URL(here && server.own ? server.own.page : "/", origin);
  url.hash = new URLSearchParams({ launch: launchId, parentOrigin: parent }).toString();
  return { launchId, gameUrl: url.href, gameOrigin: origin, remoteId: server.remoteId };
}

interface Verified {
  resultId: string;
  roundId: string;
  completedAt: number;
}

class VerifyError extends Error {}

const isId = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && v.length <= 256;

/** One page of a game server's answer to "which rounds did this launch finish?". */
type Ask = (secretHex: string, roundId: string | undefined, after: number) => Promise<unknown>;

/** Asking a game server somewhere else, over the network. */
function askOver(origin: string, fetchImpl: typeof fetch): Ask {
  const url = new URL("/api/results/verify", origin);
  return async (launchSecret, roundId, after) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ launchSecret, roundId, after }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json();
  };
}

/** Asks the game server which rounds a launch finished. Throws VerifyError when it cannot be trusted or reached. */
async function finishedRounds(server: HostedServer, ask: Ask, secretHex: string, roundId: string | undefined): Promise<Verified[]> {
  const out: Verified[] = [];
  let after = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    let data: { gameId?: unknown; results?: unknown; nextCursor?: unknown };
    try {
      data = (await ask(secretHex, roundId, after)) as typeof data;
    } catch {
      throw new VerifyError("unreachable");
    }
    if (data?.gameId !== server.remoteId || !Array.isArray(data.results)) throw new VerifyError("bad answer");
    for (const r of data.results as Record<string, unknown>[]) {
      if (!r || !isId(r.resultId) || !isId(r.roundId) || !Number.isSafeInteger(r.completedAt) || (r.completedAt as number) <= 0 || !server.finished(r) || (roundId !== undefined && r.roundId !== roundId)) {
        throw new VerifyError("bad result");
      }
      out.push({ resultId: r.resultId, roundId: r.roundId, completedAt: r.completedAt as number });
    }
    if (data.nextCursor == null) return out;
    if (!Number.isSafeInteger(data.nextCursor) || (data.nextCursor as number) <= after) throw new VerifyError("bad cursor");
    after = data.nextCursor as number;
  }
  throw new VerifyError("too many pages");
}

export interface ClaimResult {
  /**
   * - awarded: a finished game was recorded now and completed the mission.
   * - already: the game server confirms a finished game, and it was recorded before (or the mission
   *   had nothing left to give: the child was helping a friend).
   * - nothing: the game server has no finished game for this launch (still playing, or time ran out).
   * - not_yours: the launch does not belong to this child.
   * - retry: the game server could not be asked just now; the same request can be sent again.
   */
  status: "awarded" | "already" | "nothing" | "not_yours" | "retry";
  /** The mission completion to show: the new one, or the earlier one of the same rounds. */
  completionId: number | null;
  /** Drops given by this request. */
  drops: number;
  /**
   * True when this request wrote a finished game down for the first time. A game that restores an
   * old room says "finished" again for a round long since recorded: that is not news.
   */
  fresh: boolean;
}

const NONE = { completionId: null, drops: 0, fresh: false } as const;

interface LaunchRow {
  launch_id: string;
  child_id: number;
  mission_id: number;
  game_id: string;
  secret_hex: string;
  created_at: Date;
}

async function settle(launch: LaunchRow, roundId: string | undefined, present: boolean, deps: HostedDeps): Promise<ClaimResult> {
  const server = HOSTED[launch.game_id];
  if (!server) return { status: "retry", ...NONE };
  // This app's own game is asked directly; a game somewhere else, over the network.
  const origin = gameOrigin(launch.game_id);
  const ask: Ask | null = servedHere(server) && server.own ? server.own.results : origin ? askOver(origin, deps.fetchImpl ?? fetch) : null;
  if (!ask) return { status: "retry", ...NONE };
  const now = deps.now ?? new Date();
  let rounds: Verified[];
  try {
    rounds = await finishedRounds(server, ask, launch.secret_hex, roundId);
    // A finished game cannot be older than its launch or lie in the future.
    const earliest = new Date(launch.created_at).getTime() - CLOCK_SLACK_MS;
    if (rounds.some((r) => r.completedAt < earliest || r.completedAt > now.getTime() + CLOCK_SLACK_MS)) throw new VerifyError("bad time");
  } catch (e) {
    if (e instanceof VerifyError) return { status: "retry", ...NONE };
    throw e;
  }
  rounds.sort((a, b) => a.completedAt - b.completedAt);

  return db.tx(async (q) => {
    await lockChild(q, launch.child_id);
    // The game server answered: note it, so the next visit does not have to ask again for nothing.
    await q.query(`update game_launches set checked_at = $2${present ? ", opened_at = $2" : ""} where launch_id = $1`, [launch.launch_id, now]);
    if (rounds.length === 0) return { status: "nothing", ...NONE } as const;

    let completionId: number | null = null;
    let drops = 0;
    let awarded = false;
    let fresh = false;
    for (const r of rounds) {
      const added = await q.query<{ id: number }>(
        `insert into game_results (game_id, result_id, round_id, child_id, mission_id, launch_id, completed_at) values ($1,$2,$3,$4,$5,$6,$7)
         on conflict do nothing returning id`,
        [launch.game_id, r.resultId, r.roundId, launch.child_id, launch.mission_id, launch.launch_id, new Date(r.completedAt)],
      );
      if (added.length === 0) continue; // recorded before: never a second completion
      fresh = true;
      // The mission must still be this game (the admin may have switched games during the week).
      const m = await one<{ kind: string; game_id: string | null }>(q, "select kind, game_id from missions where id = $1", [launch.mission_id]);
      if (!m || m.kind !== "game" || m.game_id !== launch.game_id) continue;
      // The game counts for the day it was finished, so a win found on a later visit still belongs to its own week.
      const done = await completeMissionIn(q, launch.child_id, launch.mission_id, { verified: true, date: todayKst(new Date(r.completedAt)) });
      if (!done.ok) continue; // already done that week, or the mission was closed that day: the game stays recorded, nothing is given
      await q.query("update game_results set completion_id = $2 where id = $1", [added[0].id, done.completionId]);
      completionId = done.completionId;
      drops += done.drops;
      awarded = true;
    }
    if (awarded) return { status: "awarded", completionId, drops, fresh } as const;
    const earlier = await one<{ completion_id: number }>(
      q,
      "select completion_id from game_results where child_id = $1 and game_id = $2 and round_id = any($3::text[]) and completion_id is not null order by id desc limit 1",
      [launch.child_id, launch.game_id, rounds.map((r) => r.roundId)],
    );
    return { status: "already", completionId: earlier?.completion_id ?? null, drops: 0, fresh } as const;
  });
}

/**
 * The page says the game is finished (or simply asks). Nothing in the request is believed except
 * which launch is meant, and that launch must belong to the signed-in child.
 */
export async function claimWin(childId: number, launchId: unknown, roundId: unknown, deps: HostedDeps = {}): Promise<ClaimResult> {
  if (typeof launchId !== "string" || !HEX64.test(launchId)) return { status: "not_yours", ...NONE };
  if (roundId !== undefined && roundId !== null && !(typeof roundId === "string" && roundId !== "" && roundId.length <= 100)) return { status: "nothing", ...NONE };
  const launch = await one<LaunchRow>(db, "select launch_id, child_id, mission_id, game_id, secret_hex, created_at from game_launches where launch_id = $1 and child_id = $2", [launchId, childId]);
  if (!launch) return { status: "not_yours", ...NONE };
  return settle(launch, typeof roundId === "string" ? roundId : undefined, true, deps);
}

const openCondition = `week_start >= $2 and (checked_at is null or checked_at < opened_at + interval '${SETTLE_MINUTES} minutes')`;

/** True when the child was in a hosted game lately and the game server has not been asked since: worth a catch-up. */
export async function hasUnsettledGame(childId: number, today: string = todayKst()): Promise<boolean> {
  return (await one(db, `select 1 as x from game_launches where child_id = $1 and ${openCondition} limit 1`, [childId, addDays(weekStart(today), -7)])) !== null;
}

/**
 * Picks up finished games whose "finished" message never arrived: the app was closed right after
 * the last sheep, the connection dropped, or the friend finished the round alone. Looks at this
 * week's and last week's launches (the game server keeps results for seven days).
 */
export async function catchUpGames(childId: number, deps: HostedDeps = {}, today: string = todayKst()): Promise<{ completionId: number | null; drops: number }> {
  const launches = await db.query<LaunchRow>(
    `select launch_id, child_id, mission_id, game_id, secret_hex, created_at from game_launches where child_id = $1 and ${openCondition} order by created_at desc limit 6`,
    [childId, addDays(weekStart(today), -7)],
  );
  let completionId: number | null = null;
  let drops = 0;
  for (const launch of launches) {
    const r = await settle(launch, undefined, false, deps);
    if (r.status !== "awarded") continue;
    completionId = completionId ?? r.completionId;
    drops += r.drops;
  }
  return { completionId, drops };
}
