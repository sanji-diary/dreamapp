import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { ROLE_PRESETS } from "@/lib/authz";
import { db, resetDbForTests } from "@/lib/db";
import { completeMission, dropBalance } from "@/lib/game";
import { saveAttendance } from "@/lib/staff/attendance";
import { attendanceCounts, attendanceMonth, monthColumns, monthLabel, monthSteps, sundaysOfMonth } from "@/lib/staff/attendance-month";
import { approveMany, pendingCompletions, reportedComments, todoCounts } from "@/lib/staff/review";
import { agoText, approvalFilter, approvalsHref } from "@/lib/staff/todo";
import { addDays, weekStart } from "@/lib/time";
import type { Role, Staff } from "@/lib/types";

/** Loads a teacher the way getStaff() does. */
async function load(id: number): Promise<Staff> {
  const rows = await db.query<Omit<Staff, "class_ids">>("select id, name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries, active from staff where id = $1", [id]);
  const cls = await db.query<{ class_id: number }>("select class_id from staff_classes where staff_id = $1", [id]);
  return { ...rows[0], class_ids: cls.map((c) => c.class_id) };
}

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
  const ids = { admin: await mk("관리자", "admin"), homeroom: await mk("담임", "homeroom", A), head: await mk("부장", "head"), basic: await mk("기본", "basic") };
  const kid = async (name: string, classId: number, token: string) => (await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ($1,$2,$3) returning id", [name, classId, token]))[0].id;
  const kidA = await kid("가은", A, "ta");
  const kidA2 = await kid("다은", A, "ta2");
  const kidB = await kid("나은", B, "tb");
  const staff = { admin: await load(ids.admin), homeroom: await load(ids.homeroom), head: await load(ids.head), basic: await load(ids.basic) };
  return { A, B, kidA, kidA2, kidB, ids, staff };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

// Wednesday, November 18, 2026: the week began on Sunday the 15th ('11월 3주차').
const TODAY = "2026-11-18";
const SUNDAY = "2026-11-15";

describe("할 일: missions", () => {
  async function photoMission(title = "가정예배") {
    const ws = weekStart();
    const r = await db.query<{ id: number }>("insert into missions (title, kind, drops, points, repeat, starts_on, ends_on) values ($1,'photo',3,30,'weekly',$2,$3) returning id", [title, ws, addDays(ws, 6)]);
    return r[0].id;
  }
  async function submit(childId: number, missionId: number) {
    const r = await completeMission(childId, missionId, { photoUrl: `/api/photo/${childId}` });
    if (!r.ok) throw new Error("submit failed");
    return r.completionId;
  }

  it("a selection that mixes classes approves only what the teacher may approve and reports the rest", async () => {
    const m = await photoMission();
    const mine = await submit(s.kidA, m);
    const mine2 = await submit(s.kidA2, m);
    const other = await submit(s.kidB, m);

    // The homeroom teacher of class A ticks both classes (a stale or tampered form), one of them twice, and an id that does not exist.
    const r = await approveMany(s.staff.homeroom, [mine, other, mine2, mine, 999_999]);
    expect(r.approved).toEqual([mine, mine2]);
    expect(r.refused.map((x) => x.id)).toEqual([other, 999_999]);
    expect(r.refused.every((x) => x.error === "권한이 없어요")).toBe(true);
    expect(await dropBalance(db, s.kidA)).toBe(3);
    expect(await dropBalance(db, s.kidA2)).toBe(3);
    expect(await dropBalance(db, s.kidB)).toBe(0);
    const status = await db.query<{ id: number; status: string; reviewed_by: number | null }>("select id, status, reviewed_by from mission_completions order by id");
    expect(status).toEqual([
      { id: mine, status: "approved", reviewed_by: s.ids.homeroom },
      { id: mine2, status: "approved", reviewed_by: s.ids.homeroom },
      { id: other, status: "pending", reviewed_by: null },
    ]);

    // Approving again gives nothing twice, and says so.
    const again = await approveMany(s.staff.homeroom, [mine, mine2]);
    expect(again.approved).toEqual([]);
    expect(again.refused.map((x) => x.error)).toEqual(["이미 처리된 제출이에요", "이미 처리된 제출이에요"]);
    expect(await dropBalance(db, s.kidA)).toBe(3);

    // A teacher without the permission approves nothing; a teacher who sees every class approves the one that was left.
    expect((await approveMany(s.staff.basic, [other])).approved).toEqual([]);
    expect((await approveMany({ ...s.staff.homeroom, can_approve: false }, [other])).approved).toEqual([]);
    expect(await approveMany(s.staff.head, [other])).toEqual({ approved: [other], refused: [] });
    expect(await dropBalance(db, s.kidB)).toBe(3);
  });

  it("a waiting submission carries what the tile shows", async () => {
    const m = await photoMission("가정예배 드리기");
    await db.query("insert into trees (child_id, seq, level, given) values ($1, 1, 4, 0)", [s.kidA]);
    const id = await submit(s.kidA, m);
    await submit(s.kidB, m);
    const mine = await pendingCompletions(s.staff.homeroom);
    expect(mine.map((p) => p.id)).toEqual([id]);
    expect(mine[0]).toMatchObject({ child_name: "가은", class_id: s.A, class_name: "5학년 2반", title: "가정예배 드리기", drops: 3, level: 4, photo_url: `/api/photo/${s.kidA}`, text_content: null });
    expect(mine[0].created_at).toBeInstanceOf(Date);
    // A child with no tree row yet stands as a seed.
    expect((await pendingCompletions(s.staff.head)).find((p) => p.child_name === "나은")?.level).toBe(1);
  });

  it("the switch counts what the menu badges count, and hides what a teacher may not use", async () => {
    const m = await photoMission();
    await submit(s.kidA, m);
    await submit(s.kidB, m);
    await db.query("insert into worries (child_id, content, audience, class_id_at_write) values ($1,'선생님만','teacher',$2), ($1,'둘 다','both',$2), ($3,'옆 반','teacher',$4)", [s.kidA, s.A, s.kidB, s.B]);
    const post = (await db.query<{ id: number }>("insert into posts (body) values ('소식') returning id"))[0].id;
    const cm = (await db.query<{ id: number }>("insert into comments (post_id, child_id, body) values ($1,$2,'나쁜 말') returning id", [post, s.kidA]))[0].id;
    await db.query("insert into comment_reports (comment_id, child_id) values ($1,$2)", [cm, s.kidB]);

    expect(await todoCounts(s.staff.homeroom)).toEqual({ missions: 1, worries: 2, comments: 1 });
    expect(await todoCounts(s.staff.admin)).toEqual({ missions: 2, worries: 1, comments: 1 });
    expect(await todoCounts(s.staff.head)).toEqual({ missions: 2, worries: null, comments: 1 });
    expect(await todoCounts(s.staff.basic)).toEqual({ missions: null, worries: null, comments: 1 });
  });

  it("a reported comment shows the writer's tree only to teachers who may see that child", async () => {
    await db.query("insert into trees (child_id, seq, level, given) values ($1, 1, 5, 0)", [s.kidA]);
    const post = (await db.query<{ id: number }>("insert into posts (body) values ('소식') returning id"))[0].id;
    const cm = await db.query<{ id: number }>("insert into comments (post_id, child_id, staff_id, body) values ($1,$2,null,'아이 댓글'),($1,null,$3,'교사 댓글') returning id", [post, s.kidA, s.ids.head]);
    await db.query("insert into comment_reports (comment_id, child_id) values ($1,$3),($2,$3)", [cm[0].id, cm[1].id, s.kidB]);
    const level = async (st: Staff) => (await reportedComments(st)).find((r) => r.body === "아이 댓글")?.author_level;
    expect(await level(s.staff.homeroom)).toBe(5);
    expect(await level(s.staff.admin)).toBe(5);
    expect(await level(s.staff.basic)).toBeNull();
    const byTeacher = (await reportedComments(s.staff.admin)).find((r) => r.body === "교사 댓글");
    expect(byTeacher).toMatchObject({ author: "부장", author_id: null, author_level: null });
  });

  it("names how long ago something was sent in, in Korea time", () => {
    const now = new Date("2026-11-18T05:00:00Z"); // 14:00 in Korea
    expect(agoText(new Date("2026-11-18T04:59:40Z"), now)).toBe("방금");
    expect(agoText(new Date("2026-11-18T04:48:00Z"), now)).toBe("12분 전");
    expect(agoText(new Date("2026-11-18T03:00:00Z"), now)).toBe("2시간 전");
    // 00:30 in Korea is still the same day there, though it is the day before in UTC.
    expect(agoText(new Date("2026-11-17T15:30:00Z"), now)).toBe("13시간 전");
    expect(agoText(new Date("2026-11-17T14:30:00Z"), now)).toBe("어제");
    expect(agoText(new Date("2026-11-12T03:00:00Z"), now)).toBe("11월 12일");
  });

  it("reads the filter from the address and nothing else", () => {
    expect(approvalFilter("photo")).toBe("photo");
    expect(approvalFilter("mine")).toBe("mine");
    expect(approvalFilter("drop table")).toBe("all");
    expect(approvalFilter(["photo"])).toBe("all");
    expect(approvalsHref()).toBe("/staff/approvals");
    expect(approvalsHref("text")).toBe("/staff/approvals?f=text");
  });
});

describe("출석: the month", () => {
  it("lists the Sundays of a month, named by week", () => {
    expect(sundaysOfMonth("2026-11")).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
    expect(sundaysOfMonth("2026-12")).toEqual(["2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27"]);
    const cols = monthColumns("2026-11", TODAY);
    expect(cols.map((c) => `${c.label} ${c.md}`)).toEqual(["1주차 11/1", "2주차 11/8", "3주차 11/15", "4주차 11/22", "5주차 11/29"]);
    expect(cols.map((c) => c.future)).toEqual([false, false, false, true, true]);
    expect(cols.every((c) => c.sunday)).toBe(true);
  });

  it("adds a weekday of that month when asked, in date order, and ignores other months", () => {
    const cols = monthColumns("2026-11", TODAY, ["2026-11-18", "2026-11-18", "2026-10-28", "not a date"]);
    expect(cols.map((c) => c.date)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-18", "2026-11-22", "2026-11-29"]);
    expect(cols[3]).toEqual({ date: "2026-11-18", label: "수요일", md: "11/18", sunday: false, future: false });
  });

  it("steps to the month before and after, never into a month without a Sunday yet", () => {
    expect(monthSteps("2026-11", TODAY)).toEqual({ prev: { label: "10월", date: "2026-10-25" }, next: null });
    expect(monthSteps("2026-10", TODAY)).toEqual({ prev: { label: "9월", date: "2026-09-27" }, next: { label: "11월", date: "2026-11-01" } });
    // December 2 is a Wednesday: December has begun, but its first Sunday has not come.
    expect(monthSteps("2026-11", "2026-12-02").next).toBeNull();
    expect(monthSteps("2026-11", "2026-12-06").next).toEqual({ label: "12월", date: "2026-12-06" });
    // Across a year the label carries the year.
    expect(monthSteps("2027-01", "2027-01-20").prev).toEqual({ label: "2026년 12월", date: "2026-12-27" });
    expect(monthLabel("2026-11", TODAY)).toBe("11월");
    expect(monthLabel("2025-11", TODAY)).toBe("2025년 11월");
  });

  it("gives a class's children with every mark of the month, only for classes the teacher takes attendance for", async () => {
    await db.query("insert into trees (child_id, seq, level, given) values ($1, 1, 3, 0)", [s.kidA]);
    await db.query(
      "insert into attendance (child_id, date, status, note) values ($1,'2026-11-01','present',null), ($1,'2026-11-08','absent','감기'), ($1,'2026-11-15','late',null), ($1,'2026-10-25','absent',null), ($2,'2026-11-11','present',null), ($3,'2026-11-15','present',null)",
      [s.kidA, s.kidA2, s.kidB],
    );
    const m = await attendanceMonth(s.staff.homeroom, [s.A], SUNDAY, TODAY);
    expect(m?.kids.map((k) => k.name)).toEqual(["가은", "다은"]);
    expect(m?.kids[0]).toMatchObject({ class_id: s.A, class_name: "5학년 2반", class_short: "5-2", level: 3, status: "late", prior: { kind: "absent", n: 1 }, isNew: false });
    expect(m?.kids[1]).toMatchObject({ level: 1, status: null });
    // October's mark is not part of November; the Wednesday that has a mark becomes a column.
    expect(m?.marks[s.kidA]).toEqual({ "2026-11-01": { status: "present", note: "" }, "2026-11-08": { status: "absent", note: "감기" }, "2026-11-15": { status: "late", note: "" } });
    expect(m?.marks[s.kidA2]).toEqual({ "2026-11-11": { status: "present", note: "" } });
    expect(m?.columns.map((c) => c.date)).toEqual(["2026-11-01", "2026-11-08", "2026-11-11", "2026-11-15", "2026-11-22", "2026-11-29"]);

    // Another class is simply not there for the homeroom teacher, also when asked for together with their own.
    expect((await attendanceMonth(s.staff.homeroom, [s.B], SUNDAY, TODAY))?.kids).toEqual([]);
    const both = await attendanceMonth(s.staff.homeroom, [s.A, s.B], SUNDAY, TODAY);
    expect(both?.kids.map((k) => k.name)).toEqual(["가은", "다은"]);
    expect(both?.marks[s.kidB]).toBeUndefined();
    expect((await attendanceMonth(s.staff.basic, [s.A, s.B], SUNDAY, TODAY))?.kids).toEqual([]);
    expect((await attendanceMonth({ ...s.staff.homeroom, can_attendance: false }, [s.A], SUNDAY, TODAY))?.kids).toEqual([]);
    // 부장 sees both classes, in class order.
    expect((await attendanceMonth(s.staff.head, [s.B, s.A], SUNDAY, TODAY))?.kids.map((k) => k.name)).toEqual(["가은", "다은", "나은"]);
    expect(await attendanceMonth(s.staff.head, [s.A], "2026-11-31", TODAY)).toBeNull();
  });

  it("counts a day class by class within the teacher's attendance scope", async () => {
    const day = weekStart();
    expect(await saveAttendance(s.staff.head, s.kidA, day, "present")).toMatchObject({ ok: true });
    expect(await saveAttendance(s.staff.head, s.kidA2, day, "absent", "여행")).toMatchObject({ ok: true });
    expect(await attendanceCounts(s.staff.head, day)).toEqual([
      { id: s.A, name: "5학년 2반", kids: 2, recorded: 2, present: 1 },
      { id: s.B, name: "6학년 1반", kids: 1, recorded: 0, present: 0 },
    ]);
    expect(await attendanceCounts(s.staff.homeroom, day)).toEqual([{ id: s.A, name: "5학년 2반", kids: 2, recorded: 2, present: 1 }]);
    expect(await attendanceCounts(s.staff.basic, day)).toEqual([]);
    expect(await attendanceCounts(s.staff.head, "nope")).toEqual([]);
  });
});
