import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { ROLE_PRESETS } from "@/lib/authz";
import { db, one, resetDbForTests } from "@/lib/db";
import { completeMission, dropBalance, getSettings, pointBalance } from "@/lib/game";
import { staffTabs } from "@/lib/staff/access";
import { joinCodeOpen } from "@/lib/self-join";
import { adjustPoints, attendanceCsv, balances, moveChildren, pointsCsv, reissueJoinCode, saveSettings, setSelfJoin, sharedJoin } from "@/lib/staff/admin-misc";
import { duplicateToNextWeek, listMissions, saveMission, weeklyDropCheck, defaultMissionInput } from "@/lib/staff/admin-missions";
import { createStaff, listStaff, updateStaff } from "@/lib/staff/admin-staff";
import { attendanceClasses, attendanceRoster, saveAttendance, streakFrom } from "@/lib/staff/attendance";
import { addVisit, createChild, deleteVisit, getChildDetail, listChildren, longAbsent, newJoinerCount, proxyComplete, proxyHarvest, proxyMissions, proxyWater, reissueCard, resetPin, setChildActive, setConsent, updateChild, updateVisit } from "@/lib/staff/children";
import { resolveKakaoStaff } from "@/lib/staff/kakao";
import { homeData } from "@/lib/staff/home";
import { dismissReports, hideComment, listWorries, openWorry, overduePending, pendingCompletions, replyWorry, reportedComments, reviewSubmission, unreadWorryCount } from "@/lib/staff/review";
import { todayKst, weekStart, addDays } from "@/lib/time";
import type { Role, Staff } from "@/lib/types";

const TODAY = todayKst();
const WS = weekStart(TODAY);

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
  const ids = { admin: await mk("관리자", "admin"), homeroom: await mk("담임", "homeroom", A), other: await mk("옆반담임", "homeroom", B), head: await mk("부장", "head"), basic: await mk("기본", "basic") };
  const kid = async (name: string, classId: number, token: string) =>
    (await db.query<{ id: number }>("insert into children (name, class_id, qr_token, phone, guardian_phone, address, memo, pin_hash, pin_fail_count) values ($1,$2,$3,'010-1111-2222','010-3333-4444','비밀 주소','비밀 메모','hash',3) returning id", [name, classId, token]))[0].id;
  const kidA = await kid("가은", A, "ta");
  const kidB = await kid("나은", B, "tb");
  const staff = {
    admin: await load(ids.admin),
    homeroom: await load(ids.homeroom),
    other: await load(ids.other),
    head: await load(ids.head),
    basic: await load(ids.basic),
  };
  return { A, B, kidA, kidB, ids, staff };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

describe("a teacher waters the tree of a child without a phone", () => {
  const give = (childId: number, n: number) => db.query("insert into drop_ledger (child_id, delta, reason, ref_type) values ($1,$2,'시험','manual')", [childId, n]);

  it("uses every drop, one level step at a time, and only for children without a phone", async () => {
    await give(s.kidA, 7);
    // a child with a phone waters alone
    expect(await proxyWater(s.staff.homeroom, s.kidA)).toMatchObject({ ok: false });
    expect(await dropBalance(db, s.kidA)).toBe(7);
    await db.query("update children set has_phone = false where id = $1", [s.kidA]);
    // not this teacher's class, and a teacher who may not confirm missions
    expect(await proxyWater(s.staff.other, s.kidA)).toMatchObject({ ok: false });
    expect(await proxyWater(s.staff.basic, s.kidA)).toMatchObject({ ok: false });
    expect(await dropBalance(db, s.kidA)).toBe(7);
    // 2 drops finish level 1, 4 finish level 2, one is left for level 3
    expect(await proxyWater(s.staff.homeroom, s.kidA)).toEqual({ ok: true, given: 7, level: 3, ripe: false });
    expect(await dropBalance(db, s.kidA)).toBe(0);
    expect(await one(db, "select level, given from trees where child_id = $1 and harvested_at is null", [s.kidA])).toMatchObject({ level: 3, given: 1 });
    // nothing left to give
    expect(await proxyWater(s.staff.homeroom, s.kidA)).toMatchObject({ ok: false });
    expect(await one(db, "select count(*)::int as n from audit_log where action = 'child_water_proxy'")).toMatchObject({ n: 1 });
  });

  it("stops at the ripe fruit, and the harvest is a separate step", async () => {
    await db.query("update children set has_phone = false where id = $1", [s.kidA]);
    await give(s.kidA, 45);
    expect(await proxyHarvest(s.staff.homeroom, s.kidA)).toMatchObject({ ok: false });
    // a tree takes 40 drops; the other 5 stay with the child
    expect(await proxyWater(s.staff.homeroom, s.kidA)).toEqual({ ok: true, given: 40, level: 6, ripe: true });
    expect(await dropBalance(db, s.kidA)).toBe(5);
    expect(await proxyWater(s.staff.homeroom, s.kidA)).toMatchObject({ ok: false });
    expect(await proxyHarvest(s.staff.other, s.kidA)).toMatchObject({ ok: false });
    expect(await proxyHarvest(s.staff.homeroom, s.kidA)).toEqual({ ok: true, bonus: 50 });
    expect(await pointBalance(db, s.kidA)).toBe(50);
    // the new tree takes the drops that were left
    expect(await proxyWater(s.staff.homeroom, s.kidA)).toEqual({ ok: true, given: 5, level: 2, ripe: false });
  });
});

describe("submissions that wait too long", () => {
  it("counts what has waited three days or more, within what the teacher may confirm", async () => {
    const m = (await db.query<{ id: number }>("insert into missions (title, kind, drops, points, repeat, starts_on, ends_on) values ('사진', 'photo', 1, 5, 'weekly', $1, $2) returning id", [addDays(WS, -7), addDays(WS, 6)]))[0].id;
    const wait = (childId: number, doneOn: string) =>
      db.query("insert into mission_completions (mission_id, child_id, status, done_on, week_start) values ($1,$2,'pending',$3,$4)", [m, childId, doneOn, weekStart(doneOn)]);
    await wait(s.kidA, addDays(TODAY, -2)); // two days: not yet
    expect(await overduePending(s.staff.head, TODAY)).toEqual({ count: 0, oldest: null, classes: [] });
    await wait(s.kidB, addDays(TODAY, -3));
    expect(await overduePending(s.staff.head, TODAY)).toEqual({ count: 1, oldest: addDays(TODAY, -3), classes: ["6학년 1반"] });
    expect(await overduePending(s.staff.admin, TODAY)).toMatchObject({ count: 1 });
    // a homeroom teacher sees only the own class; a basic teacher confirms nothing
    expect(await overduePending(s.staff.homeroom, TODAY)).toMatchObject({ count: 0 });
    expect(await overduePending(s.staff.other, TODAY)).toMatchObject({ count: 1 });
    expect(await overduePending(s.staff.basic, TODAY)).toMatchObject({ count: 0 });
    // the home screen of a teacher who sees every class carries it
    expect((await homeData(s.staff.head, { today: TODAY })).overdue.count).toBe(1);
    expect((await homeData(s.staff.other, { today: TODAY })).overdue.count).toBe(0);
  });
});

describe("children: list and detail", () => {
  it("everyone sees names and classes, only permitted teachers can open details", async () => {
    for (const st of Object.values(s.staff)) expect((await listChildren(st)).map((k) => k.name)).toEqual(["가은", "나은"]);
    const open = async (st: Staff) => (await listChildren(st)).filter((k) => k.canOpen).map((k) => k.name);
    expect(await open(s.staff.admin)).toEqual(["가은", "나은"]);
    expect(await open(s.staff.head)).toEqual(["가은", "나은"]);
    expect(await open(s.staff.homeroom)).toEqual(["가은"]);
    expect(await open(s.staff.basic)).toEqual([]);
  });

  it("the list never carries personal details", async () => {
    await db.query("update children set has_phone = false");
    const json = JSON.stringify(await listChildren(s.staff.basic));
    for (const secret of ["010-1111-2222", "010-3333-4444", "비밀 주소", "비밀 메모", "ta", "tb"]) expect(json).not.toContain(secret);
    // has_phone and onboarding are details too
    expect((await listChildren(s.staff.basic)).every((k) => !k.noPhone && !k.notOnboarded)).toBe(true);
    const mine = await listChildren(s.staff.homeroom);
    expect(mine.find((k) => k.name === "가은")?.noPhone).toBe(true);
    expect(mine.find((k) => k.name === "나은")?.noPhone).toBe(false);
  });

  it("detail follows the role table", async () => {
    expect(await getChildDetail(s.staff.basic, s.kidA)).toBeNull();
    expect(await getChildDetail(s.staff.homeroom, s.kidB)).toBeNull();
    expect((await getChildDetail(s.staff.homeroom, s.kidA))?.phone).toBe("010-1111-2222");
    expect((await getChildDetail(s.staff.head, s.kidB))?.address).toBe("비밀 주소");
    expect((await getChildDetail(s.staff.admin, s.kidB))?.memo).toBe("비밀 메모");
    // a homeroom teacher with the 'view all' switch sees other classes too
    expect(await getChildDetail({ ...s.staff.homeroom, can_view_all: true }, s.kidB)).not.toBeNull();
    // switches never lift a basic teacher above names
    expect(await getChildDetail({ ...s.staff.basic, can_view_all: true, can_visits: true }, s.kidA)).toBeNull();
  });

  it("inactive children are hidden from everyone but admins", async () => {
    expect(await setChildActive(s.staff.homeroom, s.kidA, false)).toMatchObject({ ok: false });
    expect(await setChildActive(s.staff.admin, s.kidA, false)).toMatchObject({ ok: true });
    expect(await getChildDetail(s.staff.homeroom, s.kidA)).toBeNull();
    expect((await listChildren(s.staff.homeroom, { includeInactive: true })).map((k) => k.name)).toEqual(["나은"]);
    expect((await listChildren(s.staff.admin, { includeInactive: true })).length).toBe(2);
    expect((await getChildDetail(s.staff.admin, s.kidA))?.active).toBe(false);
  });

  it("editing is limited to the teacher's scope; only admins change the class", async () => {
    expect(await updateChild(s.staff.basic, s.kidA, { name: "바뀜" })).toMatchObject({ ok: false });
    expect(await updateChild(s.staff.homeroom, s.kidB, { name: "바뀜" })).toMatchObject({ ok: false });
    expect(await updateChild(s.staff.homeroom, s.kidA, { name: "가은", school: "숲초등학교", class_id: s.B })).toMatchObject({ ok: true });
    let row = (await db.query<{ class_id: number; school: string }>("select class_id, school from children where id = $1", [s.kidA]))[0];
    expect(row).toMatchObject({ class_id: s.A, school: "숲초등학교" });
    expect(await updateChild(s.staff.admin, s.kidA, { name: "가은", class_id: s.B })).toMatchObject({ ok: true });
    row = (await db.query<{ class_id: number; school: string }>("select class_id, school from children where id = $1", [s.kidA]))[0];
    expect(row.class_id).toBe(s.B);
  });

  it("only admins create children and reissue cards", async () => {
    for (const st of [s.staff.homeroom, s.staff.head, s.staff.basic]) {
      expect(await createChild(st, { name: "새아이", class_id: s.A })).toMatchObject({ ok: false });
      expect(await reissueCard(st, s.kidA)).toMatchObject({ ok: false });
    }
    const made = await createChild(s.staff.admin, { name: "새아이", class_id: s.A });
    if (!made.ok) throw new Error("create failed");
    const row = (await db.query<{ qr_token: string }>("select qr_token from children where id = $1", [made.id]))[0];
    expect(row.qr_token.length).toBeGreaterThanOrEqual(16);

    await db.query("update children set onboarded_at = now() where id = $1", [s.kidA]);
    expect(await reissueCard(s.staff.admin, s.kidA)).toMatchObject({ ok: true });
    const after = (await db.query<{ qr_token: string; pin_hash: string | null; onboarded_at: Date | null; pin_fail_count: number }>("select qr_token, pin_hash, onboarded_at, pin_fail_count from children where id = $1", [s.kidA]))[0];
    expect(after.qr_token).not.toBe("ta");
    expect(after.pin_hash).toBeNull();
    expect(after.pin_fail_count).toBe(0);
    expect(after.onboarded_at).not.toBeNull();
    expect(await setConsent(s.staff.admin, s.kidA, TODAY, true)).toMatchObject({ ok: true });
    const log = await db.query<{ action: string }>("select action from audit_log where target_type = 'child' and target_id = $1 order by id", [s.kidA]);
    expect(log.map((l) => l.action)).toEqual(["child_card_reissue", "child_consent"]);
  });

  it("teachers who may edit a child record consent; others may not", async () => {
    // Consent no longer gates joining, so the teachers who look after the child track it.
    expect(await setConsent(s.staff.basic, s.kidA, TODAY, true)).toMatchObject({ ok: false });
    expect(await setConsent(s.staff.other, s.kidA, TODAY, true)).toMatchObject({ ok: false }); // another class
    expect(await one(db, "select consent_on from children where id = $1", [s.kidA])).toEqual({ consent_on: null });
    expect(await setConsent(s.staff.homeroom, s.kidA, "2999-01-01", true)).toMatchObject({ ok: false }); // a future date
    expect(await setConsent(s.staff.homeroom, s.kidA, TODAY, true)).toMatchObject({ ok: true });
    expect(await one(db, "select consent_on, photo_consent from children where id = $1", [s.kidA])).toEqual({ consent_on: TODAY, photo_consent: true });
    expect(await setConsent(s.staff.head, s.kidB, TODAY, false)).toMatchObject({ ok: true });
    expect(await setConsent(s.staff.head, s.kidB, null, false)).toMatchObject({ ok: true }); // taken back
    expect(await one(db, "select consent_on from children where id = $1", [s.kidB])).toEqual({ consent_on: null });
    expect((await db.query("select id from audit_log where action = 'child_consent'")).length).toBe(3);
  });

  it("children who registered themselves: tags, the new-joiner list, and who assigns their class", async () => {
    const lone = (await db.query<{ id: number }>("insert into children (name, qr_token, self_joined, onboarded_at, pin_hash) values ('스스로', 'tself', true, now(), 'hash') returning id"))[0].id;
    // Everyone sees the name with "반 미정"; only teachers who see every class can open the profile.
    for (const st of [s.staff.basic, s.staff.homeroom, s.staff.head, s.staff.admin]) {
      const row = (await listChildren(st)).find((k) => k.id === lone)!;
      const all = st.role === "head" || st.role === "admin";
      expect(row).toMatchObject({ classPending: true, canOpen: all, needsConsent: all, selfJoined: all });
      expect((await getChildDetail(st, lone)) !== null).toBe(all);
      expect(await newJoinerCount(st)).toBe(all ? 1 : 0);
      // The filter is ignored for teachers who cannot use it.
      expect((await listChildren(st, { onlyNew: true })).map((k) => k.id)).toEqual(all ? [lone] : (await listChildren(st)).map((k) => k.id));
    }
    // Children a teacher registered are tagged for consent too, but are not "반 미정" and not new joiners.
    expect((await listChildren(s.staff.homeroom)).find((k) => k.id === s.kidA)).toMatchObject({ needsConsent: true, classPending: false, selfJoined: false });

    const detail = await getChildDetail(s.staff.head, lone);
    expect(detail).toMatchObject({ self_joined: true, consent_on: null, class_id: null, can: { edit: true, consent: true, assignClass: true } });
    // A homeroom teacher cannot reach a child without a class at all.
    expect(await updateChild(s.staff.homeroom, lone, { name: "스스로", class_id: s.A })).toMatchObject({ ok: false });
    expect(await setConsent(s.staff.homeroom, lone, TODAY, false)).toMatchObject({ ok: false });
    // The head teacher gives the first class, but cannot move a child who already has one (admins only).
    expect(await updateChild(s.staff.head, lone, { name: "스스로", class_id: 99999 })).toMatchObject({ ok: false });
    expect(await updateChild(s.staff.head, lone, { name: "스스로", class_id: s.A })).toMatchObject({ ok: true });
    expect(await one(db, "select class_id from children where id = $1", [lone])).toEqual({ class_id: s.A });
    expect((await getChildDetail(s.staff.head, lone))!.can.assignClass).toBe(false);
    expect(await updateChild(s.staff.head, lone, { name: "스스로", class_id: s.B })).toMatchObject({ ok: true });
    expect(await one(db, "select class_id from children where id = $1", [lone])).toEqual({ class_id: s.A });
    expect((await db.query("select id from audit_log where action = 'child_class_change' and target_id = $1", [lone])).length).toBe(1);
    // Now the homeroom teacher of that class sees the child and records the consent form.
    expect(await setConsent(s.staff.homeroom, lone, TODAY, false)).toMatchObject({ ok: true });
    expect((await listChildren(s.staff.homeroom)).find((k) => k.id === lone)).toMatchObject({ classPending: false, needsConsent: false, selfJoined: true });
    // With a class and consent, the child leaves the list once two weeks have passed.
    expect(await newJoinerCount(s.staff.admin)).toBe(1);
    await db.query("update children set onboarded_at = now() - interval '15 days' where id = $1", [lone]);
    expect(await newJoinerCount(s.staff.admin)).toBe(0);
  });

  it("only admins see, reissue and switch the shared join QR", async () => {
    for (const st of [s.staff.homeroom, s.staff.head, s.staff.basic]) {
      expect(await sharedJoin(st)).toBeNull();
      expect(await reissueJoinCode(st)).toMatchObject({ ok: false });
      expect(await setSelfJoin(st, false)).toMatchObject({ ok: false });
    }
    const first = await sharedJoin(s.staff.admin);
    expect(first).toMatchObject({ on: true, joined: 0 });
    expect(first!.code.length).toBeGreaterThanOrEqual(12);
    expect((await sharedJoin(s.staff.admin))!.code).toBe(first!.code); // stays the same until reissued
    expect(await joinCodeOpen(first!.code)).toBe(true);
    expect(await reissueJoinCode(s.staff.admin)).toMatchObject({ ok: true });
    const second = await sharedJoin(s.staff.admin);
    expect(second!.code).not.toBe(first!.code);
    expect(await joinCodeOpen(first!.code)).toBe(false);
    expect(await joinCodeOpen(second!.code)).toBe(true);
    expect(await setSelfJoin(s.staff.admin, false)).toMatchObject({ ok: true });
    expect(await joinCodeOpen(second!.code)).toBe(false);
    expect((await sharedJoin(s.staff.admin))!.on).toBe(false);
    expect(await setSelfJoin(s.staff.admin, true)).toMatchObject({ ok: true });
    expect(await joinCodeOpen(second!.code)).toBe(true);
    expect((await db.query<{ action: string }>("select action from audit_log where target_type = 'settings' order by id")).map((l) => l.action)).toEqual(["join_code_reissue", "self_join_off", "self_join_on"]);
  });

  it("homeroom teachers reset the PIN for their own class only", async () => {
    expect(await resetPin(s.staff.homeroom, s.kidB)).toMatchObject({ ok: false });
    expect(await resetPin(s.staff.head, s.kidA)).toMatchObject({ ok: false });
    expect(await resetPin(s.staff.basic, s.kidA)).toMatchObject({ ok: false });
    expect(await resetPin(s.staff.homeroom, s.kidA)).toMatchObject({ ok: true });
    const row = (await db.query<{ qr_token: string; pin_hash: string | null; pin_fail_count: number }>("select qr_token, pin_hash, pin_fail_count from children where id = $1", [s.kidA]))[0];
    expect(row).toMatchObject({ qr_token: "ta", pin_hash: null, pin_fail_count: 0 });
    expect((await db.query("select 1 from audit_log where action = 'child_pin_reset'")).length).toBe(1);
    expect(await resetPin(s.staff.admin, s.kidB)).toMatchObject({ ok: true });
  });
});

describe("visit notes", () => {
  const note = { visited_on: TODAY, method: "phone", content: "통화함" };

  it("homeroom writes for own class, head reads only, basic never", async () => {
    expect(await addVisit(s.staff.homeroom, s.kidA, note)).toMatchObject({ ok: true });
    expect(await addVisit(s.staff.homeroom, s.kidB, note)).toMatchObject({ ok: false });
    expect(await addVisit(s.staff.head, s.kidA, note)).toMatchObject({ ok: false });
    expect(await addVisit(s.staff.basic, s.kidA, note)).toMatchObject({ ok: false });
    expect(await addVisit(s.staff.admin, s.kidB, note)).toMatchObject({ ok: true });

    expect((await getChildDetail(s.staff.homeroom, s.kidA))?.visits?.map((v) => v.content)).toEqual(["통화함"]);
    const head = await getChildDetail(s.staff.head, s.kidA);
    expect(head?.visits?.length).toBe(1);
    expect(head?.visits?.[0].canEdit).toBe(false);
    expect(head?.can.writeVisits).toBe(false);
    // the visits switch turned off hides the notes from a homeroom teacher
    expect((await getChildDetail({ ...s.staff.homeroom, can_visits: false }, s.kidA))?.visits).toBeNull();
  });

  it("only the author (or an admin) edits and deletes", async () => {
    const mine = await addVisit(s.staff.homeroom, s.kidA, note);
    const admins = await addVisit(s.staff.admin, s.kidA, note);
    if (!mine.ok || !admins.ok) throw new Error();
    expect(await updateVisit(s.staff.homeroom, admins.id, { ...note, content: "고침" })).toMatchObject({ ok: false });
    expect(await deleteVisit(s.staff.head, mine.id)).toMatchObject({ ok: false });
    expect(await deleteVisit(s.staff.other, mine.id)).toMatchObject({ ok: false });
    expect(await updateVisit(s.staff.homeroom, mine.id, { ...note, content: "고침" })).toMatchObject({ ok: true });
    expect(await deleteVisit(s.staff.admin, mine.id)).toMatchObject({ ok: true });
    expect(await addVisit(s.staff.homeroom, s.kidA, { ...note, method: "fax" })).toMatchObject({ ok: false });
    expect(await addVisit(s.staff.homeroom, s.kidA, { ...note, visited_on: addDays(TODAY, 1) })).toMatchObject({ ok: false });
  });
});

describe("attendance", () => {
  it("is limited to permitted classes and checks the child's class on the server", async () => {
    expect((await attendanceClasses(s.staff.homeroom)).map((c) => c.id)).toEqual([s.A]);
    expect((await attendanceClasses(s.staff.head)).length).toBe(2);
    expect(await attendanceClasses(s.staff.basic)).toEqual([]);
    expect(await attendanceRoster(s.staff.homeroom, s.B, WS)).toBeNull();
    expect(await attendanceRoster(s.staff.basic, s.A, WS)).toBeNull();

    expect(await saveAttendance(s.staff.homeroom, s.kidB, WS, "present")).toMatchObject({ ok: false });
    expect(await saveAttendance(s.staff.basic, s.kidA, WS, "present")).toMatchObject({ ok: false });
    expect(await saveAttendance({ ...s.staff.homeroom, can_attendance: false }, s.kidA, WS, "present")).toMatchObject({ ok: false });
    expect(await saveAttendance(s.staff.homeroom, s.kidA, addDays(TODAY, 7), "present")).toMatchObject({ ok: false });
    expect(await saveAttendance(s.staff.homeroom, s.kidA, WS, "absent", "가족 여행")).toMatchObject({ ok: true });
    const roster = await attendanceRoster(s.staff.homeroom, s.A, WS);
    expect(roster?.[0]).toMatchObject({ name: "가은", status: "absent", note: "가족 여행" });
    expect(await saveAttendance(s.staff.homeroom, s.kidA, WS, null)).toMatchObject({ ok: true });
    expect((await attendanceRoster(s.staff.head, s.A, WS))?.[0].status).toBeNull();
  });

  it("counts weeks in a row and flags long absences within scope", async () => {
    const m = new Map([[WS, "absent"], [addDays(WS, -7), "absent"], [addDays(WS, -14), "late"], [addDays(WS, -21), "present"]]);
    expect(streakFrom(m, WS)).toEqual({ kind: "absent", n: 2 });
    expect(streakFrom(m, addDays(WS, -14))).toEqual({ kind: "attend", n: 2 });
    expect(streakFrom(m, addDays(WS, -70))).toEqual({ kind: null, n: 0 });

    for (const k of [s.kidA, s.kidB]) await db.query("insert into attendance (child_id, date, status) values ($1,$2,'absent'),($1,$3,'absent')", [k, addDays(WS, -7), addDays(WS, -14)]);
    expect((await longAbsent(s.staff.homeroom)).map((k) => k.name)).toEqual(["가은"]);
    expect((await longAbsent(s.staff.head)).length).toBe(2);
    expect(await longAbsent(s.staff.basic)).toEqual([]);
    expect((await attendanceRoster(s.staff.homeroom, s.A, WS))?.[0].prior).toEqual({ kind: "absent", n: 2 });
  });
});

describe("approvals and missions entered for a child", () => {
  async function photoMission() {
    const r = await db.query<{ id: number }>("insert into missions (title, kind, drops, points, repeat, starts_on, ends_on) values ('가정예배','photo',3,30,'weekly',$1,$2) returning id", [WS, addDays(WS, 6)]);
    return r[0].id;
  }

  it("pending submissions show only for permitted classes and are re-checked on review", async () => {
    const m = await photoMission();
    const a = await completeMission(s.kidA, m, { photoUrl: "/api/photo/1" });
    const b = await completeMission(s.kidB, m, { photoUrl: "/api/photo/2" });
    if (!a.ok || !b.ok) throw new Error();
    expect((await pendingCompletions(s.staff.homeroom)).map((p) => p.child_name)).toEqual(["가은"]);
    expect((await pendingCompletions(s.staff.head)).length).toBe(2);
    expect(await pendingCompletions(s.staff.basic)).toEqual([]);
    expect(await pendingCompletions({ ...s.staff.homeroom, can_approve: false })).toEqual([]);

    expect(await reviewSubmission(s.staff.homeroom, b.completionId, true)).toMatchObject({ ok: false });
    expect(await reviewSubmission(s.staff.basic, a.completionId, true)).toMatchObject({ ok: false });
    expect(await dropBalance(db, s.kidB)).toBe(0);
    expect(await reviewSubmission(s.staff.homeroom, a.completionId, true)).toMatchObject({ ok: true });
    expect(await dropBalance(db, s.kidA)).toBe(3);
    expect(await reviewSubmission(s.staff.homeroom, a.completionId, true)).toMatchObject({ ok: false });
    expect(await reviewSubmission(s.staff.admin, b.completionId, false)).toMatchObject({ ok: true });
    expect(await dropBalance(db, s.kidB)).toBe(0);
  });

  it("a teacher enters a mission only for children they may approve", async () => {
    const m = await photoMission();
    expect(await proxyMissions(s.staff.basic, s.kidA)).toBeNull();
    expect(await proxyMissions(s.staff.homeroom, s.kidB)).toBeNull();
    expect(await proxyComplete(s.staff.homeroom, s.kidB, m)).toMatchObject({ ok: false });
    expect(await proxyComplete(s.staff.basic, s.kidA, m)).toMatchObject({ ok: false });
    expect(await proxyComplete(s.staff.homeroom, s.kidA, m)).toMatchObject({ ok: true, drops: 3, points: 30 });
    expect(await proxyComplete(s.staff.homeroom, s.kidA, m)).toMatchObject({ ok: false });
    const row = (await db.query<{ entered_by_staff_id: number; status: string }>("select entered_by_staff_id, status from mission_completions where child_id = $1", [s.kidA]))[0];
    expect(row).toMatchObject({ entered_by_staff_id: s.ids.homeroom, status: "approved" });
    expect((await proxyMissions(s.staff.homeroom, s.kidA))?.[0]).toMatchObject({ state: "done", canEnter: false });
  });

  it("any teacher can hide a reported comment or dismiss the report, and it is recorded", async () => {
    const post = (await db.query<{ id: number }>("insert into posts (body) values ('소식') returning id"))[0].id;
    const cm = await db.query<{ id: number }>("insert into comments (post_id, child_id, body) values ($1,$2,'나쁜 말'),($1,$2,'괜찮은 말') returning id", [post, s.kidA]);
    await db.query("insert into comment_reports (comment_id, child_id) values ($1,$3),($2,$3)", [cm[0].id, cm[1].id, s.kidB]);
    expect((await reportedComments(s.staff.basic)).length).toBe(2);
    expect(await hideComment(s.staff.basic, cm[0].id)).toMatchObject({ ok: true });
    expect(await dismissReports(s.staff.head, cm[1].id)).toMatchObject({ ok: true });
    expect(await reportedComments(s.staff.admin)).toEqual([]);
    const rows = await db.query<{ id: number; hidden_by: number | null }>("select id, hidden_by from comments order by id");
    expect(rows.map((r) => r.hidden_by)).toEqual([s.ids.basic, null]);
    const log = await db.query<{ action: string; staff_id: number }>("select action, staff_id from audit_log order by id");
    expect(log).toEqual([{ action: "comment_hide", staff_id: s.ids.basic }, { action: "report_dismiss", staff_id: s.ids.head }]);
    expect(await hideComment({ ...s.staff.basic, active: false }, cm[1].id)).toMatchObject({ ok: false });
  });
});

describe("worries", () => {
  async function seedWorries() {
    const rows = await db.query<{ id: number; audience: string }>(
      `insert into worries (child_id, content, audience, class_id_at_write) values
        ($1,'선생님만','teacher',$2), ($1,'전도사님만','pastor',$2), ($1,'둘 다','both',$2), ($3,'옆반 고민','teacher',$4)
       returning id, audience`,
      [s.kidA, s.A, s.kidB, s.B],
    );
    await db.query("insert into worries (child_id, content, audience, class_id_at_write, deleted_at) values ($1,'지운 글','both',$2, now())", [s.kidA, s.A]);
    return { teacher: rows[0].id, pastor: rows[1].id, both: rows[2].id, otherClass: rows[3].id };
  }

  it("lists only what the child chose to show, without the text, and never deleted ones", async () => {
    const w = await seedWorries();
    const ids = async (st: Staff) => (await listWorries(st)).map((x) => x.id).sort();
    expect(await ids(s.staff.homeroom)).toEqual([w.teacher, w.both].sort());
    expect(await ids(s.staff.other)).toEqual([w.otherClass]);
    expect(await ids(s.staff.admin)).toEqual([w.pastor, w.both].sort());
    expect(await ids(s.staff.head)).toEqual([]);
    expect(await ids(s.staff.basic)).toEqual([]);
    const json = JSON.stringify(await listWorries(s.staff.homeroom));
    expect(json).not.toContain("선생님만");
    expect(json).not.toContain("둘 다");
  });

  it("uses the class at the time of writing, not the child's class now", async () => {
    const w = await seedWorries();
    await moveChildren(s.staff.admin, [s.kidA], s.B);
    expect((await listWorries(s.staff.other)).map((x) => x.id)).toEqual([w.otherClass]);
    expect(await openWorry(s.staff.other, w.teacher)).toBeNull();
    expect(await openWorry(s.staff.homeroom, w.teacher)).not.toBeNull();
  });

  it("opening marks it read; forbidden worries cannot be opened or answered", async () => {
    const w = await seedWorries();
    expect(await unreadWorryCount(s.staff.homeroom)).toBe(2);
    expect((await openWorry(s.staff.homeroom, w.teacher))?.content).toBe("선생님만");
    await openWorry(s.staff.homeroom, w.teacher);
    expect(await unreadWorryCount(s.staff.homeroom)).toBe(1);
    expect((await db.query("select 1 from worry_reads where worry_id = $1", [w.teacher])).length).toBe(1);
    expect((await listWorries(s.staff.homeroom)).find((x) => x.id === w.teacher)?.unread).toBe(false);

    for (const [st, id] of [[s.staff.homeroom, w.pastor], [s.staff.admin, w.teacher], [s.staff.head, w.both], [s.staff.basic, w.both], [s.staff.homeroom, w.otherClass]] as const) {
      expect(await openWorry(st, id)).toBeNull();
      expect(await replyWorry(st, id, "답장")).toMatchObject({ ok: false });
    }
    expect((await db.query("select 1 from worry_reads")).length).toBe(1);
    expect(await replyWorry(s.staff.homeroom, w.both, "힘내자")).toMatchObject({ ok: true });
    expect((await openWorry(s.staff.admin, w.both))?.replies.map((r) => r.content)).toEqual(["힘내자"]);
    const deleted = (await db.query<{ id: number }>("select id from worries where deleted_at is not null"))[0].id;
    expect(await openWorry(s.staff.admin, deleted)).toBeNull();
  });

  it("the worry tab is hidden for head and basic teachers", () => {
    expect(staffTabs(s.staff.head)).toMatchObject({ worries: false, admin: false, attendance: true });
    expect(staffTabs(s.staff.basic)).toMatchObject({ worries: false, admin: false, attendance: false, children: true, approvals: true });
    expect(staffTabs(s.staff.homeroom)).toMatchObject({ worries: true, admin: false, attendance: true });
    expect(staffTabs(s.staff.admin)).toMatchObject({ worries: true, admin: true });
  });
});

describe("admin: teachers", () => {
  it("non-admins cannot list or change teachers", async () => {
    expect(await listStaff(s.staff.head)).toBeNull();
    expect(await createStaff(s.staff.head, "새교사", "admin")).toMatchObject({ ok: false });
    expect(await updateStaff(s.staff.homeroom, s.ids.homeroom, { role: "admin", class_ids: [], active: true })).toMatchObject({ ok: false });
    expect((await load(s.ids.homeroom)).role).toBe("homeroom");
  });

  it("an admin cannot demote or deactivate themselves", async () => {
    expect(await updateStaff(s.staff.admin, s.ids.admin, { role: "head", class_ids: [], active: true })).toMatchObject({ ok: false });
    expect(await updateStaff(s.staff.admin, s.ids.admin, { role: "admin", class_ids: [], active: false })).toMatchObject({ ok: false });
    const me = (await db.query<{ role: string; active: boolean }>("select role, active from staff where id = $1", [s.ids.admin]))[0];
    expect(me).toEqual({ role: "admin", active: true });
    // harmless edits of one's own row still work
    expect(await updateStaff(s.staff.admin, s.ids.admin, { role: "admin", class_ids: [s.A], active: true })).toMatchObject({ ok: true });
  });

  it("keeps at least one active admin", async () => {
    // A second admin can be demoted by the first...
    expect(await updateStaff(s.staff.admin, s.ids.head, { role: "admin", class_ids: [], active: true })).toMatchObject({ ok: true });
    const second = await load(s.ids.head);
    expect(await updateStaff(second, s.ids.admin, { role: "basic", class_ids: [], active: true })).toMatchObject({ ok: true });
    // ...but then the remaining one cannot be removed, even by a stale admin session.
    expect(await updateStaff(s.staff.admin, s.ids.head, { role: "basic", class_ids: [], active: true })).toMatchObject({ ok: false });
    expect(await updateStaff(s.staff.admin, s.ids.head, { role: "admin", class_ids: [], active: false })).toMatchObject({ ok: false });
    expect((await db.query("select 1 from staff where role = 'admin' and active")).length).toBe(1);
  });

  it("changing the role applies the preset; switches can refine it", async () => {
    expect(await updateStaff(s.staff.admin, s.ids.basic, { role: "homeroom", class_ids: [s.B, 9999], active: true })).toMatchObject({ ok: true });
    let t = await load(s.ids.basic);
    expect(t).toMatchObject({ role: "homeroom", ...ROLE_PRESETS.homeroom, class_ids: [s.B] });
    expect(await updateStaff(s.staff.admin, s.ids.basic, { role: "homeroom", class_ids: [s.B], switches: { can_visits: false }, active: true })).toMatchObject({ ok: true });
    t = await load(s.ids.basic);
    expect(t.can_visits).toBe(false);
    expect(t.can_attendance).toBe(true);
    expect(await updateStaff(s.staff.admin, s.ids.basic, { role: "basic", class_ids: [], active: true })).toMatchObject({ ok: true });
    expect(await load(s.ids.basic)).toMatchObject({ role: "basic", ...ROLE_PRESETS.basic });
  });

  it("invites bind a Kakao account once; unknown or inactive accounts are refused", async () => {
    const made = await createStaff(s.staff.admin, "새교사", "homeroom");
    if (!made.ok) throw new Error();
    const code = (await db.query<{ invite_code: string }>("select invite_code from staff where id = $1", [made.id]))[0].invite_code;
    expect(await resolveKakaoStaff("111", null)).toEqual({ ok: false, reason: "not_invited" });
    expect(await resolveKakaoStaff("111", "wrong-code")).toEqual({ ok: false, reason: "not_invited" });
    expect(await resolveKakaoStaff("111", code)).toEqual({ ok: true, staffId: made.id });
    // the code is used up: a second account cannot claim it
    expect(await resolveKakaoStaff("222", code)).toEqual({ ok: false, reason: "not_invited" });
    expect(await resolveKakaoStaff("111", null)).toEqual({ ok: true, staffId: made.id });
    await db.query("update staff set active = false where id = $1", [made.id]);
    expect(await resolveKakaoStaff("111", null)).toEqual({ ok: false, reason: "inactive" });
    // an invite for a switched-off teacher does not work either
    const off = await createStaff(s.staff.admin, "꺼진교사", "basic");
    if (!off.ok) throw new Error();
    await db.query("update staff set active = false where id = $1", [off.id]);
    const offCode = (await db.query<{ invite_code: string }>("select invite_code from staff where id = $1", [off.id]))[0].invite_code;
    expect(await resolveKakaoStaff("333", offCode)).toEqual({ ok: false, reason: "not_invited" });
  });
});

describe("admin: missions, points, settings, exports", () => {
  it("only admins manage missions; the weekly drop total is compared with the cap", async () => {
    const input = { ...defaultMissionInput(), title: "기도", drops: 2, points: 10 };
    expect(await saveMission(s.staff.head, null, input)).toMatchObject({ ok: false });
    expect(await listMissions(s.staff.homeroom)).toBeNull();
    const a = await saveMission(s.staff.admin, null, input);
    if (!a.ok) throw new Error();
    let check = await weeklyDropCheck(s.staff.admin);
    expect(check).toMatchObject({ cap: 12, under: true, over: false });
    // daily with a weekly limit of 5 -> 2 x 5 more drops, and a 6th-grade-only mission pushes that class over
    expect(await saveMission(s.staff.admin, null, { ...input, title: "매일", repeat: "daily", weekly_limit: 5 })).toMatchObject({ ok: true });
    expect(await saveMission(s.staff.admin, null, { ...input, title: "6학년만", drops: 1, target_grade: 6 })).toMatchObject({ ok: true });
    check = await weeklyDropCheck(s.staff.admin);
    expect(check?.classes).toEqual([{ name: "5학년 2반", total: 12 }, { name: "6학년 1반", total: 13 }]);
    expect(check).toMatchObject({ over: true, under: false });

    expect(await saveMission(s.staff.admin, null, { ...input, kind: "verse" })).toMatchObject({ ok: false });
    expect(await saveMission(s.staff.admin, null, { ...input, ends_on: addDays(input.starts_on, -1) })).toMatchObject({ ok: false });
    const copy = await duplicateToNextWeek(s.staff.admin, a.id);
    if (!copy.ok) throw new Error();
    const row = (await db.query<{ starts_on: string; ends_on: string; title: string }>("select starts_on, ends_on, title from missions where id = $1", [copy.id]))[0];
    expect(row).toEqual({ starts_on: addDays(input.starts_on, 7), ends_on: addDays(input.ends_on, 7), title: "기도" });
  });

  it("point corrections are new ledger rows with the admin's id and a reason", async () => {
    expect(await adjustPoints(s.staff.head, s.kidA, 10, "상")).toMatchObject({ ok: false });
    expect(await adjustPoints(s.staff.admin, s.kidA, 10, "")).toMatchObject({ ok: false });
    expect(await adjustPoints(s.staff.admin, s.kidA, 0, "상")).toMatchObject({ ok: false });
    expect(await adjustPoints(s.staff.admin, s.kidA, 50, "암송 대회")).toMatchObject({ ok: true });
    expect(await adjustPoints(s.staff.admin, s.kidA, -20, "잘못 준 포인트")).toMatchObject({ ok: true });
    expect(await pointBalance(db, s.kidA)).toBe(30);
    const rows = await db.query<{ delta: number; staff_id: number; reason: string }>("select delta, staff_id, reason from point_ledger order by id");
    expect(rows).toEqual([{ delta: 50, staff_id: s.ids.admin, reason: "암송 대회" }, { delta: -20, staff_id: s.ids.admin, reason: "잘못 준 포인트" }]);
    expect(await balances(s.staff.homeroom)).toBeNull();
  });

  it("exports are admin only and start with a BOM", async () => {
    expect(await pointsCsv(s.staff.head)).toBeNull();
    expect(await attendanceCsv(s.staff.homeroom)).toBeNull();
    await adjustPoints(s.staff.admin, s.kidA, 50, "상");
    await db.query("update children set name = '=cmd,\"x\"' where id = $1", [s.kidB]);
    const csv = await pointsCsv(s.staff.admin);
    expect(csv?.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("5학년 2반,가은,50,0");
    expect(csv).toContain("\"'=cmd,\"\"x\"\"\"");
    await saveAttendance(s.staff.admin, s.kidA, WS, "late");
    const att = await attendanceCsv(s.staff.admin, 2);
    expect(att?.split("\r\n")[0]).toBe(`﻿반,이름,${addDays(WS, -7)},${WS},출석 수`);
    expect(att).toContain("5학년 2반,가은,,지각,1");
  });

  it("settings are validated and admin only", async () => {
    const good = { weeklyDropCap: 10, levelNeeds: [1, 2, 3, 4, 5, 6], classGoal: 20, harvestBonusPoints: 0 };
    expect(await saveSettings(s.staff.head, good)).toMatchObject({ ok: false });
    expect(await saveSettings(s.staff.admin, { ...good, levelNeeds: [1, 2, 3] })).toMatchObject({ ok: false });
    expect(await saveSettings(s.staff.admin, { ...good, weeklyDropCap: 0 })).toMatchObject({ ok: false });
    expect(await saveSettings(s.staff.admin, good)).toMatchObject({ ok: true });
    expect((await weeklyDropCheck(s.staff.admin))?.cap).toBe(10);
  });

  it("settings keep the welcome-back drops and the rotating count when they are left out, and check them when given", async () => {
    const good = { weeklyDropCap: 12, levelNeeds: [2, 4, 6, 8, 10, 10], classGoal: 30, harvestBonusPoints: 50 };
    expect(await saveSettings(s.staff.admin, { ...good, welcomeBackDrops: 6 })).toMatchObject({ ok: false });
    expect(await saveSettings(s.staff.admin, { ...good, rotatingPerWeek: 11 })).toMatchObject({ ok: false });
    expect(await saveSettings(s.staff.admin, { ...good, welcomeBackDrops: -1 })).toMatchObject({ ok: false });
    expect(await saveSettings(s.staff.admin, { ...good, welcomeBackDrops: 0, rotatingPerWeek: 2 })).toMatchObject({ ok: true });
    expect(await getSettings(db)).toMatchObject({ welcomeBackDrops: 0, rotatingPerWeek: 2 });
    expect(await saveSettings(s.staff.admin, good)).toMatchObject({ ok: true });
    expect(await getSettings(db)).toMatchObject({ welcomeBackDrops: 0, rotatingPerWeek: 2 });
  });

  it("only admins move children between classes", async () => {
    expect(await moveChildren(s.staff.head, [s.kidA], s.B)).toMatchObject({ ok: false });
    expect(await moveChildren(s.staff.admin, [s.kidA, s.kidB], s.B)).toMatchObject({ ok: true, moved: 1 });
    expect(await getChildDetail(s.staff.homeroom, s.kidA)).toBeNull();
  });
});
