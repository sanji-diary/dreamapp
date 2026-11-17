import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

// A cookie jar standing in for the browser, so the real sign-in code runs.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

import { kidLogin } from "@/lib/auth";
import { ROLE_PRESETS } from "@/lib/authz";
import { db, one, resetDbForTests } from "@/lib/db";
import { completeMission, dropBalance, getSettings, missionsForChild, pointBalance, recordAttendance, reviewCompletion, weekDropsEarned } from "@/lib/game";
import { attendanceStreak, lockMinutes } from "@/lib/kid/queries";
import { hashPin, PIN_LOCK_MINUTES, PIN_MAX_FAILS } from "@/lib/pin";
import { attendanceRoster, streakFrom } from "@/lib/staff/attendance";
import { addDays, todayKst, weekEnd, weekStart } from "@/lib/time";
import type { Staff } from "@/lib/types";

/**
 * Rules that depend on the calendar, checked with fixed dates (a browser cannot move the clock).
 * January 2027: Sundays are the 3rd, 10th and 17th. The church week runs Sunday to Saturday, Korea time.
 */
const SUN1 = "2027-01-03";
const MON1 = "2027-01-04";
const TUE1 = "2027-01-05";
const WED1 = "2027-01-06";
const THU1 = "2027-01-07";
const SAT1 = "2027-01-09";
const SUN2 = "2027-01-10";
const MON2 = "2027-01-11";
const SAT2 = "2027-01-16";

async function setup() {
  resetDbForTests();
  jar.clear();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade, sort) values ('5학년 2반', 5, 1) returning id");
  const p = ROLE_PRESETS.homeroom;
  const st = await db.query<{ id: number }>(
    "insert into staff (name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries) values ('담임','homeroom',$1,$2,$3,$4,$5) returning id",
    [p.can_attendance, p.can_visits, p.can_approve, p.can_view_all, p.can_read_pastor_worries],
  );
  await db.query("insert into staff_classes (staff_id, class_id) values ($1,$2)", [st[0].id, cls[0].id]);
  const teacher: Staff = { id: st[0].id, name: "담임", role: "homeroom", ...p, active: true, class_ids: [cls[0].id] };
  const kid = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token, pin_hash, onboarded_at) values ('아이', $1, 'card-1', $2, now()) returning id", [cls[0].id, await hashPin("4821")]))[0].id;
  /** A mission open from the first Sunday to the second Saturday (two whole weeks) unless other dates are given. */
  const add = async (title: string, kind: string, drops: number, points: number, repeat: string, opts: { limit?: number | null; starts?: string; ends?: string } = {}) => {
    const r = await db.query<{ id: number }>("insert into missions (title, kind, drops, points, repeat, weekly_limit, starts_on, ends_on) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id", [
      title,
      kind,
      drops,
      points,
      repeat,
      opts.limit ?? null,
      opts.starts ?? SUN1,
      opts.ends ?? SAT2,
    ]);
    return r[0].id;
  };
  const stateOn = async (missionId: number, date: string) => (await missionsForChild(db, kid, date)).find((m) => m.id === missionId);
  return { classId: cls[0].id, teacher, kid, add, stateOn };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

describe("the calendar itself", () => {
  it("a day and a week change at midnight in Korea, and the week starts on Sunday", () => {
    // Saturday 23:59:59 in Korea is 14:59:59 UTC; one second later it is Sunday there.
    expect(todayKst(new Date("2027-01-09T14:59:59Z"))).toBe(SAT1);
    expect(todayKst(new Date("2027-01-09T15:00:00Z"))).toBe(SUN2);
    expect(weekStart(SAT1)).toBe(SUN1);
    expect(weekStart(SUN2)).toBe(SUN2);
    expect(weekStart(WED1)).toBe(SUN1);
    expect(weekEnd(SUN1)).toBe(SAT1);
    expect(addDays(SAT1, 1)).toBe(SUN2);
  });
});

describe("a daily mission on the following days", () => {
  it("can be done once a day: refused again the same day, open again the next day", async () => {
    const m = await s.add("매일 기도", "self", 1, 5, "daily", { limit: 3 });
    expect((await s.stateOn(m, MON1))?.state).toBe("available");
    expect(await completeMission(s.kid, m, { date: MON1 })).toMatchObject({ ok: true, drops: 1, points: 5 });
    expect((await s.stateOn(m, MON1))?.state).toBe("done");
    expect(await completeMission(s.kid, m, { date: MON1 })).toMatchObject({ ok: false, reason: "already_done" });
    expect(await dropBalance(db, s.kid)).toBe(1);

    // The next day it is open again and counts once more.
    expect(await s.stateOn(m, TUE1)).toMatchObject({ state: "available", done_this_week: 1 });
    expect(await completeMission(s.kid, m, { date: TUE1 })).toMatchObject({ ok: true, drops: 1, points: 5 });
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(10);
  });

  it("stops at the weekly limit and starts again on the next Sunday", async () => {
    const m = await s.add("매일 기도", "self", 1, 5, "daily", { limit: 3 });
    for (const d of [MON1, TUE1, WED1]) expect(await completeMission(s.kid, m, { date: d })).toMatchObject({ ok: true, drops: 1 });
    // Three times this week: closed on the remaining days even though nothing was done on them.
    expect(await s.stateOn(m, THU1)).toMatchObject({ state: "done", done_this_week: 3 });
    expect(await completeMission(s.kid, m, { date: THU1 })).toMatchObject({ ok: false, reason: "already_done" });
    expect(await completeMission(s.kid, m, { date: SAT1 })).toMatchObject({ ok: false, reason: "already_done" });
    expect(await dropBalance(db, s.kid)).toBe(3);

    // A new week: the count is back to zero.
    expect(await s.stateOn(m, SUN2)).toMatchObject({ state: "available", done_this_week: 0 });
    expect(await completeMission(s.kid, m, { date: SUN2 })).toMatchObject({ ok: true, drops: 1, points: 5 });
    expect(await dropBalance(db, s.kid)).toBe(4);
    expect(await pointBalance(db, s.kid)).toBe(20);
  });

  it("with no limit set it can be done on each of the seven days", async () => {
    const m = await s.add("매일 말씀 읽기", "self", 1, 0, "daily");
    for (let i = 0; i < 7; i++) expect(await completeMission(s.kid, m, { date: addDays(SUN1, i) })).toMatchObject({ ok: true, drops: 1 });
    expect(await dropBalance(db, s.kid)).toBe(7);
    expect(await completeMission(s.kid, m, { date: SAT1 })).toMatchObject({ ok: false, reason: "already_done" });
    expect(await completeMission(s.kid, m, { date: SUN2 })).toMatchObject({ ok: true, drops: 1 });
  });
});

describe("a new week", () => {
  it("opens weekly missions again; a one-time mission stays done", async () => {
    const weekly = await s.add("말씀 쓰기", "self", 2, 15, "weekly");
    const once = await s.add("보물찾기", "self", 1, 10, "once");
    expect(await completeMission(s.kid, weekly, { date: SAT1 })).toMatchObject({ ok: true, drops: 2, points: 15 });
    expect(await completeMission(s.kid, once, { date: SAT1 })).toMatchObject({ ok: true, drops: 1, points: 10 });
    expect(await completeMission(s.kid, weekly, { date: SAT1 })).toMatchObject({ ok: false, reason: "already_done" });

    // One day later is a new week.
    expect((await s.stateOn(weekly, SUN2))?.state).toBe("available");
    expect((await s.stateOn(once, SUN2))?.state).toBe("done");
    expect(await completeMission(s.kid, weekly, { date: SUN2 })).toMatchObject({ ok: true, drops: 2, points: 15 });
    expect(await completeMission(s.kid, once, { date: SUN2 })).toMatchObject({ ok: false, reason: "already_done" });
    expect(await dropBalance(db, s.kid)).toBe(5);
    expect(await pointBalance(db, s.kid)).toBe(40);
  });

  it("gives a fresh weekly cap of 12 drops; the week before stays at 12", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) ids.push(await s.add("미션" + i, "self", 3, 10, "weekly"));
    const got: number[] = [];
    for (const id of ids) {
      const r = await completeMission(s.kid, id, { date: WED1 });
      if (r.ok) got.push(r.drops);
    }
    // 3 + 3 + 3 + 3 = 12, then nothing more this week; points are never capped.
    expect(got).toEqual([3, 3, 3, 3, 0]);
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(12);
    expect(await pointBalance(db, s.kid)).toBe(50);
    expect((await getSettings()).weeklyDropCap).toBe(12);

    // Sunday: the same missions give drops again, up to 12 for the new week.
    expect((await s.stateOn(ids[0], SUN2))?.drops_now).toBe(3);
    const again: number[] = [];
    for (const id of ids) {
      const r = await completeMission(s.kid, id, { date: MON2 });
      if (r.ok) again.push(r.drops);
    }
    expect(again).toEqual([3, 3, 3, 3, 0]);
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(12);
    expect(await weekDropsEarned(db, s.kid, SUN2)).toBe(12);
    expect(await dropBalance(db, s.kid)).toBe(24);
    expect(await pointBalance(db, s.kid)).toBe(100);
  });

  it("a photo sent on Saturday and approved the next week counts toward the week it was sent in", async () => {
    const filler = await s.add("미션", "self", 5, 0, "daily");
    const photo = await s.add("가정예배", "photo", 3, 30, "weekly");
    // 10 drops earned on Monday and Tuesday of week 1.
    await completeMission(s.kid, filler, { date: MON1 });
    await completeMission(s.kid, filler, { date: TUE1 });
    const sent = await completeMission(s.kid, photo, { date: SAT1, photoUrl: "/api/photo/1" });
    if (!sent.ok) throw new Error("photo not accepted");
    expect(sent).toMatchObject({ status: "pending", drops: 0, points: 0 });
    // The teacher approves it in week 2 (whenever that is): only the 2 drops left in week 1 are given.
    expect(await reviewCompletion(s.teacher.id, sent.completionId, true)).toBe(true);
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(12);
    expect(await weekDropsEarned(db, s.kid, SUN2)).toBe(0);
    expect(await dropBalance(db, s.kid)).toBe(12);
    expect(await pointBalance(db, s.kid)).toBe(30);
    // Week 2 still has its whole cap, and the photo mission is open again there.
    expect(await s.stateOn(photo, MON2)).toMatchObject({ state: "available", drops_now: 3 });
  });

  it("attendance marked later for a past Sunday is credited to that Sunday's week; with no mission that day nothing is credited", async () => {
    const att = await s.add("주일 예배 출석", "attendance", 2, 20, "weekly", { starts: SUN1, ends: SAT1 });
    // The teacher fills in last Sunday's roll on Wednesday of the following week.
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    const c = await one<{ done_on: string; week_start: string; drops_awarded: number }>(db, "select done_on, week_start, drops_awarded from mission_completions where mission_id = $1", [att]);
    expect(c).toEqual({ done_on: SUN1, week_start: SUN1, drops_awarded: 2 });
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(2);
    // The mission ended on Saturday: the next Sunday's attendance is saved but gives nothing.
    await recordAttendance(s.teacher.id, s.kid, SUN2, "present");
    expect(await db.query("select date from attendance where child_id = $1 order by date", [s.kid])).toEqual([{ date: SUN1 }, { date: SUN2 }]);
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(20);
  });
});

describe("a child who comes back after being away", () => {
  // The settings table has 'welcome_back_drops' (2) and getSettings() reads it, but no code gives these drops
  // and no rule says when a child counts as "back". Left as a to-do until the rule is decided (see the QA report).
  it.todo("receives the welcome-back drops");

  it("loses nothing while away: drops, points and the tree are as they were weeks later", async () => {
    const m = await s.add("기도", "self", 2, 10, "weekly", { ends: "2027-12-31" });
    await completeMission(s.kid, m, { date: MON1 });
    // Ten weeks later, with nothing done in between.
    const later = addDays(MON1, 70);
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(10);
    expect(await s.stateOn(m, later)).toMatchObject({ state: "available", drops_now: 2 });
    expect(await completeMission(s.kid, m, { date: later })).toMatchObject({ ok: true, drops: 2, points: 10 });
  });
});

describe("absences in a row", () => {
  const mark = (date: string, status: string) => db.query("insert into attendance (child_id, date, status) values ($1,$2,$3)", [s.kid, date, status]);
  const prior = async (date: string) => (await attendanceRoster(s.teacher, s.classId, date))?.[0].prior;

  it("the roll for each Sunday shows how many Sundays in a row the child missed before it", async () => {
    // Dec 6 present, Dec 13 / 20 / 27 absent.
    await mark("2026-12-06", "present");
    await mark("2026-12-13", "absent");
    await mark("2026-12-20", "absent");
    await mark("2026-12-27", "absent");
    expect(await prior("2026-12-13")).toEqual({ kind: "attend", n: 1 });
    expect(await prior("2026-12-20")).toEqual({ kind: "absent", n: 1 });
    // From the second absence in a row the teacher is warned ("2주 연속 결석").
    expect(await prior("2026-12-27")).toEqual({ kind: "absent", n: 2 });
    expect(await prior(SUN1)).toEqual({ kind: "absent", n: 3 });

    // Coming back (late counts as attending) ends the run.
    await mark(SUN1, "late");
    expect(await prior(SUN2)).toEqual({ kind: "attend", n: 1 });
  });

  it("a Sunday with no roll call breaks the run instead of joining two runs together", async () => {
    await mark("2026-12-13", "absent");
    await mark("2026-12-27", "absent");
    // Dec 20 was never recorded.
    expect(await prior(SUN1)).toEqual({ kind: "absent", n: 1 });
    const byDate = new Map([["2026-12-13", "absent"], ["2026-12-27", "absent"]]);
    expect(streakFrom(byDate, "2026-12-27")).toEqual({ kind: "absent", n: 1 });
    expect(streakFrom(byDate, "2026-12-20")).toEqual({ kind: null, n: 0 });
  });

  it("the child's own '연속 출석' counts back from the chosen day and ignores a week not called yet", async () => {
    await mark("2026-12-20", "present");
    await mark("2026-12-27", "late");
    await mark(SUN1, "present");
    expect(await attendanceStreak(s.kid, WED1)).toBe(3);
    // The following Wednesday, before that Sunday's roll is entered: still 3.
    expect(await attendanceStreak(s.kid, addDays(WED1, 7))).toBe(3);
    await mark(SUN2, "absent");
    expect(await attendanceStreak(s.kid, addDays(WED1, 7))).toBe(0);
    // Looking back at an earlier day does not see later Sundays.
    expect(await attendanceStreak(s.kid, "2026-12-30")).toBe(2);
  });
});

describe("the PIN lock and the clock", () => {
  it("locks after five wrong tries for ten minutes, refuses even the right PIN meanwhile, and opens again afterwards", async () => {
    for (let i = 1; i < PIN_MAX_FAILS; i++) expect(await kidLogin("card-1", "0000")).toEqual({ ok: false, reason: "wrong", left: PIN_MAX_FAILS - i });
    expect(await kidLogin("card-1", "0000")).toMatchObject({ ok: false, reason: "locked" });
    expect(await lockMinutes("card-1")).toBe(PIN_LOCK_MINUTES);
    expect(await kidLogin("card-1", "4821")).toMatchObject({ ok: false, reason: "locked" });

    // Nine minutes later: still locked, one minute left.
    await db.query("update children set pin_locked_until = pin_locked_until - interval '9 minutes' where id = $1", [s.kid]);
    expect(await lockMinutes("card-1")).toBe(1);
    expect(await kidLogin("card-1", "4821")).toMatchObject({ ok: false, reason: "locked" });

    // Ten minutes after the lock began: the right PIN works and the count of wrong tries starts over.
    await db.query("update children set pin_locked_until = pin_locked_until - interval '1 minute 1 second' where id = $1", [s.kid]);
    expect(await lockMinutes("card-1")).toBe(0);
    expect(await kidLogin("card-1", "0000")).toEqual({ ok: false, reason: "wrong", left: PIN_MAX_FAILS - 1 });
    expect(await kidLogin("card-1", "4821")).toEqual({ ok: true, childId: s.kid });
  });
});
