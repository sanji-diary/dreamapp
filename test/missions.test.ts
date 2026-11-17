import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

// The generic mission action is called for real below; only the request-bound pieces are replaced.
const signedIn = { id: 0 };
vi.mock("@/lib/auth", () => ({
  requireKid: async () => ({ id: signedIn.id, onboarded_at: "2027-01-01" }),
  kidLogin: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { db, one, resetDbForTests } from "@/lib/db";
import { completeMission, dropBalance, pointBalance, recordAttendance } from "@/lib/game";
import { completeMissionAction } from "@/lib/kid/actions";
import { checkGameToken, issueGameToken, MAX_AGE_MS, MIN_PLAY_MS, winGame } from "@/lib/kid/game-proof";
import { isQrCode, scanQr } from "@/lib/kid/qr";
import { answerQuiz, startQuiz } from "@/lib/kid/quiz";
import { parseQuiz, passNeed, publicQuiz, scoreQuiz, validateQuiz } from "@/lib/quiz";
import { defaultMissionInput, duplicateToNextWeek, getMission, saveMission } from "@/lib/staff/admin-missions";
import { addDays, todayKst, weekStart } from "@/lib/time";
import type { QuizQuestion, Staff } from "@/lib/types";

const TODAY = todayKst();
const WS = weekStart(TODAY);
const QUIZ: QuizQuestion[] = [
  { q: "노아가 만든 것은?", choices: ["방주", "성전", "탑"], answer: 0 },
  { q: "다윗이 이긴 사람은?", choices: ["사울", "골리앗"], answer: 1 },
  { q: "예수님이 태어나신 곳은?", choices: ["나사렛", "예루살렘", "베들레헴", "갈릴리"], answer: 2 },
];

async function setup() {
  resetDbForTests();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade) values ('5학년 2반', 5), ('6학년 1반', 6) returning id");
  const st = await db.query<{ id: number }>("insert into staff (name, role) values ('관리자','admin'), ('담임','homeroom') returning id");
  const kids = await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('아이', $1, 't1'), ('친구', $1, 't2'), ('다른반', $2, 't3') returning id", [cls[0].id, cls[1].id]);
  const add = async (kind: string, extra: { code?: string; quiz?: QuizQuestion[]; pass?: number | null; game?: string; starts?: string; ends?: string; classId?: number; repeat?: string } = {}) => {
    const r = await db.query<{ id: number }>(
      `insert into missions (title, kind, drops, points, repeat, starts_on, ends_on, qr_code, quiz, quiz_pass, game_id, target_class_id)
       values ($1,$2,2,10,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) returning id`,
      [kind + " 미션", kind, extra.repeat ?? "weekly", extra.starts ?? WS, extra.ends ?? addDays(WS, 6), extra.code ?? null, extra.quiz ? JSON.stringify(extra.quiz) : null, extra.pass ?? null, extra.game ?? null, extra.classId ?? null],
    );
    return r[0].id;
  };
  signedIn.id = kids[0].id;
  const admin: Staff = { id: st[0].id, name: "관리자", role: "admin", can_attendance: true, can_visits: true, can_approve: true, can_view_all: true, can_read_pastor_worries: true, active: true, class_ids: [] };
  return { classId: cls[0].id, otherClassId: cls[1].id, adminId: st[0].id, teacherId: st[1].id, kid: kids[0].id, friend: kids[1].id, otherKid: kids[2].id, add, admin };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

describe("QR missions", () => {
  it("scanning the mission's code completes it once; a second scan is 'already'", async () => {
    const m = await s.add("qr", { code: "qr-code-0001" });
    const r = await scanQr(s.kid, "qr-code-0001");
    expect(r).toMatchObject({ ok: true, kind: "qr" });
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(10);
    expect(await scanQr(s.kid, "qr-code-0001")).toEqual({ ok: false, reason: "already" });
    expect(await dropBalance(db, s.kid)).toBe(2);
    const rows = await db.query("select id from mission_completions where mission_id = $1", [m]);
    expect(rows).toHaveLength(1);
    // A QR mission does not touch attendance.
    expect(await db.query("select id from attendance")).toHaveLength(0);
  });

  it("refuses unknown, malformed, inactive and out-of-date codes, and missions meant for another class", async () => {
    await s.add("qr", { code: "past-code-01", starts: addDays(TODAY, -10), ends: addDays(TODAY, -1) });
    await s.add("qr", { code: "next-code-01", starts: addDays(TODAY, 1), ends: addDays(TODAY, 7) });
    const off = await s.add("qr", { code: "off-code-001" });
    await db.query("update missions set active = false where id = $1", [off]);
    await s.add("qr", { code: "class-code-1", classId: s.otherClassId });
    // A code sitting on a mission of another kind is not a QR mission.
    await s.add("self", { code: "self-code-01" });

    expect(await scanQr(s.kid, "no-such-code")).toEqual({ ok: false, reason: "unknown" });
    expect(await scanQr(s.kid, "../../staff")).toEqual({ ok: false, reason: "unknown" });
    expect(await scanQr(s.kid, "self-code-01")).toEqual({ ok: false, reason: "unknown" });
    expect(await scanQr(s.kid, "past-code-01")).toEqual({ ok: false, reason: "closed" });
    expect(await scanQr(s.kid, "next-code-01")).toEqual({ ok: false, reason: "closed" });
    expect(await scanQr(s.kid, "off-code-001")).toEqual({ ok: false, reason: "closed" });
    expect(await scanQr(s.kid, "class-code-1")).toEqual({ ok: false, reason: "not_yours" });
    expect(await scanQr(s.otherKid, "class-code-1")).toMatchObject({ ok: true });
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(isQrCode("abcDEF_-12")).toBe(true);
    expect(isQrCode("short")).toBe(false);
    expect(isQrCode("has/slash-in-it")).toBe(false);
  });

  it("a child cannot finish QR or attendance missions directly, only through the matching code", async () => {
    const qr = await s.add("qr", { code: "qr-code-0001" });
    const att = await s.add("attendance", { code: "att-code-001" });
    const plainAtt = await s.add("attendance");
    for (const id of [qr, att, plainAtt]) {
      expect(await completeMission(s.kid, id)).toEqual({ ok: false, reason: "not_available" });
      expect(await completeMission(s.kid, id, { viaQr: "" })).toEqual({ ok: false, reason: "not_available" });
      expect(await completeMission(s.kid, id, { viaQr: "wrong-code-1" })).toEqual({ ok: false, reason: "not_available" });
    }
    // Another mission's valid code does not open this one.
    expect(await completeMission(s.kid, qr, { viaQr: "att-code-001" })).toEqual({ ok: false, reason: "not_available" });
    // An attendance mission without a code can never be opened by a scan.
    expect(await completeMission(s.kid, plainAtt, { viaQr: "att-code-001" })).toEqual({ ok: false, reason: "not_available" });
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(await completeMission(s.kid, qr, { viaQr: "qr-code-0001" })).toMatchObject({ ok: true, status: "approved" });
  });

  it("the generic mission action refuses qr, attendance, quiz and game missions", async () => {
    const ids = [await s.add("qr", { code: "qr-code-0001" }), await s.add("attendance", { code: "att-code-001" }), await s.add("quiz", { quiz: QUIZ }), await s.add("game", { game: "memory" })];
    for (const id of ids) {
      expect(await completeMissionAction(id)).toEqual({ ok: false, message: "지금은 할 수 없는 미션이에요" });
      expect(await completeMissionAction(id, "qr-code-0001")).toEqual({ ok: false, message: "지금은 할 수 없는 미션이에요" });
    }
    expect(await db.query("select id from mission_completions")).toHaveLength(0);
    // The same action still works for a self-check mission (it redirects to the success screen).
    const self = await s.add("self");
    await expect(completeMissionAction(self)).rejects.toThrow(/REDIRECT \/missions\/done\/\d+/);
  });
});

describe("QR self check-in for attendance", () => {
  it("marks the child present today with no staff id and completes the attendance mission", async () => {
    const m = await s.add("attendance", { code: "att-code-001" });
    const r = await scanQr(s.kid, "att-code-001");
    expect(r).toMatchObject({ ok: true, kind: "attendance" });
    const a = await one<{ status: string; staff_id: number | null; date: string }>(db, "select status, staff_id, date from attendance where child_id = $1", [s.kid]);
    expect(a).toEqual({ status: "present", staff_id: null, date: TODAY });
    expect(await dropBalance(db, s.kid)).toBe(2);
    const c = await db.query<{ status: string; entered_by_staff_id: number | null }>("select status, entered_by_staff_id from mission_completions where mission_id = $1 and child_id = $2", [m, s.kid]);
    expect(c).toEqual([{ status: "approved", entered_by_staff_id: null }]);

    expect(await scanQr(s.kid, "att-code-001")).toEqual({ ok: false, reason: "already" });
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await db.query("select id from attendance where child_id = $1", [s.kid])).toHaveLength(1);
  });

  it("does nothing outside the mission's dates", async () => {
    await s.add("attendance", { code: "att-code-old", starts: addDays(TODAY, -7), ends: addDays(TODAY, -1) });
    await s.add("attendance", { code: "att-code-new", starts: addDays(TODAY, 1), ends: addDays(TODAY, 1) });
    expect(await scanQr(s.kid, "att-code-old")).toEqual({ ok: false, reason: "closed" });
    expect(await scanQr(s.kid, "att-code-new")).toEqual({ ok: false, reason: "closed" });
    // The same code on the mission's own day works.
    expect(await scanQr(s.kid, "att-code-new", addDays(TODAY, 1))).toMatchObject({ ok: true });
    expect(await db.query<{ date: string }>("select date from attendance where child_id = $1", [s.kid])).toEqual([{ date: addDays(TODAY, 1) }]);
  });

  it("never overwrites a teacher's mark, and a later 'absent' correction takes the award back", async () => {
    await s.add("attendance", { code: "att-code-001" });
    // Teacher marked the friend absent: the scan is refused and nothing changes.
    await recordAttendance(s.teacherId, s.friend, TODAY, "absent");
    expect(await scanQr(s.friend, "att-code-001")).toEqual({ ok: false, reason: "ask_teacher" });
    expect(await one(db, "select status, staff_id from attendance where child_id = $1", [s.friend])).toEqual({ status: "absent", staff_id: s.teacherId });
    expect(await dropBalance(db, s.friend)).toBe(0);

    // Teacher marked the other child late first (which already completes the mission): the mark stays 'late'.
    await recordAttendance(s.teacherId, s.otherKid, TODAY, "late");
    expect(await scanQr(s.otherKid, "att-code-001")).toEqual({ ok: false, reason: "already" });
    expect(await one(db, "select status, staff_id from attendance where child_id = $1", [s.otherKid])).toEqual({ status: "late", staff_id: s.teacherId });

    // A self check-in that turns out wrong is corrected by the teacher like any other mark.
    expect(await scanQr(s.kid, "att-code-001")).toMatchObject({ ok: true });
    expect(await dropBalance(db, s.kid)).toBe(2);
    await recordAttendance(s.teacherId, s.kid, TODAY, "absent");
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(await pointBalance(db, s.kid)).toBe(0);
  });

  it("a scan completes only the mission that owns the code, not another attendance mission open that day", async () => {
    // The usual weekly attendance mission (the teacher's roll call), and a one-day event with its own QR.
    const weekly = await s.add("attendance");
    const event = await s.add("attendance", { code: "att-code-evt", starts: TODAY, ends: TODAY });
    expect(await scanQr(s.kid, "att-code-evt")).toMatchObject({ ok: true, kind: "attendance" });
    expect(await db.query("select mission_id from mission_completions where child_id = $1", [s.kid])).toEqual([{ mission_id: event }]);
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(10);
    // The child is still marked present today, without a teacher.
    expect(await one(db, "select status, staff_id, date from attendance where child_id = $1", [s.kid])).toEqual({ status: "present", staff_id: null, date: TODAY });
    // The weekly mission is left for the teacher's roll call, which completes it once as before.
    await recordAttendance(s.teacherId, s.kid, TODAY, "present");
    expect(await db.query("select mission_id from mission_completions where child_id = $1 order by mission_id", [s.kid])).toEqual([{ mission_id: weekly }, { mission_id: event }]);
    expect(await dropBalance(db, s.kid)).toBe(4);
  });

  it("clearing a self check-in with no staff id also works (system correction)", async () => {
    await s.add("attendance", { code: "att-code-001" });
    await scanQr(s.kid, "att-code-001");
    await recordAttendance(null, s.kid, TODAY, null);
    expect(await db.query("select id from attendance where child_id = $1", [s.kid])).toHaveLength(0);
    expect(await dropBalance(db, s.kid)).toBe(0);
  });
});

describe("quiz missions", () => {
  const play = async (kid: number, attemptId: number, picks: number[]) => {
    let last;
    for (let i = 0; i < picks.length; i++) last = await answerQuiz(kid, attemptId, i, picks[i]);
    return last!;
  };

  it("checks each answer on the server and only completes when enough are right", async () => {
    const m = await s.add("quiz", { quiz: QUIZ });
    const a = await startQuiz(s.kid, m);
    if (!a.ok) throw new Error("start failed");
    expect(a.total).toBe(3);
    // Right, then wrong (the reply names the right choice for that question only), then right.
    expect(await answerQuiz(s.kid, a.attemptId, 0, 0)).toEqual({ ok: true, right: true, correct: 0, done: false });
    expect(await answerQuiz(s.kid, a.attemptId, 1, 0)).toEqual({ ok: true, right: false, correct: 1, done: false });
    const end = await answerQuiz(s.kid, a.attemptId, 2, 2);
    expect(end).toMatchObject({ ok: true, right: true, correct: 2, done: true, result: { right: 2, total: 3, need: 3, passed: false, completionId: null } });
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(await db.query("select id from mission_completions")).toHaveLength(0);

    // Trying again straight away is free, and a full score completes the mission.
    const b = await startQuiz(s.kid, m);
    if (!b.ok) throw new Error("restart failed");
    const win = await play(s.kid, b.attemptId, [0, 1, 2]);
    expect(win).toMatchObject({ ok: true, done: true, result: { right: 3, passed: true } });
    if (!win.ok || !win.result) throw new Error();
    expect(win.result.completionId).toBeGreaterThan(0);
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(10);
    // Done for this week: no new attempt, no second award.
    expect(await startQuiz(s.kid, m)).toEqual({ ok: false, reason: "already_done" });
  });

  it("an answer cannot be changed, skipped, repeated or sent for someone else's attempt", async () => {
    const m = await s.add("quiz", { quiz: QUIZ });
    const a = await startQuiz(s.kid, m);
    if (!a.ok) throw new Error();
    expect(await answerQuiz(s.kid, a.attemptId, 1, 1)).toEqual({ ok: false, reason: "stale" }); // skipping ahead
    expect(await answerQuiz(s.kid, a.attemptId, 0, 9)).toEqual({ ok: false, reason: "invalid" }); // no such choice
    expect(await answerQuiz(s.kid, a.attemptId, 0, 1)).toMatchObject({ ok: true, right: false, correct: 0 });
    // Having seen the right answer, sending question 0 again does not replace the recorded one.
    expect(await answerQuiz(s.kid, a.attemptId, 0, 0)).toEqual({ ok: false, reason: "stale" });
    expect(await answerQuiz(s.friend, a.attemptId, 1, 1)).toEqual({ ok: false, reason: "stale" });
    expect(await answerQuiz(s.kid, a.attemptId, 1, 1)).toMatchObject({ ok: true, right: true });
    const end = await answerQuiz(s.kid, a.attemptId, 2, 2);
    // Scored from the recorded answers: the first, wrong one still counts.
    expect(end).toMatchObject({ ok: true, done: true, result: { right: 2, passed: false } });
    // A finished attempt takes no more answers.
    expect(await answerQuiz(s.kid, a.attemptId, 2, 2)).toEqual({ ok: false, reason: "stale" });
    expect(await answerQuiz(s.kid, a.attemptId, 3, 0)).toEqual({ ok: false, reason: "stale" });
    expect(await db.query("select id from mission_completions")).toHaveLength(0);
    const row = await one<{ answers: unknown }>(db, "select answers from quiz_attempts where id = $1", [a.attemptId]);
    expect(row?.answers).toEqual([1, 1, 2]);
  });

  it("honours the pass count, and calling completeMission directly is refused", async () => {
    const m = await s.add("quiz", { quiz: QUIZ, pass: 2 });
    expect(await completeMission(s.kid, m)).toEqual({ ok: false, reason: "not_available" });
    expect(await completeMission(s.kid, m, { text: "[0,1,2]" })).toEqual({ ok: false, reason: "not_available" });
    const a = await startQuiz(s.kid, m);
    if (!a.ok) throw new Error();
    const end = await play(s.kid, a.attemptId, [1, 1, 2]);
    expect(end).toMatchObject({ ok: true, done: true, result: { right: 2, total: 3, need: 2, passed: true } });
    expect(await dropBalance(db, s.kid)).toBe(2);
  });

  it("a quiz for another class, a non-quiz mission or a quiz with no questions cannot be started", async () => {
    const other = await s.add("quiz", { quiz: QUIZ, classId: s.otherClassId });
    const empty = await s.add("quiz");
    const self = await s.add("self");
    expect(await startQuiz(s.kid, other)).toEqual({ ok: false, reason: "not_found" });
    expect(await startQuiz(s.kid, empty)).toEqual({ ok: false, reason: "not_found" });
    expect(await startQuiz(s.kid, self)).toEqual({ ok: false, reason: "not_found" });
    expect(await startQuiz(s.kid, 99999)).toEqual({ ok: false, reason: "not_found" });
  });

  it("what goes to the browser has no answers; scoring and validation rules", () => {
    expect(JSON.stringify(publicQuiz(QUIZ))).not.toContain("answer");
    expect(publicQuiz(QUIZ)[1]).toEqual({ q: "다윗이 이긴 사람은?", choices: ["사울", "골리앗"] });
    expect(scoreQuiz(QUIZ, [0, 1, 2], null)).toEqual({ right: 3, total: 3, need: 3, passed: true });
    expect(scoreQuiz(QUIZ, [0, 1], 2).passed).toBe(false); // unfinished never passes
    expect(passNeed(5, null)).toBe(5);
    expect(passNeed(5, 9)).toBe(5);
    expect(parseQuiz(JSON.stringify(QUIZ))).toEqual(QUIZ);
    expect(parseQuiz("{bad")).toEqual([]);
    expect(parseQuiz([{ q: "x", choices: ["a"], answer: 0 }])).toEqual([]);

    expect(validateQuiz(QUIZ, null)).toEqual({ ok: true, quiz: QUIZ, pass: null });
    expect(validateQuiz(QUIZ, 3)).toMatchObject({ ok: true, pass: null });
    expect(validateQuiz(QUIZ, 2)).toMatchObject({ ok: true, pass: 2 });
    expect(validateQuiz(QUIZ, 4).ok).toBe(false);
    expect(validateQuiz(QUIZ, 0).ok).toBe(false);
    expect(validateQuiz([], null).ok).toBe(false);
    expect(validateQuiz(null, null).ok).toBe(false);
    expect(validateQuiz(Array(11).fill(QUIZ[0]), null).ok).toBe(false);
    expect(validateQuiz([{ q: " ", choices: ["a", "b"], answer: 0 }], null).ok).toBe(false);
    expect(validateQuiz([{ q: "q", choices: ["a"], answer: 0 }], null).ok).toBe(false);
    expect(validateQuiz([{ q: "q", choices: ["a", "b", "c", "d", "e"], answer: 0 }], null).ok).toBe(false);
    expect(validateQuiz([{ q: "q", choices: ["a", " "], answer: 0 }], null).ok).toBe(false);
    expect(validateQuiz([{ q: "q", choices: ["a", "a"], answer: 0 }], null).ok).toBe(false);
    expect(validateQuiz([{ q: "q", choices: ["a", "b"], answer: 2 }], null).ok).toBe(false);
    expect(validateQuiz([{ q: "q", choices: ["a", "b"], answer: "0" }], null).ok).toBe(false);
  });
});

describe("game missions", () => {
  const T0 = 1_800_000_000_000;

  it("the start token is bound to child and mission and to a believable playing time", async () => {
    const token = await issueGameToken(s.kid, 7, "memory", T0);
    expect(await checkGameToken(token, s.kid, 7, T0 + 1_000)).toEqual({ ok: false, reason: "too_fast" });
    expect(await checkGameToken(token, s.kid, 7, T0 + MIN_PLAY_MS - 1)).toEqual({ ok: false, reason: "too_fast" });
    expect(await checkGameToken(token, s.kid, 7, T0 + MIN_PLAY_MS)).toEqual({ ok: true, gameId: "memory" });
    expect(await checkGameToken(token, s.kid, 7, T0 + MAX_AGE_MS)).toEqual({ ok: true, gameId: "memory" });
    expect(await checkGameToken(token, s.kid, 7, T0 + MAX_AGE_MS + 1)).toEqual({ ok: false, reason: "expired" });
    expect(await checkGameToken(token, s.friend, 7, T0 + 60_000)).toEqual({ ok: false, reason: "bad" });
    expect(await checkGameToken(token, s.kid, 8, T0 + 60_000)).toEqual({ ok: false, reason: "bad" });
    expect(await checkGameToken(token.slice(0, -2) + "xx", s.kid, 7, T0 + 60_000)).toEqual({ ok: false, reason: "bad" });
    expect(await checkGameToken("", s.kid, 7, T0 + 60_000)).toEqual({ ok: false, reason: "bad" });
    expect(await checkGameToken(undefined, s.kid, 7, T0 + 60_000)).toEqual({ ok: false, reason: "bad" });
    expect(MIN_PLAY_MS).toBe(15_000);
    expect(MAX_AGE_MS).toBe(30 * 60_000);
  });

  it("a win counts only with a valid token after at least 15 seconds, and only once", async () => {
    const m = await s.add("game", { game: "memory" });
    expect(await completeMission(s.kid, m)).toEqual({ ok: false, reason: "not_available" });
    const token = await issueGameToken(s.kid, m, "memory", T0);
    expect(await winGame(s.kid, m, undefined, T0 + 60_000)).toEqual({ ok: false, reason: "bad" });
    expect(await winGame(s.kid, m, token, T0 + 5_000)).toEqual({ ok: false, reason: "too_fast" });
    expect(await winGame(s.kid, m, token, T0 + MAX_AGE_MS + 1_000)).toEqual({ ok: false, reason: "expired" });
    expect(await winGame(s.friend, m, token, T0 + 60_000)).toEqual({ ok: false, reason: "bad" });
    expect(await winGame(s.kid, m, await issueGameToken(s.kid, m, "another-game", T0), T0 + 60_000)).toEqual({ ok: false, reason: "bad" });
    expect(await dropBalance(db, s.kid)).toBe(0);

    expect(await winGame(s.kid, m, token, T0 + 60_000)).toMatchObject({ ok: true, status: "approved", drops: 2, points: 10 });
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await winGame(s.kid, m, token, T0 + 61_000)).toEqual({ ok: false, reason: "already_done" });
    expect(await dropBalance(db, s.kid)).toBe(2);
  });

  it("a game mission whose game is unknown, or a mission of another kind, cannot be won", async () => {
    const gone = await s.add("game", { game: "no-such-game" });
    const self = await s.add("self");
    expect(await winGame(s.kid, gone, await issueGameToken(s.kid, gone, "no-such-game", T0), T0 + 60_000)).toEqual({ ok: false, reason: "not_found" });
    expect(await winGame(s.kid, self, await issueGameToken(s.kid, self, "memory", T0), T0 + 60_000)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("admin: saving the new mission kinds", () => {
  const input = (over: Partial<ReturnType<typeof defaultMissionInput>>) => ({ ...defaultMissionInput(), title: "새 미션", ...over });

  it("qr missions and attendance self check-in get a code; switching it off removes the code", async () => {
    const qr = await saveMission(s.admin, null, input({ kind: "qr" }));
    if (!qr.ok) throw new Error(qr.error);
    const code = (await getMission(s.admin, qr.id))?.qr_code;
    expect(isQrCode(code)).toBe(true);
    // Editing keeps the printed code working.
    await saveMission(s.admin, qr.id, input({ kind: "qr", title: "이름 바꿈" }));
    expect((await getMission(s.admin, qr.id))?.qr_code).toBe(code);

    const plain = await saveMission(s.admin, null, input({ kind: "attendance" }));
    if (!plain.ok) throw new Error(plain.error);
    expect((await getMission(s.admin, plain.id))?.qr_code).toBeNull();
    await saveMission(s.admin, plain.id, input({ kind: "attendance", qr_self: true }));
    const attCode = (await getMission(s.admin, plain.id))?.qr_code;
    expect(isQrCode(attCode)).toBe(true);
    expect(await scanQr(s.kid, attCode!)).toMatchObject({ ok: true, kind: "attendance" });
    await saveMission(s.admin, plain.id, input({ kind: "attendance", qr_self: false }));
    expect((await getMission(s.admin, plain.id))?.qr_code).toBeNull();
    // qr_self means nothing on other kinds.
    const self = await saveMission(s.admin, null, input({ kind: "self", qr_self: true }));
    if (!self.ok) throw new Error(self.error);
    expect((await getMission(s.admin, self.id))?.qr_code).toBeNull();

    // A copy for next week gets a code of its own.
    const copy = await duplicateToNextWeek(s.admin, qr.id);
    if (!copy.ok) throw new Error(copy.error);
    const copyCode = (await getMission(s.admin, copy.id))?.qr_code;
    expect(isQrCode(copyCode)).toBe(true);
    expect(copyCode).not.toBe(code);
  });

  it("quiz missions are validated and stored; game missions need a known game", async () => {
    expect(await saveMission(s.admin, null, input({ kind: "quiz", quiz: null }))).toMatchObject({ ok: false });
    expect(await saveMission(s.admin, null, input({ kind: "quiz", quiz: [{ q: "q", choices: ["a"], answer: 0 }] }))).toMatchObject({ ok: false });
    const r = await saveMission(s.admin, null, input({ kind: "quiz", quiz: QUIZ, quiz_pass: 2 }));
    if (!r.ok) throw new Error(r.error);
    const m = await getMission(s.admin, r.id);
    expect(parseQuiz(m?.quiz)).toEqual(QUIZ);
    expect(m?.quiz_pass).toBe(2);
    // Saving again drops half-finished attempts, which were answering the old questions.
    const a = await startQuiz(s.kid, r.id);
    if (!a.ok) throw new Error();
    await answerQuiz(s.kid, a.attemptId, 0, 0);
    await saveMission(s.admin, r.id, input({ kind: "quiz", quiz: QUIZ.slice(0, 2) }));
    expect(await answerQuiz(s.kid, a.attemptId, 1, 1)).toEqual({ ok: false, reason: "stale" });
    const copy = await duplicateToNextWeek(s.admin, r.id);
    if (!copy.ok) throw new Error(copy.error);
    expect(parseQuiz((await getMission(s.admin, copy.id))?.quiz)).toEqual(QUIZ.slice(0, 2));
    // Quiz data is not kept on a mission of another kind.
    await saveMission(s.admin, r.id, input({ kind: "self", quiz: QUIZ }));
    expect((await getMission(s.admin, r.id))?.quiz).toBeNull();

    expect(await saveMission(s.admin, null, input({ kind: "game", game_id: null }))).toMatchObject({ ok: false });
    expect(await saveMission(s.admin, null, input({ kind: "game", game_id: "nope" }))).toMatchObject({ ok: false });
    const g = await saveMission(s.admin, null, input({ kind: "game", game_id: "memory" }));
    if (!g.ok) throw new Error(g.error);
    expect((await getMission(s.admin, g.id))?.game_id).toBe("memory");
    // Only an admin may save.
    expect(await saveMission({ ...s.admin, role: "head" }, null, input({ kind: "game", game_id: "memory" }))).toMatchObject({ ok: false });
  });
});
