import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { ROLE_PRESETS } from "@/lib/authz";
import { db, resetDbForTests } from "@/lib/db";
import { completeMission } from "@/lib/game";
import { copyWeek, defaultMissionInput, missionStats, missionWeeksFrom, saveMission, setMissionActive, setMissionChallenge, weekCopyPlan, weekMissions } from "@/lib/staff/admin-missions";
import { listStaff, setStaffSwitch, SWITCH_KEYS } from "@/lib/staff/admin-staff";
import { festivalLevels } from "@/lib/staff/festival";
import { reviewSubmission } from "@/lib/staff/review";
import { createDraft, startEvent } from "@/lib/talents";
import { addDays, weekStart } from "@/lib/time";
import type { Role, Staff } from "@/lib/types";

/**
 * The server functions added with the redesigned "운영" screens: the mission list by week
 * (numbers, the challenge switch, copying a week), one switch of a teacher from the table,
 * and the tree pictures on the festival payment screen.
 * The dates are fixed: Sunday 2026-11-15 is "this week", so the tests do not depend on the calendar.
 */
const THIS = "2026-11-15";
const TODAY = "2026-11-18";
const LAST = addDays(THIS, -7);
const NEXT = addDays(THIS, 7);

async function load(id: number): Promise<Staff> {
  const rows = await db.query<Omit<Staff, "class_ids">>("select id, name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries, active from staff where id = $1", [id]);
  const cls = await db.query<{ class_id: number }>("select class_id from staff_classes where staff_id = $1 order by class_id", [id]);
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
    return load(r[0].id);
  };
  const kid = async (name: string, classId: number | null, token: string, level: number) => {
    const r = await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ($1,$2,$3) returning id", [name, classId, token]);
    await db.query("insert into trees (child_id, seq, level, given) values ($1, 1, $2, 0)", [r[0].id, level]);
    return r[0].id;
  };
  return {
    A,
    B,
    admin: await mk("관리자", "admin"),
    homeroom: await mk("담임", "homeroom", A),
    head: await mk("부장", "head"),
    basic: await mk("기본", "basic"),
    kidA: await kid("가은", A, "ta", 3),
    kidA2: await kid("다은", A, "tc", 5),
    kidB: await kid("나은", B, "tb", 2),
    loose: await kid("라은", null, "td", 4),
  };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

/** A mission that runs the whole week starting on `week`. */
async function mission(title: string, week: string, more: Partial<ReturnType<typeof defaultMissionInput>> = {}): Promise<number> {
  const r = await saveMission(s.admin, null, { ...defaultMissionInput(week), title, ...more });
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe("mission list by week", () => {
  it("a new mission starts on the week the list was showing", () => {
    expect(defaultMissionInput(NEXT)).toMatchObject({ starts_on: NEXT, ends_on: addDays(NEXT, 6) });
    // any day of a week gives that week; nonsense falls back to the current week
    expect(defaultMissionInput(addDays(NEXT, 3))).toMatchObject({ starts_on: NEXT, ends_on: addDays(NEXT, 6) });
    expect(defaultMissionInput("not-a-date").starts_on).toBe(weekStart());
  });

  it("shows every mission that touches the week, taken-down ones too, to admins only", async () => {
    const a = await mission("이번 주", THIS);
    const down = await mission("내린 미션", THIS);
    await setMissionActive(s.admin, down, false);
    const long = await mission("긴 미션", LAST, { ends_on: addDays(NEXT, 6), repeat: "once" });
    await mission("다음 주", NEXT);
    const challenge = await mission("도전", THIS, { is_challenge: true });

    expect(await weekMissions(s.head, THIS)).toBeNull();
    expect(await weekMissions(s.homeroom, THIS)).toBeNull();
    const list = await weekMissions(s.admin, THIS);
    // challenge first, then the ones that are up, the taken-down one last
    expect(list?.map((m) => m.id)).toEqual([challenge, long, a, down]);
    expect((await weekMissions(s.admin, NEXT))?.map((m) => m.title).sort()).toEqual(["긴 미션", "다음 주"]);
    expect(await weekMissions(s.admin, "2026-13-40")).toEqual([]);

    expect(await missionWeeksFrom(s.basic, LAST)).toBeNull();
    expect(await missionWeeksFrom(s.admin, LAST)).toEqual([LAST, THIS, NEXT]);
    // a week further on appears as soon as a mission is planned for it; older weeks are not listed
    await mission("먼 미래", addDays(THIS, 28));
    expect(await missionWeeksFrom(s.admin, THIS)).toEqual([THIS, NEXT, addDays(THIS, 28)]);
  });

  it("counts finished children per week and waiting submissions, for admins only", async () => {
    const self = await mission("기도", THIS, { kind: "self", repeat: "daily" });
    const photo = await mission("가정예배", THIS, { kind: "photo" });
    // one child does the daily mission twice in the week: still one child
    expect(await completeMission(s.kidA, self, { date: THIS })).toMatchObject({ ok: true });
    expect(await completeMission(s.kidA, self, { date: addDays(THIS, 1) })).toMatchObject({ ok: true });
    expect(await completeMission(s.kidB, self, { date: addDays(THIS, 2) })).toMatchObject({ ok: true });
    const p1 = await completeMission(s.kidA, photo, { photoUrl: "/api/photo/1", date: THIS });
    const p2 = await completeMission(s.kidB, photo, { photoUrl: "/api/photo/2", date: THIS });
    if (!p1.ok || !p2.ok) throw new Error();

    expect(await missionStats(s.head, [self, photo], THIS)).toBeNull();
    let st = await missionStats(s.admin, [self, photo], THIS);
    expect(st?.get(self)).toEqual({ done: 2, pending: 0 });
    expect(st?.get(photo)).toEqual({ done: 0, pending: 2 });
    // approving moves one from waiting to done; a rejected one counts for neither
    expect(await reviewSubmission(s.admin, p1.completionId, true)).toMatchObject({ ok: true });
    expect(await reviewSubmission(s.admin, p2.completionId, false)).toMatchObject({ ok: true });
    st = await missionStats(s.admin, [self, photo], THIS);
    expect(st?.get(photo)).toEqual({ done: 1, pending: 0 });
    // another week has its own count; without a week everything counts
    expect((await missionStats(s.admin, [self], NEXT))?.get(self)).toEqual({ done: 0, pending: 0 });
    expect((await missionStats(s.admin, [self], null))?.get(self)).toEqual({ done: 2, pending: 0 });
    expect((await missionStats(s.admin, [], THIS))?.size).toBe(0);
    // nothing but numbers comes back
    expect(JSON.stringify([...(st ?? [])])).not.toContain("가은");
  });

  it("only admins flip the challenge switch", async () => {
    const m = await mission("가정예배", THIS);
    const flag = async () => (await db.query<{ is_challenge: boolean }>("select is_challenge from missions where id = $1", [m]))[0].is_challenge;
    expect(await setMissionChallenge(s.head, m, true)).toMatchObject({ ok: false });
    expect(await setMissionChallenge(s.homeroom, m, true)).toMatchObject({ ok: false });
    expect(await flag()).toBe(false);
    expect(await setMissionChallenge(s.admin, m, true)).toMatchObject({ ok: true });
    expect(await flag()).toBe(true);
    expect(await setMissionChallenge(s.admin, m, false)).toMatchObject({ ok: true });
    expect(await flag()).toBe(false);
    expect(await setMissionChallenge(s.admin, 9999, true)).toMatchObject({ ok: false });
  });
});

describe("copying a week of missions", () => {
  it("copies the missions of the week before, once, and leaves the rest alone", async () => {
    const a = await mission("출석", LAST, { kind: "attendance", qr_self: true, drops: 2, points: 20 });
    await mission("말씀", LAST, { kind: "verse", verse_text: "여호와는 나의 목자시니", verse_ref: "시편 23편 1절", target_grade: 5 });
    await mission("도전", LAST, { kind: "photo", is_challenge: true, target_class_id: s.B });
    // not copied: taken down, still running into this week, and one from two weeks ago
    const down = await mission("내린 미션", LAST);
    await setMissionActive(s.admin, down, false);
    await mission("긴 미션", LAST, { ends_on: addDays(THIS, 6) });
    await mission("옛 미션", addDays(LAST, -7));

    expect(await weekCopyPlan(s.head, THIS)).toBeNull();
    expect(await copyWeek(s.head, THIS, TODAY)).toMatchObject({ ok: false });
    expect(await copyWeek(s.basic, THIS, TODAY)).toMatchObject({ ok: false });
    expect((await db.query("select 1 from missions where starts_on = $1", [THIS])).length).toBe(0);

    const plan = await weekCopyPlan(s.admin, THIS);
    expect(plan?.from).toBe(LAST);
    expect(plan?.copy.map((m) => m.title)).toEqual(["도전", "출석", "말씀"]);
    expect(plan?.already).toEqual([]);

    expect(await copyWeek(s.admin, THIS, TODAY)).toEqual({ ok: true, copied: 3, skipped: 0 });
    const copies = await db.query<{ title: string; kind: string; starts_on: string; ends_on: string; is_challenge: boolean; target_grade: number | null; target_class_id: number | null; verse_text: string | null; qr_code: string | null; active: boolean; drops: number; points: number }>(
      "select title, kind, starts_on, ends_on, is_challenge, target_grade, target_class_id, verse_text, qr_code, active, drops, points from missions where starts_on = $1 order by title",
      [THIS],
    );
    expect(copies.map((c) => c.title)).toEqual(["도전", "말씀", "출석"]);
    expect(copies.every((c) => c.ends_on === addDays(THIS, 6) && c.active)).toBe(true);
    expect(copies[0]).toMatchObject({ kind: "photo", is_challenge: true, target_class_id: s.B });
    expect(copies[1]).toMatchObject({ kind: "verse", verse_text: "여호와는 나의 목자시니", target_grade: 5 });
    expect(copies[2]).toMatchObject({ kind: "attendance", drops: 2, points: 20 });
    // the copy of a QR mission gets a code of its own, so last week's poster stops with last week's mission
    const oldCode = (await db.query<{ qr_code: string }>("select qr_code from missions where id = $1", [a]))[0].qr_code;
    expect(copies[2].qr_code).toBeTruthy();
    expect(copies[2].qr_code).not.toBe(oldCode);

    // a second press makes nothing new and says so
    expect(await copyWeek(s.admin, THIS, TODAY)).toEqual({ ok: false, error: "이미 모두 복사되어 있어요" });
    expect((await db.query("select 1 from missions where starts_on = $1", [THIS])).length).toBe(3);
    // a mission added to last week afterwards is the only one copied next time
    await mission("새 미션", LAST);
    expect((await weekCopyPlan(s.admin, THIS))?.already.length).toBe(3);
    expect(await copyWeek(s.admin, THIS, TODAY)).toEqual({ ok: true, copied: 1, skipped: 3 });
    // a copy that was taken down is not made again
    await db.query("update missions set active = false where starts_on = $1 and title = '새 미션'", [THIS]);
    expect(await copyWeek(s.admin, THIS, TODAY)).toMatchObject({ ok: false });
    expect((await db.query("select 1 from missions where starts_on = $1", [THIS])).length).toBe(4);
  });

  it("fills this week and later weeks only, and needs a Sunday", async () => {
    await mission("출석", addDays(LAST, -7));
    await mission("출석", THIS);
    // into last week: that is history now
    expect(await copyWeek(s.admin, LAST, TODAY)).toEqual({ ok: false, error: "지난 주에는 복사할 수 없어요" });
    expect((await db.query("select 1 from missions where starts_on = $1", [LAST])).length).toBe(0);
    // next week is prepared from this week
    expect(await copyWeek(s.admin, NEXT, TODAY)).toEqual({ ok: true, copied: 1, skipped: 0 });
    // not a Sunday, not a date, nothing to copy
    expect(await copyWeek(s.admin, addDays(NEXT, 1), TODAY)).toMatchObject({ ok: false });
    expect(await copyWeek(s.admin, "next", TODAY)).toMatchObject({ ok: false });
    expect(await weekCopyPlan(s.admin, addDays(NEXT, 1))).toBeNull();
    expect(await copyWeek(s.admin, addDays(NEXT, 14), TODAY)).toEqual({ ok: false, error: "복사할 미션이 없어요" });
  });
});

describe("one switch of a teacher", () => {
  it("changes that switch and nothing else, through the same rules as the full form", async () => {
    const before = await load(s.homeroom.id);
    expect(before).toMatchObject({ role: "homeroom", can_visits: true, can_view_all: false, class_ids: [s.A] });
    expect(await setStaffSwitch(s.admin, s.homeroom.id, "can_visits", false)).toMatchObject({ ok: true });
    expect(await setStaffSwitch(s.admin, s.homeroom.id, "can_view_all", true)).toMatchObject({ ok: true });
    const after = await load(s.homeroom.id);
    expect(after).toEqual({ ...before, can_visits: false, can_view_all: true });
    // turning one back on leaves the other as it is
    expect(await setStaffSwitch(s.admin, s.homeroom.id, "can_visits", true)).toMatchObject({ ok: true });
    expect(await load(s.homeroom.id)).toEqual({ ...before, can_view_all: true });
    // every change is in the audit log, as with the full form
    const log = await db.query<{ action: string; staff_id: number; target_id: number }>("select action, staff_id, target_id from audit_log where action = 'staff_update' order by id");
    expect(log.length).toBe(3);
    expect(log[0]).toEqual({ action: "staff_update", staff_id: s.admin.id, target_id: s.homeroom.id });
    // the list the table is drawn from shows it
    expect((await listStaff(s.admin))?.find((t) => t.id === s.homeroom.id)).toMatchObject({ can_visits: true, can_view_all: true, class_names: ["5학년 2반"] });
  });

  it("is for admins only and only for the five switches", async () => {
    for (const st of [s.head, s.homeroom, s.basic]) expect(await setStaffSwitch(st, s.basic.id, "can_attendance", true)).toMatchObject({ ok: false });
    expect((await load(s.basic.id)).can_attendance).toBe(false);
    // not a way to change the role, the sign-in state or anything else
    for (const key of ["role", "active", "name", "kakao_id", "can_everything", ""]) expect(await setStaffSwitch(s.admin, s.basic.id, key, true)).toMatchObject({ ok: false });
    expect(await load(s.basic.id)).toMatchObject({ role: "basic", active: true, ...ROLE_PRESETS.basic });
    expect(await setStaffSwitch(s.admin, 9999, "can_attendance", true)).toMatchObject({ ok: false });
    expect([...SWITCH_KEYS].sort()).toEqual(Object.keys(ROLE_PRESETS.admin).sort());
  });

  it("an admin may flip their own switches without losing the admin role", async () => {
    expect(await setStaffSwitch(s.admin, s.admin.id, "can_read_pastor_worries", false)).toMatchObject({ ok: true });
    expect(await load(s.admin.id)).toMatchObject({ role: "admin", active: true, can_read_pastor_worries: false, can_attendance: true });
  });
});

describe("tree pictures on the festival payment screen", () => {
  async function open() {
    const d = await createDraft(s.admin, "달란트 잔치", 10);
    if (!d.ok) throw new Error(d.error);
    const r = await startEvent(s.admin, d.id);
    if (!r.ok) throw new Error(r.error);
  }

  it("gives nothing while no festival is open", async () => {
    expect(await festivalLevels(s.admin)).toEqual({});
  });

  it("gives a teacher the trees of the children they may open, and nobody else's", async () => {
    await open();
    expect(await festivalLevels(s.admin)).toEqual({ [s.kidA]: 3, [s.kidA2]: 5, [s.kidB]: 2, [s.loose]: 4 });
    expect(await festivalLevels(s.head)).toEqual({ [s.kidA]: 3, [s.kidA2]: 5, [s.kidB]: 2, [s.loose]: 4 });
    // a homeroom teacher: their own class only (not the other class, not a child without a class)
    expect(await festivalLevels(s.homeroom)).toEqual({ [s.kidA]: 3, [s.kidA2]: 5 });
    expect(await festivalLevels(s.basic)).toEqual({});
    expect(await festivalLevels({ ...s.homeroom, active: false })).toEqual({});
    // children taken off the list have no picture; a harvested tree is not the current one
    await db.query("update children set active = false where id = $1", [s.kidA2]);
    await db.query("update trees set harvested_at = now() where child_id = $1", [s.kidA]);
    await db.query("insert into trees (child_id, seq, level, given) values ($1, 2, 1, 0)", [s.kidA]);
    expect(await festivalLevels(s.homeroom)).toEqual({ [s.kidA]: 1 });
  });
});
