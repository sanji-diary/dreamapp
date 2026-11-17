import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

// The children's actions are called for real; only the request-bound pieces are replaced.
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
import { completeMission, dropBalance, harvestTree, missionsForChild, pointBalance, recordAttendance, reviewCompletion, waterTree } from "@/lib/game";
import { completeMissionAction, requestCheckAction, verseAction } from "@/lib/kid/actions";
import { completionForChild } from "@/lib/kid/queries";
import { pendingCompletions, reviewSubmission } from "@/lib/staff/review";
import { proxyComplete } from "@/lib/staff/children";
import { addDays, todayKst, weekStart } from "@/lib/time";
import type { Staff } from "@/lib/types";

/**
 * Rules of the children's side that involve a teacher or two requests at once: asking a teacher
 * to check, being asked to do a mission again, taps that arrive together, and what is stored of
 * a free-text mission. The actions use the real clock, so the missions here are open today.
 */
const TODAY = todayKst();
const WS = weekStart(TODAY);

async function setup() {
  resetDbForTests();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade) values ('5학년 2반', 5), ('6학년 1반', 6) returning id");
  const st = await db.query<{ id: number }>("insert into staff (name, role) values ('관리자','admin'), ('담임','homeroom'), ('옆 반 담임','homeroom') returning id");
  await db.query("insert into staff_classes (staff_id, class_id) values ($1,$2), ($3,$4)", [st[1].id, cls[0].id, st[2].id, cls[1].id]);
  const kid = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('아이', $1, 't1') returning id", [cls[0].id]))[0].id;
  const base = { active: true, can_attendance: true, can_visits: true, can_approve: true, can_view_all: false, can_read_pastor_worries: false };
  const teacher: Staff = { ...base, id: st[1].id, name: "담임", role: "homeroom", class_ids: [cls[0].id] };
  const otherTeacher: Staff = { ...base, id: st[2].id, name: "옆 반 담임", role: "homeroom", class_ids: [cls[1].id] };
  /** A mission open from two weeks ago to two weeks ahead. */
  const add = async (title: string, kind: string, o: { drops?: number; points?: number; repeat?: string; verse?: string } = {}) => {
    const r = await db.query<{ id: number }>("insert into missions (title, kind, drops, points, repeat, starts_on, ends_on, verse_text) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id", [
      title,
      kind,
      o.drops ?? 2,
      o.points ?? 10,
      o.repeat ?? "weekly",
      addDays(WS, -14),
      addDays(WS, 20),
      o.verse ?? null,
    ]);
    return r[0].id;
  };
  const view = async (id: number, date = TODAY) => (await missionsForChild(db, kid, date)).find((m) => m.id === id);
  signedIn.id = kid;
  return { classId: cls[0].id, teacher, otherTeacher, kid, add, view };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

describe("asking a teacher to check (교사 확인 미션)", () => {
  it("the child's request waits in the teacher's list and is credited when the teacher approves", async () => {
    const m = await s.add("성경 암송", "teacher", { drops: 2, points: 20 });
    expect(await s.view(m)).toMatchObject({ state: "available", returned: false });
    // The button on the mission screen: the request is recorded and the child is sent to the "waiting" screen.
    await expect(requestCheckAction(m)).rejects.toThrow(/REDIRECT \/missions\/done\/\d+/);
    const c = await one<{ id: number; status: string; drops_awarded: number }>(db, "select id, status, drops_awarded from mission_completions where mission_id = $1", [m]);
    expect(c).toMatchObject({ status: "pending", drops_awarded: 0 });
    expect(await s.view(m)).toMatchObject({ state: "pending" });
    expect(await completionForChild(s.kid, c!.id)).toMatchObject({ status: "pending", kind: "teacher", mission_drops: 2, mission_points: 20 });
    expect(await dropBalance(db, s.kid)).toBe(0);

    // It is in the homeroom teacher's list (with no photo and no text), and not in another class's teacher's.
    expect(await pendingCompletions(s.teacher)).toMatchObject([{ id: c!.id, child_id: s.kid, title: "성경 암송", kind: "teacher", photo_url: null, text_content: null, done_on: TODAY }]);
    expect(await pendingCompletions(s.otherTeacher)).toEqual([]);

    // Asking twice does not make a second request.
    expect(await requestCheckAction(m)).toEqual({ ok: false, message: "이미 선생님께 요청했어요" });
    expect(await completeMission(s.kid, m)).toEqual({ ok: false, reason: "already_done" });
    expect(await db.query("select 1 from mission_completions")).toHaveLength(1);

    expect(await reviewSubmission(s.otherTeacher, c!.id, true)).toMatchObject({ ok: false });
    expect(await reviewSubmission(s.teacher, c!.id, true)).toEqual({ ok: true });
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(20);
    expect(await s.view(m)).toMatchObject({ state: "done" });
    expect(await pendingCompletions(s.teacher)).toEqual([]);
    expect(await requestCheckAction(m)).toEqual({ ok: false, message: "이미 한 미션이에요" });
  });

  it("only a 교사 확인 mission can be requested; a teacher can still tick it off without a request", async () => {
    const self = await s.add("기도", "self");
    const photo = await s.add("가정예배", "photo");
    const m = await s.add("성경 암송", "teacher");
    for (const id of [self, photo, 99999]) expect(await requestCheckAction(id)).toEqual({ ok: false, message: "지금은 할 수 없는 미션이에요" });
    expect(await db.query("select 1 from mission_completions")).toEqual([]);
    // The older way stays: the teacher enters it for the child and it is credited at once.
    expect(await proxyComplete(s.teacher, s.kid, m)).toEqual({ ok: true, drops: 2, points: 10 });
    expect(await pendingCompletions(s.teacher)).toEqual([]);
    expect(await s.view(m)).toMatchObject({ state: "done" });
  });
});

describe("when a teacher sends a mission back", () => {
  const send = async (m: number, date = TODAY, photo = false) => {
    const r = await completeMission(s.kid, m, photo ? { date, photoUrl: "/api/photo/1" } : { date });
    if (!r.ok) throw new Error("not accepted: " + r.reason);
    return r.completionId;
  };

  it("the child is told, for a photo and for a request to check, until they try again", async () => {
    const photo = await s.add("가정예배", "photo");
    const check = await s.add("성경 암송", "teacher");
    for (const m of [photo, check]) {
      const first = await send(m, TODAY, m === photo);
      expect(await s.view(m)).toMatchObject({ state: "pending", returned: false });
      expect(await reviewCompletion(s.teacher.id, first, false)).toBe(true);
      // Open again, with the line "선생님이 다시 해 달라고 했어요".
      expect(await s.view(m)).toMatchObject({ state: "available", returned: true });
      // The next try is waiting: nothing to tell any more.
      const second = await send(m, TODAY, m === photo);
      expect(await s.view(m)).toMatchObject({ state: "pending", returned: false });
      await reviewCompletion(s.teacher.id, second, true);
      expect(await s.view(m)).toMatchObject({ state: "done", returned: false });
    }
    expect(await dropBalance(db, s.kid)).toBe(4);
  });

  it("only the latest try counts: sent back twice still says it once, approved after that says nothing", async () => {
    const photo = await s.add("가정예배", "photo");
    await reviewCompletion(s.teacher.id, await send(photo, TODAY, true), false);
    await reviewCompletion(s.teacher.id, await send(photo, TODAY, true), false);
    expect(await s.view(photo)).toMatchObject({ state: "available", returned: true });
    expect(await db.query("select 1 from mission_completions where status = 'rejected'")).toHaveLength(2);
  });

  it("a weekly mission says it this week only, a daily one today only, a one-time one until it is done", async () => {
    const weekly = await s.add("가정예배", "photo", { repeat: "weekly" });
    const daily = await s.add("매일 사진", "photo", { repeat: "daily" });
    const once = await s.add("한 번만", "teacher", { repeat: "once" });
    for (const m of [weekly, daily, once]) await reviewCompletion(s.teacher.id, await send(m, TODAY, m !== once), false);
    for (const m of [weekly, daily, once]) expect(await s.view(m)).toMatchObject({ state: "available", returned: true });

    // Tomorrow (when it is still the same week): the daily mission starts fresh.
    const tomorrow = addDays(TODAY, 1);
    if (weekStart(tomorrow) === WS) expect(await s.view(weekly, tomorrow)).toMatchObject({ returned: true });
    expect(await s.view(daily, tomorrow)).toMatchObject({ state: "available", returned: false });
    expect(await s.view(once, tomorrow)).toMatchObject({ returned: true });
    // Next week: only the one-time mission still carries it.
    const nextWeek = addDays(WS, 7);
    expect(await s.view(weekly, nextWeek)).toMatchObject({ state: "available", returned: false });
    expect(await s.view(daily, nextWeek)).toMatchObject({ returned: false });
    expect(await s.view(once, nextWeek)).toMatchObject({ state: "available", returned: true });
  });

  it("an attendance correction is not 'sent back': the child is not asked for anything", async () => {
    const att = await s.add("주일 예배 출석", "attendance");
    await recordAttendance(s.teacher.id, s.kid, WS, "present");
    expect(await s.view(att, WS)).toMatchObject({ state: "done", returned: false });
    await recordAttendance(s.teacher.id, s.kid, WS, "absent");
    expect(await one(db, "select status from mission_completions where mission_id = $1", [att])).toEqual({ status: "rejected" });
    expect(await s.view(att, WS)).toMatchObject({ state: "available", returned: false });
    // Missions of other kinds never carry it either.
    const self = await s.add("기도", "self");
    expect(await s.view(self)).toMatchObject({ returned: false });
  });
});

describe("taps that arrive together", () => {
  it("two completions of the same mission: one is recorded, one is 'already done'", async () => {
    const m = await s.add("기도", "self", { drops: 2, points: 10 });
    const results = await Promise.all([completeMission(s.kid, m), completeMission(s.kid, m), completeMission(s.kid, m)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "already_done")).toHaveLength(2);
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(10);
    expect(await db.query("select 1 from mission_completions")).toHaveLength(1);
  });

  it("two teachers deciding on the same submission: it is credited once", async () => {
    const m = await s.add("가정예배", "photo", { drops: 3, points: 30 });
    const r = await completeMission(s.kid, m, { photoUrl: "/api/photo/1" });
    if (!r.ok) throw new Error();
    const both = await Promise.all([reviewCompletion(s.teacher.id, r.completionId, true), reviewCompletion(s.otherTeacher.id, r.completionId, true)]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(await dropBalance(db, s.kid)).toBe(3);
    expect(await pointBalance(db, s.kid)).toBe(30);
    // Approve and send back at once: whichever comes first stands, the other does nothing.
    const again = await completeMission(s.kid, await s.add("또 사진", "photo"), { photoUrl: "/api/photo/2" });
    if (!again.ok) throw new Error();
    const mixed = await Promise.all([reviewCompletion(s.teacher.id, again.completionId, false), reviewCompletion(s.otherTeacher.id, again.completionId, true)]);
    expect(mixed.filter(Boolean)).toHaveLength(1);
    const stands = await one<{ status: string; reviewed_by: number }>(db, "select status, reviewed_by from mission_completions where id = $1", [again.completionId]);
    expect(stands?.status).toBe(mixed[0] ? "rejected" : "approved");
    expect(stands?.reviewed_by).toBe(mixed[0] ? s.teacher.id : s.otherTeacher.id);
    expect(await dropBalance(db, s.kid)).toBe(mixed[0] ? 3 : 5);
  });

  it("watering with one drop left, and harvesting, happen once", async () => {
    await db.query("insert into drop_ledger (child_id, delta, reason) values ($1, 1, 'test')", [s.kid]);
    const waters = await Promise.all([waterTree(s.kid), waterTree(s.kid), waterTree(s.kid)]);
    expect(waters.filter((w) => w.ok)).toHaveLength(1);
    expect(waters.filter((w) => !w.ok && w.reason === "no_drops")).toHaveLength(2);
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(await one(db, "select level, given from trees where child_id = $1", [s.kid])).toEqual({ level: 1, given: 1 });

    await db.query("update trees set level = 6, given = 10 where child_id = $1", [s.kid]);
    const harvests = await Promise.all([harvestTree(s.kid), harvestTree(s.kid)]);
    expect(harvests.filter((h) => h.ok)).toHaveLength(1);
    expect(await pointBalance(db, s.kid)).toBe(50);
    expect(await db.query("select 1 from trees where child_id = $1", [s.kid])).toHaveLength(2);
  });

  it("an attendance mark set and corrected at the same moment leaves the ledgers consistent", async () => {
    const att = await s.add("주일 예배 출석", "attendance", { drops: 2, points: 20 });
    await Promise.all([recordAttendance(s.teacher.id, s.kid, WS, "present"), recordAttendance(s.teacher.id, s.kid, WS, "absent"), recordAttendance(s.teacher.id, s.kid, WS, "present")]);
    const mark = await one<{ status: string }>(db, "select status from attendance where child_id = $1", [s.kid]);
    const approved = await db.query("select 1 from mission_completions where mission_id = $1 and status = 'approved'", [att]);
    // Whatever order they ran in, what the child holds matches the mark that stands.
    expect(approved).toHaveLength(mark?.status === "absent" ? 0 : 1);
    expect(await dropBalance(db, s.kid)).toBe(mark?.status === "absent" ? 0 : 2);
    expect(await pointBalance(db, s.kid)).toBe(mark?.status === "absent" ? 0 : 20);
  });
});

describe("what is kept of a mission the child wrote", () => {
  it("a free-text mission is credited at once and its text is stored as written, for the teacher to read", async () => {
    const m = await s.add("감사한 일 적기", "text", { drops: 1, points: 10 });
    const written = "  오늘 친구가 지우개를 빌려줘서 감사했어요.\n\n동생이랑 안 싸웠어요!  ";
    await expect(completeMissionAction(m, written)).rejects.toThrow(/REDIRECT \/missions\/done\/\d+/);
    const c = await one<{ status: string; text_content: string | null; drops_awarded: number; points_awarded: number; reviewed_by: number | null }>(
      db,
      "select status, text_content, drops_awarded, points_awarded, reviewed_by from mission_completions where mission_id = $1",
      [m],
    );
    // No teacher in between: approved and paid straight away, and the words are exactly the child's.
    expect(c).toEqual({ status: "approved", text_content: written, drops_awarded: 1, points_awarded: 10, reviewed_by: null });
    expect(await dropBalance(db, s.kid)).toBe(1);
    expect(await pointBalance(db, s.kid)).toBe(10);
    expect(await pendingCompletions(s.teacher)).toEqual([]);
  });

  it("an empty text is refused, and a very long one is cut at 2000 characters", async () => {
    const m = await s.add("감사한 일 적기", "text");
    expect(await completeMissionAction(m, "   \n ")).toEqual({ ok: false, message: "한 글자 이상 적어 주세요" });
    expect(await completeMissionAction(m)).toEqual({ ok: false, message: "한 글자 이상 적어 주세요" });
    expect(await db.query("select 1 from mission_completions")).toEqual([]);
    await expect(completeMissionAction(m, "가".repeat(2500))).rejects.toThrow(/REDIRECT/);
    expect(await one(db, "select length(text_content)::int as n from mission_completions where mission_id = $1", [m])).toEqual({ n: 2000 });
  });

  it("a self-check mission stores no text, and neither does a verse (the verse itself is the text)", async () => {
    const self = await s.add("기도", "self");
    const verse = await s.add("말씀 쓰기", "verse", { verse: "빛이 있으라" });
    await expect(completeMissionAction(self, "브라우저가 보낸 글")).rejects.toThrow(/REDIRECT/);
    // The general action no longer finishes a verse mission; the verse action checks the writing on the server.
    expect(await completeMissionAction(verse, "빛이 있으라")).toEqual({ ok: false, message: "지금은 할 수 없는 미션이에요" });
    expect(await verseAction(verse, 0, "빛이 있어라")).toEqual({ ok: false, message: "여기부터 달라요. 다시 확인해 볼까요?", at: 4, done: 0 });
    await expect(verseAction(verse, 0, "빛이 있으라")).rejects.toThrow(/REDIRECT \/missions\/done\/\d+/);
    expect(await db.query("select text_content from mission_completions order by id")).toEqual([{ text_content: null }, { text_content: null }]);
    expect(await verseAction(verse, 0, "빛이 있으라")).toEqual({ ok: false, message: "이미 한 미션이에요" });
  });
});
