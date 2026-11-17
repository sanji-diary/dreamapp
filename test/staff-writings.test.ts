import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { ROLE_PRESETS } from "@/lib/authz";
import { db, resetDbForTests } from "@/lib/db";
import { completeMission } from "@/lib/game";
import { submitWorry } from "@/lib/kid/worries";
import { getChildDetail } from "@/lib/staff/children";
import { addDays, todayKst, weekStart } from "@/lib/time";
import type { Role, Staff } from "@/lib/types";

const TODAY = todayKst();
const WS = weekStart(TODAY);

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
    return load(r[0].id);
  };
  const staff = { admin: await mk("관리자", "admin"), homeroom: await mk("담임", "homeroom", A), other: await mk("옆반담임", "homeroom", B), basic: await mk("기본", "basic") };
  const kid = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('가은', $1, 'ta') returning id", [A]))[0].id;
  const mission = async (title: string, kind: string, repeat = "daily") =>
    (await db.query<{ id: number }>("insert into missions (title, kind, drops, points, repeat, starts_on, ends_on) values ($1,$2,1,5,$3,$4,$5) returning id", [title, kind, repeat, addDays(WS, -28), addDays(WS, 6)]))[0].id;
  return { kid, staff, mission };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

describe("what a child wrote in free-text missions", () => {
  it("is shown to the teachers who may open the child's profile, newest first", async () => {
    const diary = await s.mission("감사 일기", "text");
    expect((await completeMission(s.kid, diary, { text: "엄마가 도시락을 싸 주셔서 감사해요", date: addDays(TODAY, -1) })).ok).toBe(true);
    expect((await completeMission(s.kid, diary, { text: "친구랑 화해했어요\n기뻤어요", date: TODAY })).ok).toBe(true);

    const mine = await getChildDetail(s.staff.homeroom, s.kid);
    expect(mine?.writingCount).toBe(2);
    expect(mine?.writings.map((w) => [w.title, w.done_on, w.text])).toEqual([
      ["감사 일기", TODAY, "친구랑 화해했어요\n기뻤어요"],
      ["감사 일기", addDays(TODAY, -1), "엄마가 도시락을 싸 주셔서 감사해요"],
    ]);
    expect((await getChildDetail(s.staff.admin, s.kid))?.writings).toHaveLength(2);
    // teachers who may not open the profile get nothing at all
    expect(await getChildDetail(s.staff.other, s.kid)).toBeNull();
    expect(await getChildDetail(s.staff.basic, s.kid)).toBeNull();
  });

  it("shows the five newest unless all are asked for, and always the true count", async () => {
    const diary = await s.mission("감사 일기", "text");
    for (let i = 0; i < 7; i++) expect((await completeMission(s.kid, diary, { text: `글 ${i}`, date: addDays(TODAY, -i) })).ok).toBe(true);
    const short = await getChildDetail(s.staff.homeroom, s.kid);
    expect(short?.writings.map((w) => w.text)).toEqual(["글 0", "글 1", "글 2", "글 3", "글 4"]);
    expect(short?.writingCount).toBe(7);
    const all = await getChildDetail(s.staff.homeroom, s.kid, { allWritings: true });
    expect(all?.writings).toHaveLength(7);
  });

  it("never includes worries, other kinds of missions, or tries a teacher sent back", async () => {
    await s.mission("고민 적기", "worry", "weekly");
    const self = await s.mission("기도하기", "self");
    const photo = await s.mission("가정예배", "photo", "weekly");
    expect((await submitWorry(s.kid, "아무에게도 말 못 한 고민", "teacher")).ok).toBe(true);
    expect((await completeMission(s.kid, self)).ok).toBe(true);
    expect((await completeMission(s.kid, photo, { photoUrl: "/x.jpg" })).ok).toBe(true);
    const diary = await s.mission("감사 일기", "text");
    const r = await completeMission(s.kid, diary, { text: "지울 글" });
    if (!r.ok) throw new Error("expected the text mission to complete");
    await db.query("update mission_completions set status = 'rejected' where id = $1", [r.completionId]);

    const d = await getChildDetail(s.staff.homeroom, s.kid);
    expect(d?.writings).toEqual([]);
    expect(d?.writingCount).toBe(0);
    expect(JSON.stringify(d)).not.toContain("아무에게도 말 못 한 고민");
  });
});
