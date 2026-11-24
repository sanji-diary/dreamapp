import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

const signedIn = { id: 0 };
vi.mock("@/lib/auth", () => ({ requireKid: async () => ({ id: signedIn.id, onboarded_at: "2027-01-01" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

// The game's own judge and courses: the throws below are found by the game itself, not made up here.
import { guide } from "../games/egg-hole-in-one/public/physics.mjs";
import { GET, POST } from "@/app/minigames/egg-hole-in-one/[[...path]]/route";
import { findGame, GAMES } from "@/games/registry";
import { db, one, resetDbForTests } from "@/lib/db";
import { dropBalance, missionsForChild, pointBalance } from "@/lib/game";
import { eggResults, finishEggRound, openEggRound } from "@/lib/kid/egg-game";
import { catchUpGames, claimWin, gameOrigin, hasUnsettledGame, HOSTED, openLaunch } from "@/lib/kid/hosted-game";
import { catchUpGamesAction, claimGameAction } from "@/lib/kid/mission-actions";
import { missionFormOptions } from "@/lib/staff/mission-options";
import { addDays, todayKst, weekStart } from "@/lib/time";

const APP = "https://app.test";
const HOME = `${APP}/minigames/egg-hole-in-one`;
const TODAY = todayKst();
const WS = weekStart(TODAY);
const DAY = 86_400_000;

interface Shot {
  vx: number;
  vy: number;
  phase: number;
}
/** Five throws that go in: two on the first course, two on the second, one on the third. */
const win = (): Shot[] => [0, 0, 1, 1, 2].map((stage, i) => guide(stage, i * 1.2, 0, i % 2) as Shot);
const miss: Shot = { vx: 45, vy: -60, phase: 0 };

/** The phone's browser talking to the game as this app serves it: the real route. */
async function page(file: string, headers: Record<string, string> = {}) {
  const parts = file === "" ? [] : file.split("/");
  return GET(new Request(`${HOME}/${file}`, { headers }), { params: Promise.resolve({ path: parts }) });
}
async function gamePost(file: string, body: unknown) {
  const res = await POST(new Request(`${HOME}/${file}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ path: file.split("/") }) });
  return { http: res.status, ...((await res.json()) as { roundId?: string; token?: string; rulesVersion?: number; resultId?: string; completedAt?: number; verified?: boolean; error?: string }) };
}
/** Starts a round the way the game's page does, and returns its ticket. */
async function startRound(launchId?: string) {
  const r = await gamePost("api/rounds", { rulesVersion: 2, ...(launchId ? { launchId } : {}) });
  expect(r.http).toBe(201);
  return { roundId: r.roundId!, token: r.token! };
}
const finish = (round: { roundId: string; token: string }, shots: Shot[]) => gamePost(`api/rounds/${round.roundId}/finish`, { token: round.token, shots });

async function setup() {
  resetDbForTests();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade) values ('5학년 2반', 5) returning id");
  const kids = await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('하늘', $1, 't1'), ('바다', $1, 't2') returning id", [cls[0].id]);
  const mission = (
    await db.query<{ id: number }>("insert into missions (title, kind, drops, points, repeat, starts_on, ends_on, game_id) values ('부활절 미션게임','game',2,10,'weekly',$1,$2,'egg-hole-in-one') returning id", [WS, addDays(WS, 6)])
  )[0].id;
  signedIn.id = kids[0].id;
  return { a: kids[0].id, b: kids[1].id, mission };
}
const stateOf = async (child: number, mission: number) => (await missionsForChild(db, child, TODAY)).find((m) => m.id === mission)?.state;
const count = async (sql: string, params: unknown[] = []) => (await one<{ n: number }>(db, sql, params))!.n;
/** What the child's wallet holds, and how many times a mission paid into it. */
const wallet = async (child: number) => ({
  drops: await dropBalance(db, child),
  points: await pointBalance(db, child),
  payments: await count("select count(*)::int as n from drop_ledger where child_id = $1 and ref_type = 'mission'", [child]),
});

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  delete process.env.EGG_GAME_ORIGIN;
  s = await setup();
});
afterEach(() => {
  delete process.env.EGG_GAME_ORIGIN;
});

describe("달걀 홀인원 in the game list", () => {
  it("stands next to the sheep game, for one child, with this app as its game server", async () => {
    const ids = GAMES.map((g) => g.id);
    expect(ids.indexOf("egg-hole-in-one")).toBe(ids.indexOf("shepherd-coop") + 1);
    expect(findGame("egg-hole-in-one")).toMatchObject({ title: "달걀 홀인원", host: "hosted", players: 1 });
    expect(HOSTED["egg-hole-in-one"]).toMatchObject({ remoteId: "egg-hole-in-one", defaultOrigin: null });
    expect(HOSTED["egg-hole-in-one"].own?.page).toBe("/minigames/egg-hole-in-one/index.html");
    // Served here, so there is no other address to go to.
    expect(gameOrigin("egg-hole-in-one")).toBeNull();
    // The admin can pick it for a game mission.
    expect((await missionFormOptions()).games.map((g) => g.id)).toContain("egg-hole-in-one");
    // Finished means all three courses and five goals, nothing less.
    const { finished } = HOSTED["egg-hole-in-one"];
    expect(finished({ completedStages: 3, goals: 5 })).toBe(true);
    expect(finished({ completedStages: 2, goals: 4 })).toBe(false);
    expect(finished({ savedCount: 6 })).toBe(false);
  });

  it("opens from the mission at the app's own address, with only the launch id in it", async () => {
    const launch = await openLaunch(s.a, s.mission, APP);
    expect(launch).toMatchObject({ gameOrigin: APP, remoteId: "egg-hole-in-one" });
    const url = new URL(launch!.gameUrl);
    expect(url.origin + url.pathname).toBe(`${HOME}/index.html`);
    const fragment = new URLSearchParams(url.hash.slice(1));
    expect([...fragment.keys()]).toEqual(["launch", "parentOrigin"]);
    expect(fragment.get("launch")).toBe(launch!.launchId);
    expect(fragment.get("parentOrigin")).toBe(APP);
    // The secret stays on the server: the address holds its SHA-256, not the secret.
    const row = await one<{ secret_hex: string }>(db, "select secret_hex from game_launches where launch_id = $1", [launch!.launchId]);
    expect(launch!.gameUrl).not.toContain(row!.secret_hex);
    // Opening it again in the same week is the same launch.
    expect((await openLaunch(s.a, s.mission, APP))!.launchId).toBe(launch!.launchId);
  });
});

describe("the game's page, served by this app", () => {
  it("sends the game's own files, and nothing else", async () => {
    const html = await page("index.html");
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(await html.text()).toContain("달걀 홀인원");
    for (const file of ["game.mjs", "physics.mjs", "art.mjs", "style.css"]) {
      const res = await page(file);
      expect(res.status).toBe(200);
      expect(Buffer.from(await res.arrayBuffer()).equals(fs.readFileSync(path.join("games", "egg-hole-in-one", "public", file)))).toBe(true);
    }
    expect((await page("game.mjs")).headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    // Unchanged files are answered "not modified".
    const etag = html.headers.get("etag")!;
    expect((await page("index.html", { "if-none-match": etag })).status).toBe(304);
    // The bare folder goes to the page; anything that is not one of the game's files is not found.
    const bare = await page("");
    expect(bare.status).toBe(307);
    expect(bare.headers.get("location")).toBe(`${HOME}/index.html`);
    for (const file of ["nothing.html", "../rounds.mjs", "../../package.json", "api/rounds"]) expect((await page(file)).status).toBe(404);
  });

  it("asks for its server by relative address, so it works from this folder", () => {
    const source = fs.readFileSync(path.join("games", "egg-hole-in-one", "public", "game.mjs"), "utf8");
    expect(source).toContain("post('api/rounds'");
    expect(source).not.toContain("post('/api");
  });
});

describe("a round of 달걀 홀인원", () => {
  it("is finished only with its ticket and throws that really go in, and gets one result", async () => {
    const round = await startRound();
    expect((await finish({ ...round, token: "0".repeat(64) }, win())).http).toBe(403);
    expect((await finish(round, [])).http).toBe(422);
    expect((await finish(round, win().slice(0, 4))).http).toBe(422); // the third course is missing
    expect((await finish(round, [miss, miss, miss, miss, miss])).http).toBe(422);
    expect((await finish(round, [...win(), miss])).http).toBe(422);
    const answers = await Promise.all([1, 2, 3].map(() => finish(round, win())));
    expect(answers[0]).toMatchObject({ http: 200, verified: true, roundId: round.roundId });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
    // Misses on the way are fine: up to two before each goal are sent along.
    const second = await startRound();
    expect((await finish(second, win().flatMap((shot) => [miss, miss, shot]))).http).toBe(200);
    expect(await count("select count(*)::int as n from egg_rounds where result_id is not null")).toBe(2);
  });

  it("turns away what is not a round", async () => {
    expect((await gamePost("api/rounds", { rulesVersion: 9 })).http).toBe(400);
    expect((await gamePost("api/rounds", { launchId: "incorrect" })).http).toBe(400);
    // A launch id this app never gave out.
    expect(await gamePost("api/rounds", { rulesVersion: 2, launchId: "ab".repeat(32) })).toMatchObject({ http: 400, error: "invalid_launch" });
    expect((await gamePost("api/rounds", "not json")).http).toBe(400);
    expect((await gamePost("api/rounds", JSON.stringify({ pad: "x".repeat(9000) }))).http).toBe(413);
    expect((await gamePost("api/rounds/not-a-round/finish", { token: "0".repeat(64), shots: win() })).http).toBe(404);
    expect((await gamePost("api/results/verify", { launchSecret: "f".repeat(64) })).http).toBe(404); // only this server asks, never the network
    expect(await count("select count(*)::int as n from egg_rounds")).toBe(0);
  });

  it("can be finished for a day, and a finished round is kept for ninety", async () => {
    const launch = (await openLaunch(s.a, s.mission, APP))!;
    const secret = (await one<{ secret_hex: string }>(db, "select secret_hex from game_launches where launch_id = $1", [launch.launchId]))!.secret_hex;
    const now = new Date();
    const late = (await openEggRound({ rulesVersion: 2, launchId: launch.launchId }, now)).body as { roundId: string; token: string };
    expect((await finishEggRound(late.roundId, { token: late.token, shots: win() }, new Date(now.getTime() + DAY + 1000))).status).toBe(403);
    const kept = (await openEggRound({ rulesVersion: 2, launchId: launch.launchId }, now)).body as { roundId: string; token: string };
    expect((await finishEggRound(kept.roundId, { token: kept.token, shots: win() }, new Date(now.getTime() + DAY - 1000))).status).toBe(200);
    expect((await eggResults(secret, undefined, 0, new Date(now.getTime() + 89 * DAY))).results).toHaveLength(1);
    expect((await eggResults(secret, undefined, 0, new Date(now.getTime() + 92 * DAY))).results).toHaveLength(0);
    // Asked with anything but the launch's secret, there is nothing to see.
    expect((await eggResults("f".repeat(64))).results).toEqual([]);
    expect((await eggResults(launch.launchId)).results).toEqual([]);
  });
});

describe("a finished game becomes drops, once", () => {
  it("a child opens the game from the mission, puts five eggs in, and the mission pays into the wallet", async () => {
    // The wallet already holds something: a gift from a teacher.
    await db.query("insert into drop_ledger (child_id, delta, reason, ref_type) values ($1, 3, '선물', 'gift')", [s.a]);
    expect(await wallet(s.a)).toEqual({ drops: 3, points: 0, payments: 0 });

    const launch = (await openLaunch(s.a, s.mission, APP))!;
    const round = await startRound(launch.launchId);
    // Asked before the game is finished: nothing yet.
    expect(await claimWin(s.a, launch.launchId, round.roundId)).toMatchObject({ status: "nothing", drops: 0 });
    expect((await finish(round, win())).verified).toBe(true);

    const r = await claimWin(s.a, launch.launchId, round.roundId);
    expect(r).toMatchObject({ status: "awarded", drops: 2, fresh: true });
    expect(r.completionId).not.toBeNull();
    expect(await wallet(s.a)).toEqual({ drops: 5, points: 10, payments: 1 });
    expect(await stateOf(s.a, s.mission)).toBe("done");
    // What the "mission done" screen shows comes from this record.
    expect(await one(db, "select drops_awarded, points_awarded, status from mission_completions where id = $1", [r.completionId])).toEqual({ drops_awarded: 2, points_awarded: 10, status: "approved" });
    expect(await count("select count(*)::int as n from game_results where child_id = $1 and game_id = 'egg-hole-in-one'", [s.a])).toBe(1);
  });

  it("a game left after the first two courses pays nothing", async () => {
    const launch = (await openLaunch(s.a, s.mission, APP))!;
    const round = await startRound(launch.launchId);
    expect((await finish(round, win().slice(0, 4))).http).toBe(422);
    expect(await claimWin(s.a, launch.launchId, round.roundId)).toMatchObject({ status: "nothing", drops: 0, completionId: null });
    expect(await catchUpGames(s.a)).toEqual({ completionId: null, drops: 0 });
    expect(await wallet(s.a)).toEqual({ drops: 0, points: 0, payments: 0 });
    expect(await stateOf(s.a, s.mission)).toBe("available");
  });

  it("a game opened by its own address, outside a mission, pays nothing", async () => {
    await openLaunch(s.a, s.mission, APP);
    const round = await startRound(); // no launch id
    expect((await finish(round, win())).verified).toBe(true);
    expect(await catchUpGames(s.a)).toEqual({ completionId: null, drops: 0 });
    const launchId = (await one<{ launch_id: string }>(db, "select launch_id from game_launches where child_id = $1", [s.a]))!.launch_id;
    expect(await claimWin(s.a, launchId, round.roundId)).toMatchObject({ status: "nothing", drops: 0 });
    expect(await wallet(s.a)).toEqual({ drops: 0, points: 0, payments: 0 });
  });

  it("the same finished game pays once: asked again, asked twice at the same moment, sent twice", async () => {
    const launch = (await openLaunch(s.a, s.mission, APP))!;
    const round = await startRound(launch.launchId);
    await finish(round, win());
    // Two "finished" messages arrive together (two taps, a retry racing the first answer).
    const both = await Promise.all([claimWin(s.a, launch.launchId, round.roundId), claimWin(s.a, launch.launchId, round.roundId)]);
    expect(both.map((r) => r.status).sort()).toEqual(["already", "awarded"]);
    expect(both.reduce((n, r) => n + r.drops, 0)).toBe(2);
    // And again, with and without the round named, and from the "came back" check.
    const again = await claimWin(s.a, launch.launchId, round.roundId);
    expect(again).toMatchObject({ status: "already", drops: 0, fresh: false });
    expect(again.completionId).toBe(both.find((r) => r.status === "awarded")!.completionId);
    expect(await claimWin(s.a, launch.launchId, undefined)).toMatchObject({ status: "already", drops: 0 });
    expect(await catchUpGames(s.a)).toEqual({ completionId: null, drops: 0 });
    // The game answering "finished" for the same round again changes nothing either.
    expect((await finish(round, win())).http).toBe(200);
    expect(await claimWin(s.a, launch.launchId, round.roundId)).toMatchObject({ status: "already", drops: 0 });
    expect(await wallet(s.a)).toEqual({ drops: 2, points: 10, payments: 1 });
    expect(await count("select count(*)::int as n from mission_completions where child_id = $1", [s.a])).toBe(1);
    expect(await count("select count(*)::int as n from game_results where child_id = $1", [s.a])).toBe(1);
  });

  it("playing once more in the same week is counted as a game, and pays nothing more", async () => {
    const launch = (await openLaunch(s.a, s.mission, APP))!;
    const first = await startRound(launch.launchId);
    await finish(first, win());
    expect((await claimWin(s.a, launch.launchId, first.roundId)).status).toBe("awarded");
    const second = await startRound(launch.launchId);
    await finish(second, win());
    expect(await claimWin(s.a, launch.launchId, second.roundId)).toMatchObject({ status: "already", drops: 0, fresh: true });
    expect(await wallet(s.a)).toEqual({ drops: 2, points: 10, payments: 1 });
    expect(await count("select count(*)::int as n from game_results where child_id = $1", [s.a])).toBe(2);
  });

  it("the app was closed right after the last egg: the game is found on the way back in", async () => {
    const launch = (await openLaunch(s.a, s.mission, APP))!;
    const round = await startRound(launch.launchId);
    await finish(round, win());
    // No "finished" message ever reached the app.
    expect(await wallet(s.a)).toEqual({ drops: 0, points: 0, payments: 0 });
    expect(await hasUnsettledGame(s.a)).toBe(true);
    // The home screen and the mission list look for it (GameCatchUp -> catchUpGamesAction).
    const completionId = await catchUpGamesAction();
    expect(completionId).not.toBeNull();
    expect(await wallet(s.a)).toEqual({ drops: 2, points: 10, payments: 1 });
    expect(await stateOf(s.a, s.mission)).toBe("done");
    // Looking again finds nothing new, and the mission screen opened again does not pay again.
    expect(await catchUpGamesAction()).toBeNull();
    expect(await claimGameAction(launch.launchId)).toMatchObject({ status: "already", drops: 0, completionId });
    expect(await wallet(s.a)).toEqual({ drops: 2, points: 10, payments: 1 });
  });

  it("another child cannot take it: not with this child's launch, not with this child's round", async () => {
    const launchA = (await openLaunch(s.a, s.mission, APP))!;
    const round = await startRound(launchA.launchId);
    await finish(round, win());

    // 바다 asks with 하늘's launch id.
    signedIn.id = s.b;
    expect(await claimGameAction(launchA.launchId, round.roundId)).toMatchObject({ status: "not_yours", drops: 0, completionId: null });
    // 바다 asks with their own launch and 하늘's round.
    const launchB = (await openLaunch(s.b, s.mission, APP))!;
    expect(launchB.launchId).not.toBe(launchA.launchId);
    expect(await claimGameAction(launchB.launchId, round.roundId)).toMatchObject({ status: "nothing", drops: 0 });
    expect(await catchUpGamesAction()).toBeNull();
    expect(await wallet(s.b)).toEqual({ drops: 0, points: 0, payments: 0 });
    expect(await stateOf(s.b, s.mission)).toBe("available");

    // 하늘's game is still theirs to collect, once.
    signedIn.id = s.a;
    expect(await claimGameAction(launchA.launchId, round.roundId)).toMatchObject({ status: "awarded", drops: 2 });
    expect(await wallet(s.a)).toEqual({ drops: 2, points: 10, payments: 1 });
    // And 바다 gets their own by playing their own.
    signedIn.id = s.b;
    const own = await startRound(launchB.launchId);
    await finish(own, win());
    expect(await claimGameAction(launchB.launchId, own.roundId)).toMatchObject({ status: "awarded", drops: 2 });
    expect(await wallet(s.b)).toEqual({ drops: 2, points: 10, payments: 1 });
  });

  it("follows the mission's own rules: the weekly cap still counts", async () => {
    await db.query("insert into settings (key, value) values ('weekly_drop_cap', '1') on conflict (key) do update set value = excluded.value");
    const launch = (await openLaunch(s.a, s.mission, APP))!;
    const round = await startRound(launch.launchId);
    await finish(round, win());
    expect(await claimWin(s.a, launch.launchId, round.roundId)).toMatchObject({ status: "awarded", drops: 1 });
    expect(await wallet(s.a)).toEqual({ drops: 1, points: 10, payments: 1 });
  });

  it("can be moved to a game server elsewhere, which is then asked over the network", async () => {
    process.env.EGG_GAME_ORIGIN = "https://egg.test";
    expect(gameOrigin("egg-hole-in-one")).toBe("https://egg.test");
    const launch = (await openLaunch(s.a, s.mission, APP))!;
    expect(launch.gameOrigin).toBe("https://egg.test");
    expect(launch.gameUrl.startsWith("https://egg.test/#launch=")).toBe(true);
    const asked: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      asked.push(String(url));
      const { roundId } = JSON.parse(String(init?.body)) as { roundId?: string };
      return Response.json({ gameId: "egg-hole-in-one", results: [{ resultId: "res-1", roundId: roundId ?? "round-1", completedAt: Date.now(), goals: 5, completedStages: 3 }], nextCursor: null });
    }) as typeof fetch;
    expect(await claimWin(s.a, launch.launchId, "round-1", { fetchImpl })).toMatchObject({ status: "awarded", drops: 2 });
    expect(asked).toEqual(["https://egg.test/api/results/verify"]);
    // A result that is not a finished game (four goals) is not believed.
    const half = (async () => Response.json({ gameId: "egg-hole-in-one", results: [{ resultId: "res-2", roundId: "round-2", completedAt: Date.now(), goals: 4, completedStages: 2 }], nextCursor: null })) as typeof fetch;
    expect(await claimWin(s.a, launch.launchId, "round-2", { fetchImpl: half })).toMatchObject({ status: "retry", drops: 0 });
    expect(await wallet(s.a)).toEqual({ drops: 2, points: 10, payments: 1 });
  });
});
