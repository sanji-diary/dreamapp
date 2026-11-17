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
import { completeMission, dropBalance, getSettings, missionsForChild, pointBalance, recordAttendance, reviewCompletion, waterTree, weekDropsEarned, welcomeBackToday } from "@/lib/game";
import { scanQr } from "@/lib/kid/qr";
import { attendanceStreak, lockMinutes } from "@/lib/kid/queries";
import { hashPin, PIN_LOCK_MINUTES, PIN_MAX_FAILS } from "@/lib/pin";
import { attendanceRoster, saveAttendance, streakFrom } from "@/lib/staff/attendance";
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

describe("a child who comes back after being away (반가워 물방울)", () => {
  // Sundays before the first one above. "The roll was taken" on a Sunday when anyone has a mark that day.
  const D13 = "2026-12-13";
  const D20 = "2026-12-20";
  const D27 = "2026-12-27";
  const SUN3 = "2027-01-17";
  let friend: number;
  const mark = (child: number, date: string, status: string) => db.query("insert into attendance (child_id, date, status) values ($1,$2,$3)", [child, date, status]);
  const welcomeRows = (child: number = s.kid) => db.query<{ delta: number; week_start: string }>("select delta, week_start from drop_ledger where child_id = $1 and ref_type = 'welcome' order by id", [child]);
  /** The roll was taken on these Sundays (the friend was there); the child has no mark on them. */
  const rollTaken = async (...dates: string[]) => {
    for (const d of dates) await mark(friend, d, "present");
  };

  beforeEach(async () => {
    friend = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('친구', $1, 'card-2') returning id", [s.classId]))[0].id;
    // Both children were registered well before the Sundays used here.
    await db.query("update children set created_at = '2026-11-01T10:00:00+09:00'");
  });

  it("receives the welcome-back drops after missing the two Sundays before, once", async () => {
    await rollTaken(D20, D27);
    // One Sunday marked absent, the other not marked at all: both are missed.
    await mark(s.kid, D27, "absent");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await welcomeRows()).toEqual([{ delta: 2, week_start: SUN1 }]);
    expect((await getSettings()).welcomeBackDrops).toBe(2);
    // A greeting, not a mission: nothing is counted toward the weekly cap.
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(0);
    expect(await pointBalance(db, s.kid)).toBe(0);

    // Changing the mark to late and back gives nothing more.
    await recordAttendance(s.teacher.id, s.kid, SUN1, "late");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await welcomeRows()).toHaveLength(1);

    // The friend came both Sundays: no greeting. And the child, here last week, is not "back" the week after.
    await recordAttendance(s.teacher.id, friend, SUN1, "present");
    expect(await dropBalance(db, friend)).toBe(0);
    await recordAttendance(s.teacher.id, s.kid, SUN2, "present");
    expect(await dropBalance(db, s.kid)).toBe(2);
  });

  it("coming late counts as coming back, and the amount follows the setting", async () => {
    await rollTaken(D20, D27);
    await db.query("update settings set value = '3' where key = 'welcome_back_drops'");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "late");
    expect(await welcomeRows()).toEqual([{ delta: 3, week_start: SUN1 }]);
    // Switched off: nothing is given.
    await db.query("update settings set value = '0' where key = 'welcome_back_drops'");
    const other = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token, created_at) values ('셋째', $1, 'card-3', '2026-11-01T10:00:00+09:00') returning id", [s.classId]))[0].id;
    await recordAttendance(s.teacher.id, other, SUN1, "present");
    expect(await welcomeRows(other)).toEqual([]);
  });

  it("is given beside the attendance mission and on top of a full weekly cap", async () => {
    await s.add("주일 예배 출석", "attendance", 2, 20, "weekly");
    const filler = await s.add("미션", "self", 6, 0, "daily");
    await rollTaken(D20, D27);
    // The week's 12 drops are already earned when the teacher fills in Sunday's roll.
    await completeMission(s.kid, filler, { date: MON1 });
    await completeMission(s.kid, filler, { date: TUE1 });
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(12);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    // The attendance mission gives its points but no drops (the cap); the greeting is given all the same.
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(12);
    expect(await dropBalance(db, s.kid)).toBe(14);
    expect(await pointBalance(db, s.kid)).toBe(20);

    // With room under the cap both arrive: 2 for the mission, 2 for coming back. Only the mission's 2 count toward the cap.
    const other = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token, created_at) values ('셋째', $1, 'card-3', '2026-11-01T10:00:00+09:00') returning id", [s.classId]))[0].id;
    await recordAttendance(s.teacher.id, other, SUN1, "late");
    expect(await dropBalance(db, other)).toBe(4);
    expect(await weekDropsEarned(db, other, SUN1)).toBe(2);
    expect(await pointBalance(db, other)).toBe(20);
  });

  it("is not given to a child who came on one of the two Sundays", async () => {
    await rollTaken(D20, D27);
    await mark(s.kid, D20, "present");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await welcomeRows()).toEqual([]);
    // Late on the more recent one is "came" too.
    await db.query("delete from attendance where child_id = $1", [s.kid]);
    await mark(s.kid, D27, "late");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await welcomeRows()).toEqual([]);
    expect(await dropBalance(db, s.kid)).toBe(0);
  });

  it("is never given in the first weeks of the app: two earlier Sundays with a roll are needed", async () => {
    // No roll was ever taken.
    await recordAttendance(s.teacher.id, s.kid, D20, "present");
    expect(await welcomeRows()).toEqual([]);
    // One earlier Sunday with a roll (the child missed it).
    await db.query("delete from attendance");
    await rollTaken(D27);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await welcomeRows()).toEqual([]);
    expect(await dropBalance(db, s.kid)).toBe(0);
  });

  it("is never given to a new child: only Sundays since the child was registered count", async () => {
    await rollTaken(D13, D20, D27, SUN1, SUN2);
    // Registered on Tuesday, December 29: the Sundays before that are not the child's to miss.
    await db.query("update children set created_at = '2026-12-29T19:00:00+09:00' where id = $1", [s.kid]);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await welcomeRows()).toEqual([]);
    // One Sunday later there is still only one Sunday behind the child.
    await db.query("delete from attendance where child_id = $1", [s.kid]);
    await recordAttendance(s.teacher.id, s.kid, SUN2, "present");
    expect(await welcomeRows()).toEqual([]);
    // Having really missed two Sundays since registering, the child is welcomed back like anyone else.
    await db.query("delete from attendance where child_id = $1", [s.kid]);
    await recordAttendance(s.teacher.id, s.kid, SUN3, "present");
    expect(await welcomeRows()).toEqual([{ delta: 2, week_start: SUN3 }]);
  });

  it("the registration day is a Korea date, and a Sunday on that very day counts", async () => {
    await rollTaken(D20, D27);
    // 00:30 on Sunday, December 20 in Korea is still Saturday in UTC.
    await db.query("update children set created_at = '2026-12-20T00:30:00+09:00' where id = $1", [s.kid]);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await welcomeRows()).toEqual([{ delta: 2, week_start: SUN1 }]);
    // One day later and only December 27 is left: not enough.
    const late = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token, created_at) values ('늦게 온 친구', $1, 'card-3', '2026-12-21T00:30:00+09:00') returning id", [s.classId]))[0].id;
    await recordAttendance(s.teacher.id, late, SUN1, "present");
    expect(await welcomeRows(late)).toEqual([]);
  });

  it("a Sunday when no roll was taken is skipped, and marks on other days are not Sundays", async () => {
    // Rolls on December 13 and 27; nothing at all on the 20th. The child missed both rolls.
    await rollTaken(D13, D27);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await welcomeRows()).toEqual([{ delta: 2, week_start: SUN1 }]);

    // Had the child been there on the 13th, the two Sundays looked at (27th and 13th) are not both missed.
    await db.query("delete from attendance where child_id = $1", [s.kid]);
    await db.query("delete from drop_ledger");
    await mark(s.kid, D13, "present");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await welcomeRows()).toEqual([]);
  });

  it("weekday marks neither count as a Sunday roll nor bring the drops", async () => {
    // One Sunday roll, and stray marks on a Wednesday and a Thursday.
    await rollTaken(D27, "2026-12-23", "2026-12-24");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await welcomeRows()).toEqual([]);
    // Two missed Sunday rolls, but the mark that brings the child "back" is on a Wednesday.
    await db.query("delete from attendance where child_id = $1", [s.kid]);
    await rollTaken(D20);
    await recordAttendance(s.teacher.id, s.kid, "2026-12-30", "present");
    expect(await welcomeRows()).toEqual([]);
    expect(await dropBalance(db, s.kid)).toBe(0);
  });

  it("is taken back when the mark turns out wrong and given again when it is set again", async () => {
    await rollTaken(D20, D27);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await dropBalance(db, s.kid)).toBe(2);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "absent");
    expect(await dropBalance(db, s.kid)).toBe(0);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await dropBalance(db, s.kid)).toBe(2);
    // Clearing the mark takes it back as well. The ledger only ever grows.
    await recordAttendance(s.teacher.id, s.kid, SUN1, null);
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect((await welcomeRows()).map((r) => r.delta)).toEqual([2, -2, 2, -2]);
    expect(await db.query("select staff_id from drop_ledger where delta < 0")).toEqual([{ staff_id: s.teacher.id }, { staff_id: s.teacher.id }]);
  });

  it("taking it back never goes below zero, and giving it again never adds up to more than once", async () => {
    await rollTaken(D20, D27);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await waterTree(s.kid)).toMatchObject({ ok: true, drops: 1 });
    // One drop is in the tree: only the one still held can be taken back.
    await recordAttendance(s.teacher.id, s.kid, SUN1, "absent");
    expect(await dropBalance(db, s.kid)).toBe(0);
    // Set again: only the drop that was taken back is given again.
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await dropBalance(db, s.kid)).toBe(1);
    expect((await welcomeRows()).map((r) => r.delta)).toEqual([2, -1, 1]);
    // Both drops watered, then corrected: nothing to take, nothing given again.
    await waterTree(s.kid);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "absent");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect((await welcomeRows()).map((r) => r.delta)).toEqual([2, -1, 1]);
  });

  it("a QR self check-in on Sunday brings it too", async () => {
    await db.query("insert into missions (title, kind, drops, points, repeat, starts_on, ends_on, qr_code) values ('주일 예배 출석','attendance',2,20,'weekly',$1,$2,'att-code-001')", [SUN1, SAT1]);
    await rollTaken(D20, D27);
    expect(await scanQr(s.kid, "att-code-001", SUN1)).toMatchObject({ ok: true, kind: "attendance" });
    expect(await dropBalance(db, s.kid)).toBe(4);
    expect(await welcomeRows()).toEqual([{ delta: 2, week_start: SUN1 }]);
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(2);
  });

  it("the home screen is told about it on the day it was given, until the child waters or the day ends", async () => {
    await rollTaken(D20, D27);
    expect(await welcomeBackToday(db, s.kid)).toBe(0);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    // "Today" is the Korea day the drops were written, whatever Sunday they are for.
    const row = await one<{ created_at: Date }>(db, "select created_at from drop_ledger where ref_type = 'welcome'");
    const today = todayKst(new Date(row!.created_at));
    expect(await welcomeBackToday(db, s.kid, today)).toBe(2);
    expect(await welcomeBackToday(db, friend, today)).toBe(0);
    // The day is over.
    expect(await welcomeBackToday(db, s.kid, addDays(today, 1))).toBe(0);
    expect(await welcomeBackToday(db, s.kid, addDays(today, -1))).toBe(0);
    // Taken back by a correction: nothing to greet. Set again: greeted again.
    await recordAttendance(s.teacher.id, s.kid, SUN1, "absent");
    expect(await welcomeBackToday(db, s.kid, today)).toBe(0);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await welcomeBackToday(db, s.kid, today)).toBe(2);
    // The child waters the tree: the usual lines take over.
    await waterTree(s.kid);
    expect(await welcomeBackToday(db, s.kid, today)).toBe(0);
  });

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

describe("correcting an attendance mark", () => {
  const completions = () => db.query<{ status: string; drops_awarded: number }>("select status, drops_awarded from mission_completions where child_id = $1 order by id", [s.kid]);

  it("takes back only the drops the child still has: the balance never goes below zero, the points go back in full", async () => {
    await s.add("주일 예배 출석", "attendance", 2, 20, "weekly");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    // Both drops go into the tree before the teacher notices the wrong tap.
    await waterTree(s.kid);
    await waterTree(s.kid);
    expect(await dropBalance(db, s.kid)).toBe(0);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "absent");
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(await pointBalance(db, s.kid)).toBe(0);
    expect(await db.query("select 1 from drop_ledger where delta < 0 and ref_type = 'mission'")).toEqual([]);

    // Present after all: no drops were taken back, so none are given again; the points return.
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(await pointBalance(db, s.kid)).toBe(20);
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(2);
    // The new completion stands for the 2 drops this attendance holds in all.
    expect(await completions()).toEqual([{ status: "rejected", drops_awarded: 2 }, { status: "approved", drops_awarded: 2 }]);
  });

  it("an absent → present toggle gives back exactly what was taken, however often it happens", async () => {
    await s.add("주일 예배 출석", "attendance", 2, 20, "weekly");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    await waterTree(s.kid);
    for (let i = 0; i < 4; i++) {
      // One drop is in the tree and stays there; the other goes back and forth.
      await recordAttendance(s.teacher.id, s.kid, SUN1, i % 2 === 0 ? "absent" : null);
      expect(await dropBalance(db, s.kid)).toBe(0);
      expect(await pointBalance(db, s.kid)).toBe(0);
      await recordAttendance(s.teacher.id, s.kid, SUN1, i % 2 === 0 ? "present" : "late");
      expect(await dropBalance(db, s.kid)).toBe(1);
      expect(await pointBalance(db, s.kid)).toBe(20);
      // Never more than the mission's 2 drops for this one Sunday.
      expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(2);
    }
    expect((await db.query<{ n: number }>("select coalesce(sum(delta),0)::int as n from drop_ledger where child_id = $1 and delta > 0 and ref_type = 'mission'", [s.kid]))[0].n).toBe(2 + 4);
  });

  it("with nothing watered, any number of toggles ends at the mission's drops", async () => {
    await s.add("주일 예배 출석", "attendance", 2, 20, "weekly");
    for (let i = 0; i < 3; i++) {
      await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
      expect(await dropBalance(db, s.kid)).toBe(2);
      await recordAttendance(s.teacher.id, s.kid, SUN1, "absent");
      expect(await dropBalance(db, s.kid)).toBe(0);
    }
    await recordAttendance(s.teacher.id, s.kid, SUN1, "late");
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(20);
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(2);
  });

  it("drops that could not be taken back at first are taken once the child has some again", async () => {
    await s.add("주일 예배 출석", "attendance", 2, 20, "weekly");
    const other = await s.add("기도", "self", 3, 0, "weekly");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    await waterTree(s.kid);
    await waterTree(s.kid);
    await recordAttendance(s.teacher.id, s.kid, SUN1, "absent");
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await dropBalance(db, s.kid)).toBe(0);
    // Three drops from another mission, then the mark is corrected to absent for good.
    await completeMission(s.kid, other, { date: MON1 });
    await recordAttendance(s.teacher.id, s.kid, SUN1, "absent");
    expect(await dropBalance(db, s.kid)).toBe(1);
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(3);
    // And if it was right after all, the 2 drops come back once.
    await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
    expect(await dropBalance(db, s.kid)).toBe(3);
    expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(5);
  });

  it("the weekly cap still holds through corrections", async () => {
    await s.add("주일 예배 출석", "attendance", 2, 20, "weekly");
    const filler = await s.add("미션", "self", 5, 0, "daily");
    const small = await s.add("작은 미션", "self", 1, 0, "weekly");
    await completeMission(s.kid, filler, { date: MON1 });
    await completeMission(s.kid, filler, { date: TUE1 });
    await completeMission(s.kid, small, { date: TUE1 });
    // 11 earned: the attendance mission can add only 1.
    for (let i = 0; i < 3; i++) {
      await recordAttendance(s.teacher.id, s.kid, SUN1, "present");
      expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(12);
      expect(await dropBalance(db, s.kid)).toBe(12);
      await recordAttendance(s.teacher.id, s.kid, SUN1, "absent");
      expect(await weekDropsEarned(db, s.kid, SUN1)).toBe(11);
    }
  });
});

describe("attendance belongs to Sunday", () => {
  // The teacher's screen refuses dates that have not come yet, so these days are counted back from the real today.
  const SUN = weekStart(todayKst());

  it("the teacher's screen records present, late and absent on Sundays only", async () => {
    for (let back = 1; back <= 6; back++) {
      for (const status of ["present", "late", "absent"] as const) {
        expect(await saveAttendance(s.teacher, s.kid, addDays(SUN, -back), status)).toEqual({ ok: false, error: "출석은 주일에만 기록할 수 있어요" });
      }
    }
    expect(await db.query("select 1 from attendance")).toEqual([]);
    expect(await saveAttendance(s.teacher, s.kid, SUN, "present")).toEqual({ ok: true });
    expect(await saveAttendance(s.teacher, s.kid, addDays(SUN, -7), "absent", "가족 여행")).toEqual({ ok: true });
    expect(await db.query("select date, status from attendance order by date")).toEqual([{ date: addDays(SUN, -7), status: "absent" }, { date: SUN, status: "present" }]);
  });

  it("a mark that sits on another day can still be cleared, and its award goes back", async () => {
    const wed = addDays(SUN, -4);
    await s.add("주일 예배 출석", "attendance", 2, 20, "weekly", { starts: addDays(SUN, -7), ends: addDays(SUN, -1) });
    // Saved before this rule existed (the library itself does not ask what day it is).
    await recordAttendance(s.teacher.id, s.kid, wed, "present");
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await saveAttendance(s.teacher, s.kid, wed, "late")).toMatchObject({ ok: false });
    expect(await saveAttendance(s.teacher, s.kid, wed, null)).toEqual({ ok: true });
    expect(await db.query("select 1 from attendance")).toEqual([]);
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(await pointBalance(db, s.kid)).toBe(0);
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
