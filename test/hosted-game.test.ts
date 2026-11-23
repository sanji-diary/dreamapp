import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";
process.env.SHEPHERD_GAME_ORIGIN = "https://game.test";

const signedIn = { id: 0 };
vi.mock("@/lib/auth", () => ({ requireKid: async () => ({ id: signedIn.id, onboarded_at: "2027-01-01" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

// The real game server of 〈한 마리 어디 갔어?〉, run inside the test: the same code the public game runs.
import { MAP } from "../games/shepherd-coop/engine.mjs";
import { roomApi } from "../games/shepherd-coop/rooms.mjs";
import { createLocalStore } from "../games/shepherd-coop/server.mjs";
import { findGame, GAMES } from "@/games/registry";
import { db, one, resetDbForTests } from "@/lib/db";
import { dropBalance, missionsForChild, pointBalance, weekDropsEarned } from "@/lib/game";
import { issueGameToken, MIN_PLAY_MS, winGame } from "@/lib/kid/game-proof";
import { catchUpGames, claimWin, gameOrigin, hasUnsettledGame, HOSTED, openLaunch, type HostedDeps } from "@/lib/kid/hosted-game";
import { catchUpGamesAction, claimGameAction } from "@/lib/kid/mission-actions";
import { addDays, todayKst, weekStart } from "@/lib/time";

const APP = "https://app.test";
const GAME = "https://game.test";
const TODAY = todayKst();
const WS = weekStart(TODAY);

type Store = ReturnType<typeof createLocalStore>;
let dir: string;
let store: Store;
let down = false;
/** The game server always answers; its JavaScript just does not say so in a way TypeScript can read. */
const askGame = (request: Request) => roomApi(request, store) as Promise<Response>;
/** What our server uses instead of the internet: requests go straight into the game server's code. */
const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
  if (down) throw new Error("offline");
  return askGame(new Request(url as URL, init));
}) as typeof fetch;
const deps: HostedDeps = { fetchImpl };

/** A phone talking to the game server. */
async function gamePost(suffix: string, body: unknown) {
  const res = await askGame(new Request(`${GAME}/api/${suffix}`, { method: "POST", body: JSON.stringify(body) }));
  return { http: res.status, ...(await res.json()) } as { http: number; room: string; token: string; state: { status: string; roundId: string; savedCount: number } };
}

interface Seat {
  room: string;
  token: string;
}

/** Two phones meet in one room and both press start. `a` and `b` are launch ids, or null for a phone outside the app. */
async function startRoom(a: string | null, b: string | null): Promise<[Seat, Seat]> {
  const first = await gamePost("rooms", { deviceId: "phone-aaaa-0001", name: "하늘", ...(a ? { launchId: a } : {}) });
  expect(first.http).toBe(201);
  const second = await gamePost(`rooms/${first.room}/join`, { deviceId: "phone-bbbb-0002", name: "바다", ...(b ? { launchId: b } : {}) });
  expect(second.http).toBe(200);
  const seats: [Seat, Seat] = [
    { room: first.room, token: first.token },
    { room: first.room, token: second.token },
  ];
  await ready(seats);
  return seats;
}

const sync = (s: Seat, body: Record<string, unknown> = {}) => gamePost(`rooms/${s.room}/sync`, { token: s.token, ...body });

async function ready(seats: [Seat, Seat]) {
  await sync(seats[0], { ready: true });
  const r = await sync(seats[1], { ready: true });
  expect(r.state.status).toBe("playing");
}

/** Puts the six sheep at the church door; the game server's own next step then finishes the round. */
async function bringSheepHome(seats: [Seat, Seat]): Promise<string> {
  const row = store.read(seats[0].room)!;
  for (const [i, sheep] of row.room.game.sheep.entries()) Object.assign(sheep, { x: MAP.shepherd.x + ((i % 3) - 1) * 20, y: MAP.shepherd.y + (i < 3 ? 9 : 27), helpers: 3 });
  row.room.updated -= 40;
  expect(store.write(seats[0].room, row.revision, row.room)).toBe(true);
  const r = await sync(seats[0]);
  expect(r.state.status).toBe("won");
  expect(r.state.savedCount).toBe(6);
  return r.state.roundId;
}

/** Lets the five minutes run out without the sheep being home. */
async function runOutOfTime(seats: [Seat, Seat]) {
  const row = store.read(seats[0].room)!;
  row.room.game.startedAt -= 300_001;
  expect(store.write(seats[0].room, row.revision, row.room)).toBe(true);
  const r = await sync(seats[0]);
  expect(r.state.status).toBe("lost");
}

async function playAgain(seats: [Seat, Seat]) {
  await sync(seats[0], { replay: true });
  await sync(seats[1], { replay: true });
  await ready(seats);
}

async function setup(opts: { starts?: string; ends?: string; repeat?: string } = {}) {
  resetDbForTests();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade) values ('5학년 2반', 5) returning id");
  const kids = await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('하늘', $1, 't1'), ('바다', $1, 't2'), ('구름', $1, 't3') returning id", [cls[0].id]);
  const add = async (game: string) =>
    (
      await db.query<{ id: number }>(
        "insert into missions (title, kind, drops, points, repeat, starts_on, ends_on, game_id) values ('이번 주 미션게임','game',2,10,$1,$2,$3,$4) returning id",
        [opts.repeat ?? "weekly", opts.starts ?? WS, opts.ends ?? addDays(WS, 6), game],
      )
    )[0].id;
  const mission = await add("shepherd-coop");
  return { a: kids[0].id, b: kids[1].id, c: kids[2].id, mission, add };
}

const stateOf = async (child: number, mission: number, date: string = TODAY) => (await missionsForChild(db, child, date)).find((m) => m.id === mission)?.state;
const count = async (sql: string, params: unknown[] = []) => (await one<{ n: number }>(db, sql, params))!.n;

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dream-hosted-game-"));
  store = createLocalStore(dir);
  down = false;
  s = await setup();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
afterAll(() => {
  delete process.env.SHEPHERD_GAME_ORIGIN;
});

describe("the game list", () => {
  it("names every game's way of playing, and every hosted game has a server", () => {
    for (const g of GAMES) {
      expect(g.goal).not.toBe("");
      expect(g.host === "hosted").toBe(g.id in HOSTED);
    }
    expect(findGame("shepherd-coop")).toMatchObject({ host: "hosted", players: 2 });
    expect(gameOrigin("shepherd-coop")).toBe(GAME);
    expect(gameOrigin("memory")).toBeNull();
  });

  it("refuses a game address that is more than an origin", () => {
    process.env.SHEPHERD_GAME_ORIGIN = "https://game.test/path?x=1";
    expect(gameOrigin("shepherd-coop")).toBeNull();
    process.env.SHEPHERD_GAME_ORIGIN = GAME;
  });
});

describe("opening the game", () => {
  it("gives each child their own launch, the same one all week, and never the secret", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    expect(a.launchId).toMatch(/^[0-9a-f]{64}$/);
    expect(b.launchId).not.toBe(a.launchId);
    const url = new URL(a.gameUrl);
    expect(url.origin).toBe(GAME);
    expect(Object.fromEntries(new URLSearchParams(url.hash.slice(1)))).toEqual({ launch: a.launchId, parentOrigin: APP });
    const row = (await one<{ secret_hex: string }>(db, "select secret_hex from game_launches where launch_id = $1", [a.launchId]))!;
    expect(JSON.stringify(a)).not.toContain(row.secret_hex);
    // A refresh, or coming back later in the week, returns to the same launch.
    expect((await openLaunch(s.a, s.mission, APP))!.launchId).toBe(a.launchId);
    expect(await count("select count(*)::int as n from game_launches")).toBe(2);
  });

  it("opens only a hosted game mission the child can see", async () => {
    const memory = await s.add("memory");
    expect(await openLaunch(s.a, memory, APP)).toBeNull();
    expect(await openLaunch(s.a, 999999, APP)).toBeNull();
    expect(await openLaunch(s.a, s.mission, "not an origin")).toBeNull();
    expect(await openLaunch(s.a, s.mission, APP, addDays(WS, 7))).toBeNull(); // next week: the mission is over
  });

  it("does not let the start token of a local game finish a hosted game", async () => {
    const token = await issueGameToken(s.a, s.mission, "shepherd-coop", Date.now() - MIN_PLAY_MS - 1000);
    expect(await winGame(s.a, s.mission, token)).toEqual({ ok: false, reason: "not_found" });
    expect(await dropBalance(db, s.a)).toBe(0);
  });
});

describe("two children finish the game together", () => {
  it("gives each child the mission's drops once, only after the game server says the game is finished", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    const seats = await startRoom(a.launchId, b.launchId);

    // Still playing: saying "finished" gets nothing.
    expect(await claimWin(s.a, a.launchId, undefined, deps)).toEqual({ status: "nothing", completionId: null, drops: 0, fresh: false });
    expect(await claimWin(s.a, a.launchId, "made-up-round", deps)).toMatchObject({ status: "retry", drops: 0 }); // the game server refuses a made-up round id
    expect(await dropBalance(db, s.a)).toBe(0);

    const round = await bringSheepHome(seats);
    const ra = await claimWin(s.a, a.launchId, round, deps);
    expect(ra).toMatchObject({ status: "awarded", drops: 2 });
    const rb = await claimWin(s.b, b.launchId, round, deps);
    expect(rb).toMatchObject({ status: "awarded", drops: 2 });
    expect(rb.completionId).not.toBe(ra.completionId);

    for (const kid of [s.a, s.b]) {
      expect(await dropBalance(db, kid)).toBe(2);
      expect(await pointBalance(db, kid)).toBe(10);
      expect(await stateOf(kid, s.mission)).toBe("done");
    }
    const done = (await one<{ status: string; done_on: string; week_start: string; drops_awarded: number }>(db, "select status, done_on, week_start, drops_awarded from mission_completions where id = $1", [ra.completionId]))!;
    expect(done).toEqual({ status: "approved", done_on: TODAY, week_start: WS, drops_awarded: 2 });
    expect(await count("select count(*)::int as n from game_results where completion_id is not null")).toBe(2);
    // The child who only watched gets nothing.
    expect(await dropBalance(db, s.c)).toBe(0);
  });

  it("pays once however often the same finish is sent", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    const round = await bringSheepHome(await startRoom(a.launchId, b.launchId));

    const tries = await Promise.all(Array.from({ length: 6 }, () => claimWin(s.a, a.launchId, round, deps)));
    expect(tries.filter((r) => r.status === "awarded")).toHaveLength(1);
    expect(tries.filter((r) => r.status === "already" && !r.fresh)).toHaveLength(5);
    // Every answer points at the same completion, so a repeated message still opens the "done" screen.
    expect(new Set(tries.map((r) => r.completionId)).size).toBe(1);
    expect(tries.reduce((n, r) => n + r.drops, 0)).toBe(2);

    expect(await claimWin(s.a, a.launchId, round, deps)).toMatchObject({ status: "already", drops: 0 });
    expect(await claimWin(s.a, a.launchId, undefined, deps)).toMatchObject({ status: "already", drops: 0 });
    expect((await catchUpGames(s.a, deps)).drops).toBe(0);
    expect(await dropBalance(db, s.a)).toBe(2);
    expect(await count("select count(*)::int as n from mission_completions where child_id = $1", [s.a])).toBe(1);
    expect(await count("select count(*)::int as n from drop_ledger where child_id = $1", [s.a])).toBe(1);
  });

  it("does not let one child collect with another child's launch", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    const round = await bringSheepHome(await startRoom(a.launchId, b.launchId));

    expect(await claimWin(s.b, a.launchId, round, deps)).toEqual({ status: "not_yours", completionId: null, drops: 0, fresh: false });
    expect(await claimWin(s.c, a.launchId, round, deps)).toMatchObject({ status: "not_yours" });
    expect(await claimWin(s.a, "0".repeat(64), round, deps)).toMatchObject({ status: "not_yours" });
    expect(await claimWin(s.a, "'; drop table children; --", round, deps)).toMatchObject({ status: "not_yours" });
    expect(await count("select count(*)::int as n from game_results")).toBe(0);

    // Through the real actions the child comes from the session, not from the request.
    vi.stubGlobal("fetch", fetchImpl);
    signedIn.id = s.b;
    expect(await claimGameAction(a.launchId, round)).toMatchObject({ status: "not_yours" });
    expect(await claimGameAction(b.launchId, round)).toMatchObject({ status: "awarded", drops: 2 });
    signedIn.id = s.a;
    expect(await claimGameAction(a.launchId, round)).toMatchObject({ status: "awarded", drops: 2 });
  });

  it("gives nothing to a seat that was not opened from the app", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    // The friend opened the public game address in a browser instead of the mission.
    const round = await bringSheepHome(await startRoom(a.launchId, null));
    expect(await claimWin(s.a, a.launchId, round, deps)).toMatchObject({ status: "awarded", drops: 2 });
    expect(await dropBalance(db, s.b)).toBe(0);
  });
});

describe("closing the app right after the last sheep", () => {
  it("finds the finished game on the next visit, once", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    await bringSheepHome(await startRoom(a.launchId, b.launchId));
    // No message reached the app. Both children come back later.
    expect(await hasUnsettledGame(s.a)).toBe(true);
    const back = await catchUpGames(s.a, deps);
    expect(back.drops).toBe(2);
    expect(back.completionId).not.toBeNull();
    expect(await catchUpGames(s.a, deps)).toEqual({ completionId: null, drops: 0 });
    expect(await dropBalance(db, s.a)).toBe(2);

    vi.stubGlobal("fetch", fetchImpl);
    signedIn.id = s.b;
    const id = await catchUpGamesAction();
    expect(id).not.toBeNull();
    expect(await catchUpGamesAction()).toBeNull();
    expect(await dropBalance(db, s.b)).toBe(2);
    expect(await count("select count(*)::int as n from mission_completions")).toBe(2);
  });

  it("stops asking the game server once nothing more can come", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    expect(await hasUnsettledGame(s.a)).toBe(true);
    expect(await hasUnsettledGame(s.c)).toBe(false); // never opened the game
    // Asked a minute after opening: a round may still be going, so the next visit asks again.
    await catchUpGames(s.a, { fetchImpl, now: new Date(Date.now() + 60_000) });
    expect(await hasUnsettledGame(s.a)).toBe(true);
    await catchUpGames(s.a, { fetchImpl, now: new Date(Date.now() + 20 * 60_000) });
    expect(await hasUnsettledGame(s.a)).toBe(false);
    // Opening the game again starts the watch again.
    expect((await openLaunch(s.a, s.mission, APP))!.launchId).toBe(a.launchId);
    await db.query("update game_launches set opened_at = now() + interval '1 hour' where launch_id = $1", [a.launchId]);
    expect(await hasUnsettledGame(s.a)).toBe(true);
  });

  it("keeps the finish when the game server cannot be reached, and pays when it can", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    const round = await bringSheepHome(await startRoom(a.launchId, b.launchId));
    down = true;
    expect(await claimWin(s.a, a.launchId, round, deps)).toEqual({ status: "retry", completionId: null, drops: 0, fresh: false });
    expect(await catchUpGames(s.a, deps)).toEqual({ completionId: null, drops: 0 });
    expect(await hasUnsettledGame(s.a)).toBe(true);
    expect(await count("select count(*)::int as n from game_results")).toBe(0);
    down = false;
    expect(await claimWin(s.a, a.launchId, round, deps)).toMatchObject({ status: "awarded", drops: 2 });
  });

  it("counts a game for the day it was finished, even when it is found in the next week", async () => {
    // Last week's mission game, finished on Saturday evening; the child opens the app again on Monday.
    const lastWs = addDays(WS, -7);
    const saturday = addDays(WS, -1);
    s = await setup({ starts: lastWs, ends: saturday });
    const a = (await openLaunch(s.a, s.mission, APP, saturday))!;
    const b = (await openLaunch(s.b, s.mission, APP, saturday))!;
    await db.query("update game_launches set created_at = created_at - interval '9 days', opened_at = opened_at - interval '9 days'");
    const monday = Date.now();
    vi.setSystemTime(new Date(`${saturday}T19:30:00+09:00`)); // only the clock the game server reads
    await bringSheepHome(await startRoom(a.launchId, b.launchId));
    vi.setSystemTime(monday);
    vi.useRealTimers();

    expect(await stateOf(s.a, s.mission)).toBeUndefined(); // not in this week's list any more
    const back = await catchUpGames(s.a, deps);
    expect(back.drops).toBe(2);
    const done = (await one<{ done_on: string; week_start: string }>(db, "select done_on, week_start from mission_completions where id = $1", [back.completionId]))!;
    expect(done).toEqual({ done_on: saturday, week_start: lastWs });
    // It belongs to last week's twelve drops, not this week's.
    expect(await weekDropsEarned(db, s.a, lastWs)).toBe(2);
    expect(await weekDropsEarned(db, s.a, WS)).toBe(0);
  });
});

describe("running out of time, and trying again", () => {
  it("gives nothing for a round that ran out of time", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    const seats = await startRoom(a.launchId, b.launchId);
    await runOutOfTime(seats);
    expect(await claimWin(s.a, a.launchId, undefined, deps)).toEqual({ status: "nothing", completionId: null, drops: 0, fresh: false });
    expect(await catchUpGames(s.b, deps)).toEqual({ completionId: null, drops: 0 });
    for (const kid of [s.a, s.b]) {
      expect(await dropBalance(db, kid)).toBe(0);
      expect(await pointBalance(db, kid)).toBe(0);
      expect(await stateOf(kid, s.mission)).toBe("available"); // nothing is lost: the mission is still open
    }
    expect(await count("select count(*)::int as n from game_results")).toBe(0);
  });

  it("pays for the round that is finished after a failed one", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    const seats = await startRoom(a.launchId, b.launchId);
    await runOutOfTime(seats);
    await playAgain(seats);
    const round = await bringSheepHome(seats);
    expect(round.endsWith(":2")).toBe(true); // the second round of the same room
    expect(await claimWin(s.a, a.launchId, round, deps)).toMatchObject({ status: "awarded", drops: 2 });
    expect(await claimWin(s.b, b.launchId, round, deps)).toMatchObject({ status: "awarded", drops: 2 });
    expect(await dropBalance(db, s.a)).toBe(2);
    expect(await dropBalance(db, s.b)).toBe(2);
  });

  it("gives nothing more for finishing again in the same week, so a child can help a friend", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    const seats = await startRoom(a.launchId, b.launchId);
    const first = await bringSheepHome(seats);
    await claimWin(s.a, a.launchId, first, deps);
    await claimWin(s.b, b.launchId, first, deps);

    // 하늘 has done the mission and can still open the game, to play with 구름 who has not.
    expect(await stateOf(s.a, s.mission)).toBe("done");
    const again = (await openLaunch(s.a, s.mission, APP))!;
    expect(again.launchId).toBe(a.launchId);
    const c = (await openLaunch(s.c, s.mission, APP))!;
    const room2 = await gamePost("rooms", { deviceId: "phone-aaaa-0001", name: "하늘", launchId: a.launchId });
    const joined = await gamePost(`rooms/${room2.room}/join`, { deviceId: "phone-cccc-0003", name: "구름", launchId: c.launchId });
    const seats2: [Seat, Seat] = [
      { room: room2.room, token: room2.token },
      { room: room2.room, token: joined.token },
    ];
    await ready(seats2);
    const second = await bringSheepHome(seats2);

    // New to 하늘 (fresh), nothing given. Said again by a restored room, it is no longer news.
    expect(await claimWin(s.a, a.launchId, second, deps)).toEqual({ status: "already", completionId: null, drops: 0, fresh: true });
    expect(await claimWin(s.a, a.launchId, second, deps)).toEqual({ status: "already", completionId: null, drops: 0, fresh: false });
    expect(await claimWin(s.a, a.launchId, first, deps)).toMatchObject({ status: "already", fresh: false });
    expect(await claimWin(s.c, c.launchId, second, deps)).toMatchObject({ status: "awarded", drops: 2 });
    expect(await dropBalance(db, s.a)).toBe(2);
    expect(await dropBalance(db, s.c)).toBe(2);
    // The second game is on record for 하늘, without a completion.
    expect(await count("select count(*)::int as n from game_results where child_id = $1 and completion_id is null", [s.a])).toBe(1);
  });

  it("respects the weekly drop limit like every other mission", async () => {
    await db.query("insert into drop_ledger (child_id, delta, reason, ref_type, week_start) values ($1, 11, '다른 미션', 'mission', $2)", [s.a, WS]);
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const b = (await openLaunch(s.b, s.mission, APP))!;
    const round = await bringSheepHome(await startRoom(a.launchId, b.launchId));
    expect(await claimWin(s.a, a.launchId, round, deps)).toMatchObject({ status: "awarded", drops: 1 }); // 12 a week at most
    expect(await weekDropsEarned(db, s.a, WS)).toBe(12);
  });
});

describe("an answer from the game server that cannot be right", () => {
  const answer = (results: unknown[], gameId = "shepherd-coop") => ({ fetchImpl: (async () => Response.json({ gameId, results })) as unknown as typeof fetch });
  const result = (extra: Record<string, unknown> = {}) => ({ resultId: "room:1:p1", roundId: "room:1", completedAt: Date.now(), savedCount: 6, ...extra });

  it("is never paid", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    const bad = [
      answer([result({ savedCount: 5 })]), // not all six sheep
      answer([result({ completedAt: Date.now() + 3_600_000 })]), // finished in the future
      answer([result({ completedAt: Date.now() - 30 * 86_400_000 })]), // finished before the game was opened
      answer([result({ resultId: "" })]),
      answer([result()], "another-game"),
      { fetchImpl: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch },
      { fetchImpl: (async () => Response.json({ gameId: "shepherd-coop", results: [result()], nextCursor: 0 })) as unknown as typeof fetch },
    ];
    for (const d of bad) expect(await claimWin(s.a, a.launchId, undefined, d)).toEqual({ status: "retry", completionId: null, drops: 0, fresh: false });
    expect(await dropBalance(db, s.a)).toBe(0);
    expect(await count("select count(*)::int as n from game_results")).toBe(0);
    // A proper answer is paid, and the same result under another launch of the same child is not paid again.
    expect(await claimWin(s.a, a.launchId, undefined, answer([result()]))).toMatchObject({ status: "awarded", drops: 2 });
    expect(await claimWin(s.a, a.launchId, undefined, answer([result({ resultId: "room:1:p2" })]))).toMatchObject({ status: "already", drops: 0 });
    expect(await dropBalance(db, s.a)).toBe(2);
  });

  it("is not paid when the admin has switched the mission to another game", async () => {
    const a = (await openLaunch(s.a, s.mission, APP))!;
    await db.query("update missions set game_id = 'memory' where id = $1", [s.mission]);
    expect(await claimWin(s.a, a.launchId, undefined, answer([result()]))).toEqual({ status: "already", completionId: null, drops: 0, fresh: true });
    expect(await dropBalance(db, s.a)).toBe(0);
  });
});
