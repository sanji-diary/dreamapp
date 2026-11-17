import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { db, resetDbForTests } from "@/lib/db";
import { completeMission, dropBalance, harvestTree, missionsForChild, pointBalance, recordAttendance, reviewCompletion, waterTree } from "@/lib/game";
import { canReadWorry, canSeeChildDetail, canWriteVisits, worryCondition } from "@/lib/authz";
import { weekStart } from "@/lib/time";
import type { Staff } from "@/lib/types";

const DATE = "2027-01-06"; // a Wednesday
const WS = weekStart(DATE); // 2027-01-03, Sunday

async function setup() {
  resetDbForTests();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade) values ('5학년 2반', 5), ('6학년 1반', 6) returning id");
  const st = await db.query<{ id: number }>("insert into staff (name, role) values ('관리자','admin'), ('담임','homeroom') returning id");
  const kid = await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('아이', $1, 't1') returning id", [cls[0].id]);
  const add = async (title: string, kind: string, drops: number, points: number, repeat = "weekly", limit: number | null = null, extra: Record<string, unknown> = {}) => {
    const r = await db.query<{ id: number }>(
      "insert into missions (title, kind, drops, points, repeat, weekly_limit, starts_on, ends_on, verse_text) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
      [title, kind, drops, points, repeat, limit, WS, "2027-01-09", extra.verse ?? null],
    );
    return r[0].id;
  };
  return { classId: cls[0].id, otherClassId: cls[1].id, adminId: st[0].id, teacherId: st[1].id, kidId: kid[0].id, add };
}

describe("missions and drops", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("gives drops and points for a self-check mission, once per week", async () => {
    const m = await s.add("기도", "self", 1, 5);
    const r = await completeMission(s.kidId, m, { date: DATE });
    expect(r).toMatchObject({ ok: true, status: "approved", drops: 1, points: 5 });
    expect(await dropBalance(db, s.kidId)).toBe(1);
    expect(await pointBalance(db, s.kidId)).toBe(5);
    expect(await completeMission(s.kidId, m, { date: DATE })).toMatchObject({ ok: false, reason: "already_done" });
  });

  it("daily missions respect the weekly limit", async () => {
    const m = await s.add("매일 기도", "self", 1, 5, "daily", 3);
    for (const d of ["2027-01-03", "2027-01-04", "2027-01-05"]) expect((await completeMission(s.kidId, m, { date: d })).ok).toBe(true);
    expect(await completeMission(s.kidId, m, { date: "2027-01-05" })).toMatchObject({ ok: false });
    expect(await completeMission(s.kidId, m, { date: "2027-01-06" })).toMatchObject({ ok: false, reason: "already_done" });
    expect(await dropBalance(db, s.kidId)).toBe(3);
  });

  it("caps mission drops at 12 a week but still gives points", async () => {
    const ids = [] as number[];
    for (let i = 0; i < 5; i++) ids.push(await s.add("미션" + i, "self", 3, 10));
    let total = 0;
    for (const id of ids) {
      const r = await completeMission(s.kidId, id, { date: DATE });
      if (r.ok) total += r.drops;
    }
    expect(total).toBe(12);
    expect(await dropBalance(db, s.kidId)).toBe(12);
    expect(await pointBalance(db, s.kidId)).toBe(50);
    const list = await missionsForChild(db, s.kidId, DATE);
    expect(list.every((m) => m.drops_now === 0)).toBe(true);
  });

  it("photo missions wait for a teacher; a teacher can enter them directly", async () => {
    const m = await s.add("가정예배", "photo", 3, 30);
    const r = await completeMission(s.kidId, m, { date: DATE, photoUrl: "x" });
    expect(r).toMatchObject({ ok: true, status: "pending", drops: 0 });
    expect(await dropBalance(db, s.kidId)).toBe(0);
    if (!r.ok) throw new Error();
    expect(await reviewCompletion(s.teacherId, r.completionId, true)).toBe(true);
    expect(await dropBalance(db, s.kidId)).toBe(3);
    expect(await reviewCompletion(s.teacherId, r.completionId, true)).toBe(false);

    const kid2 = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('폰없음', $1, 't2') returning id", [s.classId]))[0].id;
    const r2 = await completeMission(kid2, m, { date: DATE, byStaffId: s.teacherId });
    expect(r2).toMatchObject({ ok: true, status: "approved", drops: 3 });
  });

  it("a daily photo mission shows as waiting, not done, until the teacher has looked at it", async () => {
    const m = await s.add("매일 가정예배", "photo", 1, 5, "daily", 3);
    const state = async (date: string) => (await missionsForChild(db, s.kidId, date)).find((x) => x.id === m)?.state;
    const r = await completeMission(s.kidId, m, { date: DATE, photoUrl: "x" });
    if (!r.ok) throw new Error();
    expect(r.status).toBe("pending");
    // Nothing has been given yet, so the list must not call it done.
    expect(await dropBalance(db, s.kidId)).toBe(0);
    expect(await state(DATE)).toBe("pending");
    // A second photo the same day is still refused while the first one waits.
    expect(await completeMission(s.kidId, m, { date: DATE, photoUrl: "y" })).toMatchObject({ ok: false, reason: "already_done" });
    await reviewCompletion(s.teacherId, r.completionId, true);
    expect(await dropBalance(db, s.kidId)).toBe(1);
    expect(await state(DATE)).toBe("done");
    expect(await state("2027-01-07")).toBe("available");
  });

  it("rejected submissions can be tried again", async () => {
    const m = await s.add("가정예배", "photo", 3, 30);
    const r = await completeMission(s.kidId, m, { date: DATE });
    if (!r.ok) throw new Error();
    await reviewCompletion(s.teacherId, r.completionId, false);
    expect((await completeMission(s.kidId, m, { date: DATE })).ok).toBe(true);
  });

  it("verse missions need the exact text", async () => {
    const m = await s.add("말씀", "verse", 2, 15, "weekly", null, { verse: "여호와는 나의 목자시니" });
    expect(await completeMission(s.kidId, m, { date: DATE, text: "여호와는 나의 목자" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await completeMission(s.kidId, m, { date: DATE, text: "여호와는 나의 목자시니" })).toMatchObject({ ok: true, drops: 2 });
  });

  it("marking attendance completes the attendance mission once", async () => {
    await s.add("출석", "attendance", 2, 20);
    await recordAttendance(s.teacherId, s.kidId, WS, "present");
    await recordAttendance(s.teacherId, s.kidId, WS, "late");
    expect(await dropBalance(db, s.kidId)).toBe(2);
    // A mistaken tap is undone: the drops and points go back, and marking present again re-awards once.
    await recordAttendance(s.teacherId, s.kidId, WS, "absent");
    expect(await dropBalance(db, s.kidId)).toBe(0);
    expect(await pointBalance(db, s.kidId)).toBe(0);
    await recordAttendance(s.teacherId, s.kidId, WS, "present", "늦잠");
    expect(await dropBalance(db, s.kidId)).toBe(2);
    await recordAttendance(s.teacherId, s.kidId, WS, "late");
    expect((await db.query<{ note: string }>("select note from attendance where child_id = $1", [s.kidId]))[0].note).toBe("늦잠");
    await recordAttendance(s.teacherId, s.kidId, WS, null);
    expect(await dropBalance(db, s.kidId)).toBe(0);
  });
});

describe("tree growth", () => {
  it("needs 2,4,6,8,10,10 drops and then can be harvested", async () => {
    const s = await setup();
    await db.query("insert into drop_ledger (child_id, delta, reason) values ($1, 41, 'test')", [s.kidId]);
    const levels: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = await waterTree(s.kidId);
      if (!r.ok) throw new Error("water failed at " + i);
      levels.push(r.tree.level);
      if (i < 39) expect(r.ripe).toBe(false);
      else expect(r.ripe).toBe(true);
    }
    expect(levels[0]).toBe(1);
    expect(levels[1]).toBe(2);
    expect(levels[5]).toBe(3);
    expect(levels[11]).toBe(4);
    expect(levels[19]).toBe(5);
    expect(levels[29]).toBe(6);
    expect(await waterTree(s.kidId)).toMatchObject({ ok: false, reason: "ripe" });
    expect(await dropBalance(db, s.kidId)).toBe(1);
    const h = await harvestTree(s.kidId);
    expect(h).toMatchObject({ ok: true, bonus: 50, treeCount: 1 });
    if (!h.ok) throw new Error();
    expect(h.newTree).toMatchObject({ level: 1, given: 0, seq: 2 });
    expect(await pointBalance(db, s.kidId)).toBe(50);
  });

  it("cannot water without drops or harvest an unripe tree", async () => {
    const s = await setup();
    expect(await waterTree(s.kidId)).toMatchObject({ ok: false, reason: "no_drops" });
    expect(await harvestTree(s.kidId)).toMatchObject({ ok: false, reason: "not_ripe" });
  });
});

describe("who can see what", () => {
  const base = { id: 1, name: "x", active: true, can_attendance: true, can_visits: true, can_approve: true, can_view_all: false, can_read_pastor_worries: false };
  const admin: Staff = { ...base, role: "admin", can_view_all: true, can_read_pastor_worries: true, class_ids: [] };
  const head: Staff = { ...base, role: "head", can_view_all: true, class_ids: [] };
  const homeroom: Staff = { ...base, role: "homeroom", class_ids: [7] };
  const basic: Staff = { ...base, role: "basic", can_attendance: false, can_visits: false, can_approve: false, class_ids: [] };

  it("limits child details by role and class", () => {
    expect(canSeeChildDetail(admin, 3)).toBe(true);
    expect(canSeeChildDetail(head, 3)).toBe(true);
    expect(canSeeChildDetail(homeroom, 7)).toBe(true);
    expect(canSeeChildDetail(homeroom, 3)).toBe(false);
    expect(canSeeChildDetail(basic, 7)).toBe(false);
    expect(canWriteVisits(head, 7)).toBe(false);
    expect(canWriteVisits(homeroom, 7)).toBe(true);
    expect(canWriteVisits(homeroom, 3)).toBe(false);
  });

  it("shows worries only to the people the child chose", () => {
    const teacherOnly = { audience: "teacher", class_id_at_write: 7 };
    const pastorOnly = { audience: "pastor", class_id_at_write: 7 };
    const both = { audience: "both", class_id_at_write: 7 };
    expect(canReadWorry(admin, teacherOnly)).toBe(false);
    expect(canReadWorry(admin, pastorOnly)).toBe(true);
    expect(canReadWorry(admin, both)).toBe(true);
    expect(canReadWorry(homeroom, teacherOnly)).toBe(true);
    expect(canReadWorry(homeroom, pastorOnly)).toBe(false);
    expect(canReadWorry(homeroom, both)).toBe(true);
    expect(canReadWorry({ ...homeroom, class_ids: [9] }, teacherOnly)).toBe(false);
    for (const w of [teacherOnly, pastorOnly, both]) {
      expect(canReadWorry(head, w)).toBe(false);
      expect(canReadWorry(basic, w)).toBe(false);
    }
    expect(worryCondition(head, 1).sql).toBe("false");
  });

  it("applies the same worry rule in SQL", async () => {
    const s = await setup();
    await db.query("insert into worries (child_id, content, audience, class_id_at_write) values ($1,'a','teacher',$2),($1,'b','pastor',$2),($1,'c','both',$2)", [s.kidId, s.classId]);
    const run = async (st: Staff) => {
      const c = worryCondition(st, 1);
      return (await db.query<{ content: string }>(`select w.content from worries w where ${c.sql} order by w.content`, c.params)).map((r) => r.content).join("");
    };
    expect(await run(admin)).toBe("bc");
    expect(await run({ ...homeroom, class_ids: [s.classId] })).toBe("ac");
    expect(await run({ ...homeroom, class_ids: [s.otherClassId] })).toBe("");
    expect(await run(head)).toBe("");
  });
});
