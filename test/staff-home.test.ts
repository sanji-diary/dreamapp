import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { ROLE_PRESETS } from "@/lib/authz";
import { db, resetDbForTests } from "@/lib/db";
import { canWriteAnyVisits, fifthTab, quickActions } from "@/lib/staff/access";
import { childStats } from "@/lib/staff/children";
import { classStats, forestLevel, homeData, homeKind, pickTrees, resolveWeek, shortClassName, unreadWorries } from "@/lib/staff/home";
import { addDays, todayKst, weekLabel, weekStart } from "@/lib/time";
import type { Role, Staff } from "@/lib/types";

const TODAY = todayKst();
const WS = weekStart(TODAY);

/** Loads a teacher the way getStaff() does. */
async function load(id: number): Promise<Staff> {
  const rows = await db.query<Omit<Staff, "class_ids">>("select id, name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries, active from staff where id = $1", [id]);
  const cls = await db.query<{ class_id: number }>("select class_id from staff_classes where staff_id = $1", [id]);
  return { ...rows[0], class_ids: cls.map((c) => c.class_id) };
}

/** Two classes. A: 가은, 다은 (teacher 담임). B: 나은 (teacher 옆반담임). */
async function setup() {
  resetDbForTests();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade, sort) values ('5학년 2반', 5, 1), ('6학년 1반', 6, 2) returning id");
  const [A, B] = cls.map((c) => c.id);
  const mk = async (name: string, role: Role, classId?: number) => {
    const p = ROLE_PRESETS[role];
    const r = await db.query<{ id: number }>(
      "insert into staff (name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries) values ($1,$2,$3,$4,$5,$6,$7) returning id",
      [name, role, p.can_attendance, p.can_visits, p.can_approve, p.can_view_all, p.can_read_pastor_worries],
    );
    if (classId) await db.query("insert into staff_classes (staff_id, class_id) values ($1,$2)", [r[0].id, classId]);
    return r[0].id;
  };
  const ids = { admin: await mk("관리자", "admin"), homeroom: await mk("담임", "homeroom", A), other: await mk("옆반담임", "homeroom", B), head: await mk("부장", "head"), basic: await mk("기본", "basic") };
  const kid = async (name: string, classId: number, token: string, level: number) => {
    const id = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token, school, onboarded_at) values ($1,$2,$3,'숲초',now()) returning id", [name, classId, token]))[0].id;
    await db.query("insert into trees (child_id, seq, level) values ($1, 1, $2)", [id, level]);
    return id;
  };
  const kidA = await kid("가은", A, "ta", 4);
  const kidA2 = await kid("다은", A, "ta2", 1);
  const kidB = await kid("나은", B, "tb", 6);
  const staff = { admin: await load(ids.admin), homeroom: await load(ids.homeroom), other: await load(ids.other), head: await load(ids.head), basic: await load(ids.basic) };
  return { A, B, kidA, kidA2, kidB, ids, staff };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

const att = (child: number, date: string, status: string) => db.query("insert into attendance (child_id, date, status) values ($1,$2,$3)", [child, date, status]);
const drops = (child: number, ws: string, n: number, ref = "mission") => db.query("insert into drop_ledger (child_id, delta, reason, ref_type, week_start) values ($1,$2,'테스트',$3,$4)", [child, n, ref, ws]);

describe("weekLabel", () => {
  it("names a week after its Sunday, counted within that Sunday's month", () => {
    expect(weekLabel("2026-11-15")).toBe("11월 3주차"); // a Sunday
    expect(weekLabel("2026-11-17")).toBe("11월 3주차"); // the Tuesday after
    expect(weekLabel("2026-11-21")).toBe("11월 3주차"); // Saturday, last day of that week
    expect(weekLabel("2026-11-14")).toBe("11월 2주차"); // the Saturday before
    expect(weekLabel("2026-11-01")).toBe("11월 1주차"); // the month starts on a Sunday
    expect(weekLabel("2026-11-29")).toBe("11월 5주차");
  });

  it("keeps the Sunday's month when the week runs into the next month or year", () => {
    expect(weekLabel("2026-10-31")).toBe("10월 4주차"); // Saturday; its Sunday is October 25
    expect(weekLabel("2026-12-02")).toBe("11월 5주차"); // Wednesday; its Sunday is November 29
    expect(weekLabel("2026-12-06")).toBe("12월 1주차");
    expect(weekLabel("2027-01-01")).toBe("12월 4주차"); // Friday; its Sunday is December 27
    expect(weekLabel("2027-01-03")).toBe("1월 1주차");
    expect(weekLabel("2024-02-29")).toBe("2월 4주차"); // leap day, Thursday; its Sunday is February 25
  });
});

describe("phone tab bar and the + sheet", () => {
  it("the fifth tab is 더보기 for teachers who see every class, 출석 for a homeroom teacher", () => {
    expect(fifthTab(s.staff.admin)).toBe("more");
    expect(fifthTab(s.staff.head)).toBe("more");
    expect(fifthTab({ ...s.staff.homeroom, can_view_all: true })).toBe("more");
    expect(fifthTab(s.staff.homeroom)).toBe("attendance");
    expect(fifthTab(s.staff.basic)).toBe("more");
    // Without anything to take attendance for, the tab would lead nowhere: such teachers keep 더보기.
    expect(fifthTab({ ...s.staff.homeroom, can_attendance: false })).toBe("more");
    expect(fifthTab({ ...s.staff.homeroom, class_ids: [] })).toBe("more");
    expect(fifthTab({ ...s.staff.basic, can_attendance: true, can_view_all: true })).toBe("more");
  });

  it("the sheet offers only what the teacher may do", () => {
    expect(quickActions(s.staff.homeroom, false)).toEqual({ attendance: true, visit: true, proxy: true, festival: false });
    // 부장 reads visit notes but does not write them.
    expect(quickActions(s.staff.head, true)).toEqual({ attendance: true, visit: false, proxy: true, festival: true });
    expect(quickActions(s.staff.admin, false)).toMatchObject({ attendance: true, visit: true, proxy: true });
    expect(quickActions(s.staff.basic, false)).toEqual({ attendance: false, visit: false, proxy: false, festival: false });
    expect(quickActions(s.staff.basic, true).festival).toBe(true);
    expect(canWriteAnyVisits({ ...s.staff.homeroom, can_visits: false })).toBe(false);
    expect(canWriteAnyVisits({ ...s.staff.homeroom, class_ids: [] })).toBe(false);
  });
});

describe("home: which week", () => {
  it("?w= moves between weeks and never into the future", () => {
    const today = "2026-11-17";
    expect(resolveWeek(undefined, today)).toEqual({ start: "2026-11-15", label: "11월 3주차", current: true, prev: "2026-11-08", next: null });
    // Any day of a past week points at that week's Sunday.
    expect(resolveWeek("2026-11-10", today)).toEqual({ start: "2026-11-08", label: "11월 2주차", current: false, prev: "2026-11-01", next: "2026-11-15" });
    expect(resolveWeek("2026-11-25", today).start).toBe("2026-11-15");
    expect(resolveWeek("2026-11-22", today)).toMatchObject({ current: true, next: null });
    for (const junk of ["", "abc", "2026-13-40", "20261108", ["2026-11-08"], 20261108, null]) expect(resolveWeek(junk, today)).toMatchObject({ start: "2026-11-15", current: true });
    // Too far back is treated like no choice at all.
    expect(resolveWeek("2019-01-06", today).current).toBe(true);
  });
});

describe("home: numbers follow the teacher's classes", () => {
  async function seed() {
    await att(s.kidA, WS, "present");
    await att(s.kidA2, WS, "absent");
    await att(s.kidB, WS, "late");
    await drops(s.kidA, WS, 3);
    await drops(s.kidB, WS, 5);
    await drops(s.kidA, WS, 4, "seed"); // not from a mission: does not count toward the class goal
    await drops(s.kidA, WS, -1, "tree"); // watering the tree does not take away from what the class earned
    const m = (await db.query<{ id: number }>("insert into missions (title, kind, starts_on, ends_on) values ('사진 미션','photo',$1,$2) returning id", [WS, addDays(WS, 6)]))[0].id;
    await db.query("insert into mission_completions (mission_id, child_id, status, photo_url, done_on, week_start) values ($1,$2,'pending','/api/photo/1',$3,$4)", [m, s.kidA, TODAY, WS]);
    await db.query("insert into mission_completions (mission_id, child_id, status, done_on, week_start) values ($1,$2,'approved',$3,$4)", [m, s.kidB, TODAY, WS]);
  }

  it("a homeroom teacher gets only their own class", async () => {
    await seed();
    expect(homeKind(s.staff.homeroom)).toBe("class");
    const d = await homeData(s.staff.homeroom, { today: TODAY });
    expect(d.classes.map((c) => c.name)).toEqual(["5학년 2반"]);
    expect(d.totals).toEqual({ kids: 2, recorded: 2, present: 1, drops: 3, approved: 0 });
    expect(d).toMatchObject({ kind: "class", trees: 2, goal: 30, classGoal: 30, pending: { total: 1, photos: 1 }, participants: { joined: 2, did: 1 }, canAttend: true, unchecked: 0, past: null });
    expect(d.kidTrees.map((k) => [k.name, k.level])).toEqual([["가은", 4], ["다은", 1]]);
    expect(JSON.stringify(d)).not.toContain("나은");

    const o = await homeData(s.staff.other, { today: TODAY });
    expect(o.classes.map((c) => c.name)).toEqual(["6학년 1반"]);
    expect(o.totals).toEqual({ kids: 1, recorded: 1, present: 1, drops: 5, approved: 1 });
    expect(o.pending.total).toBe(0);
    expect(o.kidTrees.map((k) => k.name)).toEqual(["나은"]);
  });

  it("부장 and 교역자 get every class; a teacher without a class gets none", async () => {
    await seed();
    // A child who registered alone and has no class yet: counted as a tree only by teachers who see every class.
    await db.query("insert into children (name, qr_token, self_joined) values ('스스로','tself',true)");
    for (const st of [s.staff.head, s.staff.admin, { ...s.staff.homeroom, can_view_all: true }]) {
      const d = await homeData(st, { today: TODAY });
      expect(d.kind).toBe("all");
      expect(d.classes.map((c) => [c.short, c.kids, c.present, c.drops])).toEqual([["5-2", 2, 1, 3], ["6-1", 1, 1, 5]]);
      expect(d.totals).toEqual({ kids: 3, recorded: 3, present: 2, drops: 8, approved: 1 });
      expect(d).toMatchObject({ trees: 4, goal: 60, kidTrees: [], pending: { total: 1 }, joiners: 1 });
    }
    const b = await homeData(s.staff.basic, { today: TODAY });
    expect(b).toMatchObject({ kind: "none", classes: [], trees: 0, goal: 0, kidTrees: [], pending: { total: 0, photos: 0 }, worries: [], absent: [], joiners: 0, canAttend: false, unchecked: 0 });
    expect(b.totals).toEqual({ kids: 0, recorded: 0, present: 0, drops: 0, approved: 0 });
    expect(await classStats(s.staff.basic, WS)).toEqual([]);
    // A homeroom teacher never has the new-joiner job.
    expect((await homeData(s.staff.homeroom, { today: TODAY })).joiners).toBe(0);
  });

  it("long absences and who may write the visit note", async () => {
    for (const k of [s.kidA, s.kidB]) {
      await att(k, addDays(WS, -7), "absent");
      await att(k, addDays(WS, -14), "absent");
    }
    expect((await homeData(s.staff.homeroom, { today: TODAY })).absent).toEqual([{ id: s.kidA, name: "가은", class_name: "5학년 2반", weeks: 2, canWriteVisit: true }]);
    const head = (await homeData(s.staff.head, { today: TODAY })).absent;
    expect(head.map((k) => [k.name, k.canWriteVisit])).toEqual([["가은", false], ["나은", false]]);
    expect((await homeData(s.staff.admin, { today: TODAY })).absent.every((k) => k.canWriteVisit)).toBe(true);
    // Children with no mark for the most recent Sunday, within the classes the teacher takes attendance for.
    expect((await homeData(s.staff.homeroom, { today: TODAY })).unchecked).toBe(2);
    expect((await homeData(s.staff.head, { today: TODAY })).unchecked).toBe(3);
  });

  it("the comparison with the Sunday before needs a record from that Sunday", async () => {
    await att(s.kidA, WS, "present");
    expect((await homeData(s.staff.homeroom, { today: TODAY })).lastWeekPresent).toBeNull();
    await att(s.kidA, addDays(WS, -7), "present");
    await att(s.kidA2, addDays(WS, -7), "late");
    expect((await homeData(s.staff.homeroom, { today: TODAY })).lastWeekPresent).toBe(2);
  });
});

describe("home: worries", () => {
  it("a worry the teacher may not read is never counted", async () => {
    const rows = await db.query<{ id: number }>(
      `insert into worries (child_id, content, audience, class_id_at_write) values
        ($1,'선생님만','teacher',$2), ($1,'전도사님만','pastor',$2), ($3,'옆반 고민','teacher',$4)
       returning id`,
      [s.kidA, s.A, s.kidB, s.B],
    );
    await db.query("insert into worries (child_id, content, audience, class_id_at_write, deleted_at) values ($1,'지운 글','both',$2, now())", [s.kidA, s.A]);
    const [teacher, pastor, otherClass] = rows.map((r) => r.id);
    const ids = async (st: Staff) => (await homeData(st, { today: TODAY })).worries.map((w) => w.id);

    expect(await ids(s.staff.homeroom)).toEqual([teacher]);
    expect(await ids(s.staff.other)).toEqual([otherClass]);
    expect(await ids(s.staff.admin)).toEqual([pastor]);
    expect(await ids(s.staff.head)).toEqual([]);
    expect(await ids(s.staff.basic)).toEqual([]);
    // Only who wrote and to whom, never the text.
    const json = JSON.stringify(await unreadWorries(s.staff.homeroom));
    expect(json).toContain("가은");
    expect(json).not.toContain("선생님만");

    // The dot on the class list follows the same rule.
    expect((await childStats(s.staff.homeroom, [s.kidA, s.kidA2, s.kidB])).get(s.kidA)?.worries).toBe(1);
    expect((await childStats(s.staff.admin, [s.kidA, s.kidB])).get(s.kidA)?.worries).toBe(1);
    expect((await childStats(s.staff.admin, [s.kidA, s.kidB])).get(s.kidB)?.worries).toBe(0);
    expect((await childStats(s.staff.head, [s.kidA, s.kidB])).get(s.kidA)?.worries).toBe(0);
    expect((await childStats(s.staff.head, [s.kidA, s.kidB])).get(s.kidB)?.worries).toBe(0);

    // Once read, it is no longer waiting, for that teacher only.
    await db.query("insert into worry_reads (worry_id, staff_id) values ($1,$2)", [teacher, s.ids.homeroom]);
    expect(await ids(s.staff.homeroom)).toEqual([]);
    expect((await childStats(s.staff.homeroom, [s.kidA])).get(s.kidA)?.worries).toBe(0);
    expect(await ids(s.staff.admin)).toEqual([pastor]);
  });
});

describe("home: a past week", () => {
  it("shows that week's summary and leaves this week's numbers alone", async () => {
    const last = addDays(WS, -7);
    await att(s.kidA, last, "present");
    await att(s.kidA2, last, "absent");
    await att(s.kidB, last, "present");
    await drops(s.kidA, last, 6);
    await drops(s.kidA2, last, 2);
    await drops(s.kidB, last, 9);
    await drops(s.kidA, WS, 1);
    const m = (await db.query<{ id: number }>("insert into missions (title, kind, starts_on, ends_on) values ('말씀','self',$1,$2) returning id", [last, addDays(WS, 6)]))[0].id;
    await db.query("insert into mission_completions (mission_id, child_id, status, done_on, week_start) values ($1,$2,'approved',$3,$3), ($1,$4,'rejected',$3,$3)", [m, s.kidA, last, s.kidA2]);

    // Any day of last week works as ?w=.
    const d = await homeData(s.staff.homeroom, { today: TODAY, week: addDays(last, 3) });
    expect(d.week).toMatchObject({ start: last, current: false, next: WS, label: weekLabel(last) });
    expect(d.past).toEqual({ kids: 2, recorded: 2, present: 1, drops: 8, approved: 1 });
    expect(d.totals).toEqual({ kids: 2, recorded: 0, present: 0, drops: 1, approved: 0 });
    expect((await homeData(s.staff.head, { today: TODAY, week: last })).past).toEqual({ kids: 3, recorded: 3, present: 2, drops: 17, approved: 1 });
    expect((await homeData(s.staff.basic, { today: TODAY, week: last })).past).toEqual({ kids: 0, recorded: 0, present: 0, drops: 0, approved: 0 });

    // This week, and anything later, is the current week: no summary.
    for (const w of [undefined, WS, addDays(WS, 7), "nonsense"]) {
      const cur = await homeData(s.staff.homeroom, { today: TODAY, week: w });
      expect(cur.week).toMatchObject({ start: WS, current: true, next: null });
      expect(cur.past).toBeNull();
    }
  });
});

describe("class list numbers", () => {
  it("only children the teacher may see in detail get numbers", async () => {
    const all = [s.kidA, s.kidA2, s.kidB];
    expect([...(await childStats(s.staff.homeroom, all)).keys()].sort()).toEqual([s.kidA, s.kidA2].sort());
    expect([...(await childStats(s.staff.other, all)).keys()]).toEqual([s.kidB]);
    expect((await childStats(s.staff.head, all)).size).toBe(3);
    expect((await childStats(s.staff.basic, all)).size).toBe(0);
    expect((await childStats({ ...s.staff.basic, can_view_all: true }, all)).size).toBe(0);
    expect((await childStats(s.staff.admin, [])).size).toBe(0);
    // A child taken off the list is for admins only.
    await db.query("update children set active = false where id = $1", [s.kidA2]);
    expect((await childStats(s.staff.homeroom, all)).has(s.kidA2)).toBe(false);
    expect((await childStats(s.staff.admin, all)).has(s.kidA2)).toBe(true);
  });

  it("counts the last four Sundays the class had attendance taken, this week's drops, and the tree", async () => {
    // Class A took attendance on five Sundays; a mark on a weekday is not a Sunday and is left out.
    const marks: [number, string][] = [[0, "present"], [-7, "present"], [-14, "absent"], [-21, "late"], [-28, "present"]];
    for (const [d, st] of marks) await att(s.kidA, addDays(WS, d), st);
    await att(s.kidA, addDays(WS, -4), "absent");
    await att(s.kidA2, WS, "absent");
    await att(s.kidA2, addDays(WS, -7), "absent");
    await drops(s.kidA, WS, 5);
    await drops(s.kidA, addDays(WS, -7), 7);
    await drops(s.kidA, WS, 9, "seed");
    await db.query("insert into point_ledger (child_id, delta, reason) values ($1, 40, '테스트'), ($1, -10, '정정')", [s.kidA]);

    const st = await childStats(s.staff.homeroom, [s.kidA, s.kidA2], TODAY);
    const a = st.get(s.kidA)!;
    expect(a.weeks).toEqual([
      { date: addDays(WS, -21), status: "late" },
      { date: addDays(WS, -14), status: "absent" },
      { date: addDays(WS, -7), status: "present" },
      { date: WS, status: "present" },
    ]);
    expect(a).toMatchObject({ level: 4, attended: 3, absentWeeks: 0, drops: 5, points: 30, worries: 0, school: "숲초" });
    // 다은 joined the list of marks only two weeks ago: the two older Sundays show as "no mark", not as attended.
    const b = st.get(s.kidA2)!;
    expect(b.weeks.map((w) => w.status)).toEqual([null, null, "absent", "absent"]);
    expect(b).toMatchObject({ level: 1, attended: 0, absentWeeks: 2, drops: 0, points: 0 });
    // Class B never took attendance: nothing to count.
    expect((await childStats(s.staff.head, [s.kidB], TODAY)).get(s.kidB)).toMatchObject({ weeks: [], attended: 0, absentWeeks: 0, level: 6 });
  });
});

describe("forest picture", () => {
  it("a class tree grows with the share of the weekly goal", () => {
    expect([0, 1, 9, 10, 17, 18, 25, 26, 29, 30, 45].map((n) => forestLevel(n, 30))).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(forestLevel(5, 0)).toBe(1);
  });

  it("draws at most eight trees and keeps the widest range of sizes", () => {
    const few = [3, 1, 2].map((level) => ({ level }));
    expect(pickTrees(few).map((t) => t.level)).toEqual([1, 2, 3]);
    const many = Array.from({ length: 20 }, (_, i) => ({ level: i < 15 ? 2 : i < 19 ? 4 : 6 })).reverse();
    const picked = pickTrees(many);
    expect(picked.length).toBe(8);
    expect(picked[0].level).toBe(2);
    expect(picked[7].level).toBe(6);
    expect(picked.map((t) => t.level)).toEqual([...picked.map((t) => t.level)].sort());
  });

  it("shortens the usual class names for labels", () => {
    expect(shortClassName("5학년 2반")).toBe("5-2");
    expect(shortClassName("4학년1반")).toBe("4-1");
    expect(shortClassName("새가족반")).toBe("새가족반");
  });
});
