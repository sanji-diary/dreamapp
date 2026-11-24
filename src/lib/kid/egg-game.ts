import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, one } from "@/lib/db";
// The game's own judge: the same code the game's page and its stand-alone server use (games/egg-hole-in-one).
import { isCompleteRound } from "../../../games/egg-hole-in-one/rounds.mjs";

/**
 * The game server of 〈달걀 홀인원〉, inside this app.
 *
 * The game is one child's: drag and let go to throw an egg; two goals on each of the first two
 * courses and one on the third finish it. Its page (games/egg-hole-in-one/public) is served by this
 * app at /minigames/egg-hole-in-one/, and the three things its server does are done here, on this
 * app's own database, with the same answers as games/egg-hole-in-one/rounds.mjs:
 *
 * - openEggRound: a round starts. The phone gets a ticket; only its SHA-256 is kept.
 * - finishEggRound: the phone sends the ticket and every throw. The throws are played through again
 *   by the game's judge (isCompleteRound); only a round that really ends with all three courses done
 *   gets a result id, once. A phone cannot simply say "I finished".
 * - eggResults: which finished rounds belong to a launch. Asked with the launch's secret, which
 *   never leaves this server (src/lib/kid/hosted-game.ts keeps it), so only this app can ask.
 *
 * A round opened from a mission carries the child's launch id; a round opened by the game's own
 * address has none and can never be paid. Paying is not done here: hosted-game.ts turns a finished
 * round into the mission's drops and points, once.
 */
export const EGG_GAME_ID = "egg-hole-in-one";

const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HOUR = 3_600_000;
/** A round can be finished for this long after it starts. */
const ROUND_HOURS = 24;
/** A finished round is kept this long, so a win found on a later visit can still be counted. */
const RESULT_DAYS = 90;
const PAGE = 50;

/** SHA-256 of the bytes a hex string stands for, as hex: how a ticket or a launch secret is kept and looked up. */
const digest = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");

export interface EggAnswer {
  status: number;
  body: Record<string, unknown>;
}
const answer = (body: Record<string, unknown>, status = 200): EggAnswer => ({ status, body });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** POST …/api/rounds { rulesVersion?, launchId? } -> 201 { roundId, token, rulesVersion } */
export async function openEggRound(input: unknown, now: Date = new Date()): Promise<EggAnswer> {
  if (!isObject(input)) return answer({ error: "invalid_json" }, 400);
  const launch = input.launchId ?? null;
  if (launch !== null && (typeof launch !== "string" || !HEX64.test(launch))) return answer({ error: "invalid_launch" }, 400);
  // The game's page sends 2. A page loaded before the courses changed sends nothing and keeps the first courses.
  const rulesVersion = input.rulesVersion ?? 1;
  if (rulesVersion !== 1 && rulesVersion !== 2) return answer({ error: "unsupported_rules" }, 400);
  // A launch id must be one this app gave out for this game; anything else is not a launch.
  if (launch !== null && !(await one(db, "select 1 as x from game_launches where launch_id = $1 and game_id = $2", [launch, EGG_GAME_ID]))) {
    return answer({ error: "invalid_launch" }, 400);
  }
  const roundId = randomUUID();
  const token = randomBytes(32).toString("hex");
  await db.query("delete from egg_rounds where expires_at <= $1", [now]);
  await db.query("insert into egg_rounds (round_id, token_hash, launch_id, rules_version, expires_at) values ($1,$2,$3,$4,$5)", [roundId, digest(token), launch, rulesVersion, new Date(now.getTime() + ROUND_HOURS * HOUR)]);
  return answer({ roundId, token, rulesVersion }, 201);
}

/** POST …/api/rounds/<roundId>/finish { token, shots } -> { roundId, resultId, completedAt, verified: true } */
export async function finishEggRound(roundId: string, input: unknown, now: Date = new Date()): Promise<EggAnswer> {
  if (!UUID.test(roundId)) return answer({ error: "unknown_route" }, 404);
  if (!isObject(input)) return answer({ error: "invalid_json" }, 400);
  if (typeof input.token !== "string" || !HEX64.test(input.token)) return answer({ error: "invalid_ticket" }, 403);
  const row = await one<{ token_hash: string; result_id: string | null; completed_at: Date | null; rules_version: number }>(
    db,
    "select token_hash, result_id, completed_at, rules_version from egg_rounds where round_id = $1 and expires_at > $2",
    [roundId, now],
  );
  if (!row || row.token_hash !== digest(input.token)) return answer({ error: "invalid_ticket" }, 403);
  const done = (resultId: string, at: Date) => answer({ roundId, resultId, completedAt: new Date(at).getTime(), verified: true });
  // Sent again (a retry, a second tap): the same answer, nothing new.
  if (row.result_id && row.completed_at) return done(row.result_id, row.completed_at);
  if (!isCompleteRound(input.shots, row.rules_version)) return answer({ error: "course_incomplete" }, 422);
  // Two requests at once: only the first writes; both read what was written.
  await db.query("update egg_rounds set result_id = $2, completed_at = $3, expires_at = $4 where round_id = $1 and result_id is null", [roundId, randomUUID(), now, new Date(now.getTime() + RESULT_DAYS * 24 * HOUR)]);
  const saved = await one<{ result_id: string; completed_at: Date }>(db, "select result_id, completed_at from egg_rounds where round_id = $1", [roundId]);
  if (!saved?.result_id) return answer({ error: "invalid_ticket" }, 403);
  return done(saved.result_id, saved.completed_at);
}

export interface EggResults {
  gameId: string;
  results: { roundId: string; resultId: string; completedAt: number; goals: number; completedStages: number }[];
  nextCursor: number | null;
}

/**
 * The finished rounds of a launch, oldest first, in the shape every hosted game server answers
 * "POST /api/results/verify" with. Only someone holding the launch's secret can ask.
 */
export async function eggResults(launchSecret: string, roundId?: string, after: number = 0, now: Date = new Date()): Promise<EggResults> {
  if (!HEX64.test(launchSecret) || (roundId !== undefined && !UUID.test(roundId)) || !Number.isSafeInteger(after) || after < 0) {
    return { gameId: EGG_GAME_ID, results: [], nextCursor: null };
  }
  const rows = await db.query<{ seq: number; round_id: string; result_id: string; completed_at: Date }>(
    `select seq, round_id, result_id, completed_at from egg_rounds
      where launch_id = $1 and result_id is not null and expires_at > $2 and seq > $3 and ($4::text is null or round_id = $4)
      order by seq limit ${PAGE + 1}`,
    [digest(launchSecret), now, after, roundId ?? null],
  );
  return {
    gameId: EGG_GAME_ID,
    // A result exists only for a round the judge saw through to the end: five goals over three courses.
    results: rows.slice(0, PAGE).map((r) => ({ roundId: r.round_id, resultId: r.result_id, completedAt: new Date(r.completed_at).getTime(), goals: 5, completedStages: 3 })),
    nextCursor: rows.length > PAGE ? rows[PAGE - 1].seq : null,
  };
}
