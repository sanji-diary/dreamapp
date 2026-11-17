import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { db, one, resetDbForTests } from "@/lib/db";
import { completeMission, dropBalance, getSettings, missionsForChild, pointBalance, weekDropsEarned } from "@/lib/game";
import { listHeadline, missionSubLine, pillLabel, pillShowsPoints, rewardButton, rewardPill } from "@/lib/kid/mission-text";
import { scanQr } from "@/lib/kid/qr";
import { submitVerse } from "@/lib/kid/verse";
import { isOpenInWeek, isOpenOn, openMissions, pickRotation, rotationFor, rotationPlan } from "@/lib/plan";
import { defaultMissionInput, duplicateToNextWeek, getMission, listMissions, saveMission, weeklyDropCheck } from "@/lib/staff/admin-missions";
import {
  clearWeekVerses,
  createDefaultFixedMissions,
  getWeekVerses,
  resetWeekRotation,
  saveWeekVerses,
  setPoolOrder,
  setRotatingPerWeek,
  setWeekRotation,
  verseWeeks,
  weekPlan,
} from "@/lib/staff/admin-plan";
import { addDays, todayKst, weekStart } from "@/lib/time";
import type { Staff, Verse } from "@/lib/types";

/**
 * The mission plan: fixed, rotating and dated missions, the weekly rotation, verses in several
 * parts and the fixed missions every week starts with.
 *
 * The rotation asks what "this week" is, so these tests name it: W0 is the week we are in (taken
 * from the real clock), and the weeks around it are counted from there.
 */
const TODAY = todayKst();
const W0 = weekStart(TODAY);
const W1 = addDays(W0, 7);
const W2 = addDays(W0, 14);
const PAST = addDays(W0, -7);

const PS23: Verse[] = [
  { n: "1", text: "여호와는 나의 목자시니 내게 부족함이 없으리로다" },
  { n: "2", text: "그가 나를 푸른 풀밭에 누이시며 쉴 만한 물 가로 인도하시는도다" },
  { n: "3", text: "내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다" },
];

async function setup() {
  resetDbForTests();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade) values ('5학년 2반', 5), ('6학년 1반', 6) returning id");
  const st = await db.query<{ id: number }>("insert into staff (name, role) values ('관리자','admin'), ('담임','homeroom') returning id");
  const kid = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('아이', $1, 't1') returning id", [cls[0].id]))[0].id;
  const admin: Staff = { id: st[0].id, name: "관리자", role: "admin", can_attendance: true, can_visits: true, can_approve: true, can_view_all: true, can_read_pastor_worries: true, active: true, class_ids: [] };
  const teacher: Staff = { ...admin, id: st[1].id, name: "담임", role: "homeroom", can_view_all: false, can_read_pastor_worries: false, class_ids: [cls[0].id] };
  /** A mission; `mode` decides when it is on. Dated ones run through W0 unless other dates are given. */
  const add = async (
    title: string,
    mode: "dated" | "fixed" | "pool",
    o: { kind?: string; drops?: number; points?: number; repeat?: string; starts?: string; ends?: string; order?: number; challenge?: boolean; code?: string; verses?: Verse[]; verseText?: string; active?: boolean } = {},
  ) => {
    const r = await db.query<{ id: number }>(
      `insert into missions (title, kind, drops, points, repeat, starts_on, ends_on, mode, pool_order, is_challenge, qr_code, verses, verse_text, active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) returning id`,
      [title, o.kind ?? "self", o.drops ?? 1, o.points ?? 5, o.repeat ?? "weekly", o.starts ?? W0, o.ends ?? addDays(W0, 6), mode, o.order ?? 0, o.challenge ?? false, o.code ?? null, o.verses ? JSON.stringify(o.verses) : null, o.verseText ?? null, o.active ?? true],
    );
    return r[0].id;
  };
  const titles = async (date: string) => (await missionsForChild(db, kid, date)).map((m) => m.title);
  return { classId: cls[0].id, admin, teacher, kid, add, titles };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

describe("three ways a mission is scheduled", () => {
  it("a dated mission is on between its dates, a fixed one every week whatever its dates say", async () => {
    await s.add("이번 주만", "dated");
    await s.add("지난주만", "dated", { starts: PAST, ends: addDays(PAST, 6) });
    // The dates of a fixed mission lie in the past on purpose: they do not matter.
    await s.add("매주", "fixed", { starts: addDays(W0, -70), ends: addDays(W0, -64) });
    expect(await s.titles(TODAY)).toEqual(["매주", "이번 주만"]);
    expect(await s.titles(addDays(PAST, 3))).toEqual(["매주", "지난주만"]);
    expect(await s.titles(addDays(W0, 7 * 30))).toEqual(["매주"]);
    // The first and the last day of a dated mission both count.
    expect(await s.titles(W0)).toContain("이번 주만");
    expect(await s.titles(addDays(W0, 6))).toContain("이번 주만");
    expect(await s.titles(addDays(W0, 7))).not.toContain("이번 주만");
  });

  it("active = false switches off a mission of any kind", async () => {
    const fixed = await s.add("매주", "fixed");
    const pool = await s.add("돌아가는", "pool");
    await s.add("이번 주만", "dated");
    expect(await s.titles(TODAY)).toEqual(["매주", "돌아가는", "이번 주만"]);
    await db.query("update missions set active = false where id = any($1::int[])", [[fixed, pool]]);
    expect(await s.titles(TODAY)).toEqual(["이번 주만"]);
    expect(await completeMission(s.kid, fixed, { date: TODAY })).toEqual({ ok: false, reason: "not_found" });
  });

  it("a rotating mission is on only in the weeks whose plan lists it, whatever its dates say", async () => {
    const a = await s.add("가", "pool", { order: 1, starts: PAST, ends: PAST });
    const b = await s.add("나", "pool", { order: 2 });
    await db.query("insert into rotation_weeks (week_start, mission_ids, manual) values ($1, $2::int[], true), ($3, $4::int[], true)", [W0, [a], W1, [b]]);
    expect(await s.titles(TODAY)).toEqual(["가"]);
    expect(await s.titles(addDays(W0, 6))).toEqual(["가"]);
    expect(await s.titles(W1)).toEqual(["나"]);
    // A past week nobody planned had no rotating missions, and looking at it makes no row.
    expect(await s.titles(addDays(PAST, 2))).toEqual([]);
    expect(await db.query("select week_start from rotation_weeks order by week_start")).toEqual([{ week_start: W0 }, { week_start: W1 }]);
    // Not on this week: it cannot be completed, even with its id.
    expect(await completeMission(s.kid, b, { date: TODAY })).toEqual({ ok: false, reason: "not_found" });
    expect(await completeMission(s.kid, a, { date: TODAY })).toMatchObject({ ok: true, drops: 1 });
  });

  it("the helpers that decide it: isOpenOn and isOpenInWeek", () => {
    const base = { id: 7, active: true, starts_on: "2027-01-06", ends_on: "2027-01-12" };
    expect(isOpenOn({ ...base, mode: "dated" }, "2027-01-05", [])).toBe(false);
    expect(isOpenOn({ ...base, mode: "dated" }, "2027-01-06", [])).toBe(true);
    expect(isOpenOn({ ...base, mode: "dated" }, "2027-01-12", [])).toBe(true);
    expect(isOpenOn({ ...base, mode: "dated" }, "2027-01-13", [])).toBe(false);
    expect(isOpenOn({ ...base, mode: "fixed" }, "2030-05-05", [])).toBe(true);
    expect(isOpenOn({ ...base, mode: "pool" }, "2027-01-06", [])).toBe(false);
    expect(isOpenOn({ ...base, mode: "pool" }, "2030-05-05", [3, 7])).toBe(true);
    for (const mode of ["dated", "fixed", "pool"] as const) expect(isOpenOn({ ...base, mode, active: false }, "2027-01-06", [7])).toBe(false);
    // A dated mission that starts on a Wednesday belongs to that week (Sunday the 3rd) and to the next.
    expect(isOpenInWeek({ ...base, mode: "dated" }, "2027-01-03", [])).toBe(true);
    expect(isOpenInWeek({ ...base, mode: "dated" }, "2027-01-10", [])).toBe(true);
    expect(isOpenInWeek({ ...base, mode: "dated" }, "2026-12-27", [])).toBe(false);
    expect(isOpenInWeek({ ...base, mode: "dated" }, "2027-01-17", [])).toBe(false);
  });

  it("the children's list comes fixed first, then rotating in plan order, then dated (the week's challenge first)", async () => {
    await s.add("날짜 미션", "dated");
    const p1 = await s.add("돌아가는 1", "pool", { order: 1 });
    await s.add("고정 1", "fixed");
    await s.add("이번 주 도전", "dated", { challenge: true });
    const p2 = await s.add("돌아가는 2", "pool", { order: 2 });
    await s.add("고정 2", "fixed");
    expect((await setWeekRotation(s.admin, W0, [p2, p1])).ok).toBe(true);
    expect(await s.titles(TODAY)).toEqual(["고정 1", "고정 2", "돌아가는 2", "돌아가는 1", "이번 주 도전", "날짜 미션"]);
    expect((await openMissions(db, TODAY)).map((m) => m.mode)).toEqual(["fixed", "fixed", "pool", "pool", "dated", "dated"]);
  });

  it("a QR scan follows the same rule: a fixed QR mission works outside its dates, a resting rotating one is closed", async () => {
    await s.add("고정 QR", "fixed", { kind: "qr", code: "fixed-qr-001", starts: addDays(W0, -70), ends: addDays(W0, -64) });
    const resting = await s.add("쉬는 QR", "pool", { kind: "qr", code: "pool-qr-0001" });
    const on = await s.add("이번 주 QR", "pool", { kind: "qr", code: "pool-qr-0002" });
    await setWeekRotation(s.admin, W0, [on]);
    expect(await scanQr(s.kid, "fixed-qr-001", TODAY)).toMatchObject({ ok: true, kind: "qr" });
    expect(await scanQr(s.kid, "pool-qr-0001", TODAY)).toEqual({ ok: false, reason: "closed" });
    expect(await scanQr(s.kid, "pool-qr-0002", TODAY)).toMatchObject({ ok: true, kind: "qr" });
    await setWeekRotation(s.admin, W0, [resting]);
    expect(await scanQr(s.kid, "pool-qr-0001", TODAY)).toMatchObject({ ok: true });
  });

  it("the weekly drop check and the admin's lists count fixed, this week's rotating and dated missions", async () => {
    await s.add("출석", "fixed", { drops: 2 });
    await s.add("말씀 읽기", "fixed", { drops: 0, points: 2, repeat: "daily" });
    const p1 = await s.add("돌아가는 1", "pool", { drops: 3, order: 1 });
    const p2 = await s.add("돌아가는 2", "pool", { drops: 5, order: 2 });
    await s.add("이번 주", "dated", { drops: 4 });
    const next = await s.add("다음 주", "dated", { drops: 6, starts: W1, ends: addDays(W1, 6) });
    const old = await s.add("지난주", "dated", { drops: 1, starts: PAST, ends: addDays(PAST, 6) });
    await setWeekRotation(s.admin, W0, [p1]);
    await setWeekRotation(s.admin, W1, [p2]);
    // W0: 2 + 0 + 3 + 4. W1: 2 + 0 + 5 + 6.
    expect((await weeklyDropCheck(s.admin, W0))?.classes).toEqual([{ name: "5학년 2반", total: 9 }, { name: "6학년 1반", total: 9 }]);
    expect((await weeklyDropCheck(s.admin, W1))?.classes).toEqual([{ name: "5학년 2반", total: 13 }, { name: "6학년 1반", total: 13 }]);
    expect(await weeklyDropCheck(s.admin, W1)).toMatchObject({ over: true });

    const lists = await listMissions(s.admin);
    expect(lists?.current.map((m) => m.title).sort()).toEqual(["돌아가는 1", "말씀 읽기", "이번 주", "출석"]);
    // Waiting their turn: the dated mission that has not begun and the rotating mission resting this week.
    expect(lists?.upcoming.map((m) => m.id).sort()).toEqual([p2, next].sort());
    expect(lists?.past.map((m) => m.id)).toEqual([old]);
  });
});

describe("the rotation plan", () => {
  const pool = async (n: number) => {
    const ids: number[] = [];
    for (let i = 1; i <= n; i++) ids.push(await s.add("돌아가는 " + i, "pool", { order: i }));
    return ids;
  };

  it("this week without a plan is picked automatically and the pick is kept", async () => {
    const [p1, p2, p3, p4] = await pool(4);
    expect((await getSettings()).rotatingPerWeek).toBe(3);
    expect(await rotationFor(db, W0)).toEqual([p1, p2, p3]);
    expect(await db.query("select week_start, mission_ids, manual from rotation_weeks")).toEqual([{ week_start: W0, mission_ids: [p1, p2, p3], manual: false }]);
    // Kept: a mission added to the front of the pool, or one switched off, does not reshuffle the week.
    await s.add("새로 온 미션", "pool", { order: 0 });
    expect(await rotationFor(db, W0)).toEqual([p1, p2, p3]);
    expect(await s.titles(TODAY)).toEqual(["돌아가는 1", "돌아가는 2", "돌아가는 3"]);
    // A stored mission that is switched off simply stops showing; the others stay.
    await db.query("update missions set active = false where id = $1", [p2]);
    expect(await s.titles(TODAY)).toEqual(["돌아가는 1", "돌아가는 3"]);
    expect(p4).toBeGreaterThan(p3);
  });

  it("picks the missions that rested longest: never used first, then pool order, then id", async () => {
    const [p1, p2, p3, p4, p5] = await pool(5);
    // Three weeks in a row, each looked at while it is the current week.
    expect(await rotationFor(db, W0, W0)).toEqual([p1, p2, p3]);
    expect(await rotationFor(db, W1, addDays(W1, 2))).toEqual([p4, p5, p1]);
    // p2 and p3 rested longest (since W0); among p1, p4, p5 (all used in W1) the pool order decides.
    expect(await rotationFor(db, W2, addDays(W2, 6))).toEqual([p2, p3, p1]);
    // Equal pool order: the lower id goes first.
    await db.query("update missions set pool_order = 9 where id = any($1::int[])", [[p4, p5]]);
    expect(await pickRotation(db, addDays(W2, 7))).toEqual([p4, p5, p1]);
    // Only weeks before the one being picked count: picking W1 again ignores W1 itself and W2.
    await db.query("delete from rotation_weeks where week_start = $1", [W1]);
    expect(await pickRotation(db, W1)).toEqual([p4, p5, p1]);
  });

  it("a later week is only previewed, an earlier week without a plan is empty; neither is stored", async () => {
    const [p1, p2, p3, p4] = await pool(4);
    expect(await rotationPlan(db, W1, TODAY)).toEqual({ ids: [p1, p2, p3], manual: false, stored: false });
    expect(await rotationPlan(db, PAST, TODAY)).toEqual({ ids: [], manual: false, stored: false });
    expect(await db.query("select 1 from rotation_weeks")).toEqual([]);
    // Once this week is picked, the preview of next week moves on.
    expect(await rotationPlan(db, W0, TODAY)).toEqual({ ids: [p1, p2, p3], manual: false, stored: true });
    expect(await rotationPlan(db, W1, TODAY)).toEqual({ ids: [p4, p1, p2], manual: false, stored: false });
    expect(await db.query("select week_start from rotation_weeks")).toEqual([{ week_start: W0 }]);
  });

  it("two requests arriving together agree on one pick", async () => {
    const [p1, p2, p3] = await pool(5);
    const [a, b, c] = await Promise.all([rotationFor(db, W0, TODAY), missionsForChild(db, s.kid, TODAY), rotationFor(db, W0, TODAY)]);
    expect(a).toEqual([p1, p2, p3]);
    expect(c).toEqual(a);
    expect(b.map((m) => m.id)).toEqual(a);
    expect(await db.query("select week_start from rotation_weeks")).toHaveLength(1);
  });

  it("follows the setting, skips switched-off missions, and keeps nothing while the pool is empty", async () => {
    expect(await rotationPlan(db, W0, TODAY)).toEqual({ ids: [], manual: false, stored: false });
    expect(await db.query("select 1 from rotation_weeks")).toEqual([]);
    // The pool is filled later in the week: it still gets its turn.
    const [p1, p2, p3, p4] = await pool(4);
    await db.query("update missions set active = false where id = $1", [p1]);
    expect(await setRotatingPerWeek(s.teacher, 2)).toMatchObject({ ok: false });
    expect(await setRotatingPerWeek(s.admin, 11)).toMatchObject({ ok: false });
    expect(await setRotatingPerWeek(s.admin, -1)).toMatchObject({ ok: false });
    expect(await setRotatingPerWeek(s.admin, 2)).toEqual({ ok: true });
    expect(await rotationFor(db, W0, TODAY)).toEqual([p2, p3]);
    // More than the pool holds: everything active is on.
    await setRotatingPerWeek(s.admin, 10);
    expect(await pickRotation(db, W1)).toEqual([p4, p2, p3]);
    await setRotatingPerWeek(s.admin, 0);
    expect(await pickRotation(db, W1)).toEqual([]);
  });
});

describe("admin: planning a week", () => {
  it("only an admin reads or changes the plan", async () => {
    const p = await s.add("돌아가는", "pool");
    expect(await weekPlan(s.teacher, W0)).toBeNull();
    expect(await setWeekRotation(s.teacher, W0, [p])).toMatchObject({ ok: false });
    expect(await resetWeekRotation(s.teacher, W0)).toMatchObject({ ok: false });
    expect(await setPoolOrder(s.teacher, [p])).toMatchObject({ ok: false });
    expect(await createDefaultFixedMissions(s.teacher)).toMatchObject({ ok: false });
    expect(await db.query("select 1 from rotation_weeks")).toEqual([]);
  });

  it("a week's rotating missions can be chosen by hand, for this week or a later one", async () => {
    const [p1, p2, p3, p4] = [await s.add("가", "pool", { order: 1 }), await s.add("나", "pool", { order: 2 }), await s.add("다", "pool", { order: 3 }), await s.add("라", "pool", { order: 4 })];
    const dated = await s.add("날짜 미션", "dated");
    const off = await s.add("내린 미션", "pool", { order: 5, active: false });
    expect(await rotationFor(db, W0, TODAY)).toEqual([p1, p2, p3]);

    // By hand: the order given is the order shown; a repeated id counts once.
    expect(await setWeekRotation(s.admin, W0, [p4, p2, p4])).toEqual({ ok: true });
    expect(await rotationPlan(db, W0, TODAY)).toEqual({ ids: [p4, p2], manual: true, stored: true });
    expect(await s.titles(TODAY)).toEqual(["라", "나", "날짜 미션"]);
    expect(await one(db, "select manual, updated_by from rotation_weeks where week_start = $1", [W0])).toEqual({ manual: true, updated_by: s.admin.id });
    // Any day of the week names the week.
    expect(await setWeekRotation(s.admin, addDays(W1, 3), [p1])).toEqual({ ok: true });
    expect(await rotationFor(db, W1, TODAY)).toEqual([p1]);
    // No rotating missions at all that week is a choice too.
    expect(await setWeekRotation(s.admin, W0, [])).toEqual({ ok: true });
    expect(await s.titles(TODAY)).toEqual(["날짜 미션"]);

    // Refused: a past week, a week too far ahead, missions that are not active rotating ones, too many.
    expect(await setWeekRotation(s.admin, PAST, [p1])).toMatchObject({ ok: false });
    expect(await setWeekRotation(s.admin, addDays(W0, 7 * 53), [p1])).toMatchObject({ ok: false });
    expect(await setWeekRotation(s.admin, "2027-13-01", [p1])).toMatchObject({ ok: false });
    expect(await setWeekRotation(s.admin, W0, [dated])).toMatchObject({ ok: false });
    expect(await setWeekRotation(s.admin, W0, [off])).toMatchObject({ ok: false });
    expect(await setWeekRotation(s.admin, W0, [p1, 99999])).toMatchObject({ ok: false });
    expect(await setWeekRotation(s.admin, W0, [1.5] as number[])).toMatchObject({ ok: false });
    const many: number[] = [];
    for (let i = 0; i < 11; i++) many.push(await s.add("많은 " + i, "pool", { order: 10 + i }));
    expect(await setWeekRotation(s.admin, W0, many)).toMatchObject({ ok: false });
    expect(await setWeekRotation(s.admin, W0, many.slice(0, 10))).toEqual({ ok: true });
    expect(await db.query("select 1 from rotation_weeks where week_start = $1", [PAST])).toEqual([]);
  });

  it("going back to automatic drops the hand-made choice", async () => {
    const [p1, p2, p3, p4] = [await s.add("가", "pool", { order: 1 }), await s.add("나", "pool", { order: 2 }), await s.add("다", "pool", { order: 3 }), await s.add("라", "pool", { order: 4 })];
    await setWeekRotation(s.admin, W0, [p4]);
    await setWeekRotation(s.admin, W1, [p4]);
    expect(await resetWeekRotation(s.admin, W0)).toEqual({ ok: true });
    // This week is picked again at the next look (and kept); the later week goes back to a preview.
    expect(await rotationPlan(db, W0, TODAY)).toEqual({ ids: [p1, p2, p3], manual: false, stored: true });
    expect(await resetWeekRotation(s.admin, W1)).toEqual({ ok: true });
    expect(await rotationPlan(db, W1, TODAY)).toEqual({ ids: [p4, p1, p2], manual: false, stored: false });
    expect(await resetWeekRotation(s.admin, PAST)).toMatchObject({ ok: false });
  });

  it("the pool order decides ties in the automatic pick and can be changed", async () => {
    const [p1, p2, p3, p4] = [await s.add("가", "pool", { order: 1 }), await s.add("나", "pool", { order: 2 }), await s.add("다", "pool", { order: 3 }), await s.add("라", "pool", { order: 4 })];
    const dated = await s.add("날짜 미션", "dated");
    expect(await pickRotation(db, W0)).toEqual([p1, p2, p3]);
    expect(await setPoolOrder(s.admin, [p4, p3, p2, p1])).toEqual({ ok: true });
    expect(await pickRotation(db, W0)).toEqual([p4, p3, p2]);
    // Missions left out keep their order after the ones listed.
    expect(await setPoolOrder(s.admin, [p1])).toEqual({ ok: true });
    expect(await db.query("select id, pool_order from missions where mode = 'pool' order by pool_order")).toEqual([
      { id: p1, pool_order: 1 },
      { id: p4, pool_order: 2 },
      { id: p3, pool_order: 3 },
      { id: p2, pool_order: 4 },
    ]);
    expect(await setPoolOrder(s.admin, [dated, p1])).toMatchObject({ ok: false });
    expect((await weekPlan(s.admin, W0))?.pool.map((m) => m.id)).toEqual([p1, p4, p3, p2]);
  });

  it("the plan screen gets the fixed list, the chosen rotating list, the whole pool and how the week was chosen", async () => {
    const fixed = await s.add("출석", "fixed", { kind: "attendance", drops: 2 });
    await s.add("내린 고정", "fixed", { active: false });
    const [p1, p2, p3] = [await s.add("가", "pool", { order: 1 }), await s.add("나", "pool", { order: 2 }), await s.add("다", "pool", { order: 3 })];
    const off = await s.add("내린 미션", "pool", { order: 4, active: false });
    const dated = await s.add("날짜 미션", "dated");
    await setRotatingPerWeek(s.admin, 2);

    // A later week before anything is stored: a preview.
    const next = await weekPlan(s.admin, W1, { today: TODAY });
    expect(next).toMatchObject({ week: W1, current: false, editable: true, perWeek: 2, manual: false, stored: false });
    expect(next?.rotating.map((m) => m.id)).toEqual([p1, p2]);
    expect(next?.dated).toEqual([]);
    expect(await db.query("select 1 from rotation_weeks")).toEqual([]);

    // This week: looking at it keeps the pick, as a child's visit would.
    const now = await weekPlan(s.admin, addDays(W0, 4), { today: TODAY });
    expect(now).toMatchObject({ week: W0, current: true, editable: true, manual: false, stored: true });
    expect(now?.fixed.map((m) => m.id)).toEqual([fixed]);
    expect(now?.rotating.map((m) => m.id)).toEqual([p1, p2]);
    expect(now?.dated.map((m) => m.id)).toEqual([dated]);
    expect(now?.pool.map((m) => [m.id, m.active, m.last_used])).toEqual([[p1, true, null], [p2, true, null], [p3, true, null], [off, false, null]]);

    // Next week now shows when each mission was last on, and what would be picked.
    await setWeekRotation(s.admin, W1, [p3, p1]);
    const planned = await weekPlan(s.admin, W1, { today: TODAY });
    expect(planned).toMatchObject({ manual: true, stored: true });
    expect(planned?.rotating.map((m) => m.id)).toEqual([p3, p1]);
    expect(planned?.pool.map((m) => m.last_used)).toEqual([W0, W0, null, null]);

    // A past week nobody planned: nothing, not editable.
    const past = await weekPlan(s.admin, PAST, { today: TODAY });
    expect(past).toMatchObject({ week: PAST, current: false, editable: false, stored: false });
    expect(past?.rotating).toEqual([]);
    expect(await weekPlan(s.admin, "nonsense")).toBeNull();
  });
});

describe("the four fixed missions", () => {
  it("are created once, with the agreed numbers; the daily reading gives points only", async () => {
    const r = await createDefaultFixedMissions(s.admin);
    expect(r).toMatchObject({ ok: true, created: 4 });
    const rows = await db.query("select title, kind, drops, points, repeat, weekly_limit, mode, active from missions order by id");
    expect(rows).toEqual([
      { title: "주일 예배 출석", kind: "attendance", drops: 2, points: 20, repeat: "weekly", weekly_limit: null, mode: "fixed", active: true },
      { title: "이번 주 말씀 쓰기", kind: "verse", drops: 2, points: 15, repeat: "weekly", weekly_limit: null, mode: "fixed", active: true },
      { title: "가정예배 드리기", kind: "photo", drops: 3, points: 30, repeat: "weekly", weekly_limit: null, mode: "fixed", active: true },
      { title: "오늘의 말씀 읽기", kind: "self", drops: 0, points: 2, repeat: "daily", weekly_limit: null, mode: "fixed", active: true },
    ]);
    // A second press, or a press after one of them was switched off, adds nothing.
    expect(await createDefaultFixedMissions(s.admin)).toMatchObject({ ok: true, created: 0 });
    await db.query("update missions set active = false");
    expect(await createDefaultFixedMissions(s.admin)).toMatchObject({ ok: true, created: 0 });
    expect(await db.query("select id from missions")).toHaveLength(4);
  });

  it("two presses at once still make four missions", async () => {
    const [a, b] = await Promise.all([createDefaultFixedMissions(s.admin), createDefaultFixedMissions(s.admin)]);
    expect([a, b].map((r) => (r.ok ? r.created : -1)).sort()).toEqual([0, 4]);
    expect(await db.query("select id from missions")).toHaveLength(4);
  });

  it("children see them every week; the verse mission waits until the week has verses", async () => {
    await createDefaultFixedMissions(s.admin);
    expect(await s.titles(TODAY)).toEqual(["주일 예배 출석", "가정예배 드리기", "오늘의 말씀 읽기"]);
    expect(await s.titles(addDays(W0, 7 * 20))).toEqual(["주일 예배 출석", "가정예배 드리기", "오늘의 말씀 읽기"]);
  });

  it("the daily reading can be done every day for 2 points, never gives a drop and never uses the weekly cap", async () => {
    const r = await createDefaultFixedMissions(s.admin);
    if (!r.ok) throw new Error(r.error);
    const reading = r.ids[3];
    for (let i = 0; i < 7; i++) {
      const day = addDays(W0, i);
      expect((await missionsForChild(db, s.kid, day)).find((m) => m.id === reading)).toMatchObject({ state: "available", drops: 0, drops_now: 0, points: 2, done_this_week: i });
      expect(await completeMission(s.kid, reading, { date: day })).toMatchObject({ ok: true, status: "approved", drops: 0, points: 2 });
      expect(await completeMission(s.kid, reading, { date: day })).toEqual({ ok: false, reason: "already_done" });
    }
    expect(await pointBalance(db, s.kid)).toBe(14);
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(await weekDropsEarned(db, s.kid, W0)).toBe(0);
    expect(await db.query("select 1 from drop_ledger")).toEqual([]);
    // The next week it starts again.
    expect((await missionsForChild(db, s.kid, W1)).find((m) => m.id === reading)).toMatchObject({ state: "available", done_this_week: 0 });
  });
});

describe("a fixed verse mission gets its verses week by week", () => {
  const verseMission = async () => {
    const r = await createDefaultFixedMissions(s.admin);
    if (!r.ok) throw new Error(r.error);
    return r.ids[1];
  };
  const forKid = async (id: number, date: string) => (await missionsForChild(db, s.kid, date)).find((m) => m.id === id);

  it("is hidden from children in a week without verses and shown in a week that has them", async () => {
    const m = await verseMission();
    expect(await forKid(m, TODAY)).toBeUndefined();
    expect(await saveWeekVerses(s.admin, m, W0, { ref: "시편 23:1-2", verses: PS23.slice(0, 2) })).toEqual({ ok: true });
    expect(await forKid(m, TODAY)).toMatchObject({ state: "available", verse_ref: "시편 23:1-2", verse_list: PS23.slice(0, 2), verse_done: 0, drops: 2, points: 15 });
    // Next week has none yet; the week after is entered ahead with other verses.
    expect(await forKid(m, W1)).toBeUndefined();
    expect(await saveWeekVerses(s.admin, m, addDays(W2, 5), { ref: " 요한복음 3:16 ", verses: [{ n: "16", text: "하나님이 세상을 이처럼 사랑하사" }] })).toEqual({ ok: true });
    expect(await forKid(m, W2)).toMatchObject({ verse_ref: "요한복음 3:16", verse_list: [{ n: "16", text: "하나님이 세상을 이처럼 사랑하사" }] });
    expect((await forKid(m, TODAY))?.verse_ref).toBe("시편 23:1-2");
    // Taking the verses away hides the mission again.
    expect(await clearWeekVerses(s.admin, m, W0)).toEqual({ ok: true });
    expect(await forKid(m, TODAY)).toBeUndefined();
    expect(await submitVerse(s.kid, m, 0, PS23[0].text, TODAY)).toEqual({ ok: false, reason: "not_found" });
  });

  it("saving is validated: 1 to 10 verses, none empty, 300 characters each, a reference of at most 40", async () => {
    const m = await verseMission();
    const single = [{ n: "1", text: "여호와는 나의 목자시니" }];
    expect(await saveWeekVerses(s.teacher, m, W0, { ref: null, verses: single })).toMatchObject({ ok: false });
    expect(await saveWeekVerses(s.admin, m, W0, { ref: null, verses: [] })).toMatchObject({ ok: false });
    expect(await saveWeekVerses(s.admin, m, W0, { ref: null, verses: [{ n: "1", text: "   " }] })).toMatchObject({ ok: false });
    expect(await saveWeekVerses(s.admin, m, W0, { ref: null, verses: [...single, { n: "2", text: "" }] })).toMatchObject({ ok: false });
    expect(await saveWeekVerses(s.admin, m, W0, { ref: null, verses: [{ n: null, text: "가".repeat(301) }] })).toMatchObject({ ok: false });
    expect(await saveWeekVerses(s.admin, m, W0, { ref: null, verses: Array.from({ length: 11 }, () => single[0]) })).toMatchObject({ ok: false });
    expect(await saveWeekVerses(s.admin, m, W0, { ref: "가".repeat(41), verses: single })).toMatchObject({ ok: false });
    expect(await saveWeekVerses(s.admin, m, PAST, { ref: null, verses: single })).toMatchObject({ ok: false });
    expect(await saveWeekVerses(s.admin, m, "어제", { ref: null, verses: single })).toMatchObject({ ok: false });
    expect(await db.query("select 1 from mission_weeks")).toEqual([]);

    expect(await saveWeekVerses(s.admin, m, W0, { ref: "가".repeat(40), verses: Array.from({ length: 10 }, (_, i) => ({ n: String(i + 1), text: "가".repeat(300) })) })).toEqual({ ok: true });
    // Saving again replaces the week's verses; the text is stored tidied.
    expect(await saveWeekVerses(s.admin, m, W0, { ref: "", verses: [{ n: "1", text: "  여호와는   나의\n목자시니 " }] })).toEqual({ ok: true });
    expect(await getWeekVerses(s.admin, m, W0)).toMatchObject({ week: W0, current: true, ref: null, verses: [{ n: "1", text: "여호와는 나의 목자시니" }] });
    expect(await db.query("select 1 from mission_weeks")).toHaveLength(1);

    // Only a fixed verse mission has verses by the week.
    const dated = await s.add("날짜 말씀", "dated", { kind: "verse", verseText: "빛이 있으라" });
    const attendance = (await db.query<{ id: number }>("select id from missions where kind = 'attendance'"))[0].id;
    for (const id of [dated, attendance, 99999]) {
      expect(await saveWeekVerses(s.admin, id, W0, { ref: null, verses: single })).toMatchObject({ ok: false });
      expect(await getWeekVerses(s.admin, id, W0)).toBeNull();
      expect(await verseWeeks(s.admin, id)).toBeNull();
    }
    expect(await getWeekVerses(s.teacher, m, W0)).toBeNull();
  });

  it("lists the coming weeks with whether each has its verses", async () => {
    const m = await verseMission();
    await saveWeekVerses(s.admin, m, W0, { ref: "시편 23:1-3", verses: PS23 });
    await saveWeekVerses(s.admin, m, W2, { ref: null, verses: PS23.slice(0, 1) });
    const weeks = await verseWeeks(s.admin, m, { weeks: 4, today: TODAY });
    expect(weeks?.map((w) => [w.week, w.current, w.count, w.ref])).toEqual([
      [W0, true, 3, "시편 23:1-3"],
      [W1, false, 0, null],
      [W2, false, 1, null],
      [addDays(W0, 21), false, 0, null],
    ]);
    expect(await verseWeeks(s.admin, m)).toHaveLength(8);
    expect(await verseWeeks(s.teacher, m)).toBeNull();
    expect(await getWeekVerses(s.admin, m, W1)).toMatchObject({ week: W1, current: false, ref: null, verses: [] });
  });
});

describe("writing a verse mission one verse at a time", () => {
  const fixedVerse = async (verses: Verse[] = PS23) => {
    const r = await createDefaultFixedMissions(s.admin);
    if (!r.ok) throw new Error(r.error);
    await saveWeekVerses(s.admin, r.ids[1], W0, { ref: "시편 23:1-3", verses });
    return r.ids[1];
  };
  const done = async (id: number, date = TODAY) => (await missionsForChild(db, s.kid, date)).find((m) => m.id === id)?.verse_done;

  it("each verse is checked on the server, progress is kept, and the mission is credited once after the last verse", async () => {
    const m = await fixedVerse();
    // Wrong tries cost nothing and can go on for ever; the answer says where the writing first differs.
    for (let i = 0; i < 5; i++) expect(await submitVerse(s.kid, m, 0, "여호와는 나의 목자시니 내게 부족함이 없으리라", TODAY)).toEqual({ ok: false, reason: "mismatch", at: 24, done: 0, total: 3 });
    expect(await submitVerse(s.kid, m, 0, "여호와는 나의목자시니 내게 부족함이 없으리로다", TODAY)).toMatchObject({ ok: false, reason: "mismatch", at: 7 });
    expect(await done(m)).toBe(0);
    expect(await db.query("select 1 from mission_completions")).toEqual([]);

    expect(await submitVerse(s.kid, m, 0, PS23[0].text, TODAY)).toEqual({ ok: true, finished: false, done: 1, total: 3 });
    // Leaving and coming back: the screen starts at the second verse.
    expect(await done(m)).toBe(1);
    expect(await dropBalance(db, s.kid)).toBe(0);
    // The next day of the same week it is still there.
    expect(await done(m, addDays(W0, 6))).toBe(1);
    // The second verse is compared with the second verse, not with the first again.
    expect(await submitVerse(s.kid, m, 1, PS23[0].text, TODAY)).toMatchObject({ ok: false, reason: "mismatch", done: 1 });
    expect(await submitVerse(s.kid, m, 1, PS23[1].text, TODAY)).toEqual({ ok: true, finished: false, done: 2, total: 3 });

    const end = await submitVerse(s.kid, m, 2, PS23[2].text, TODAY);
    // The mission's own numbers, however many verses there were.
    expect(end).toMatchObject({ ok: true, finished: true, drops: 2, points: 15 });
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(15);
    expect(await db.query("select status, text_content, drops_awarded, points_awarded from mission_completions")).toEqual([{ status: "approved", text_content: null, drops_awarded: 2, points_awarded: 15 }]);
    expect(await db.query("select 1 from verse_progress")).toEqual([]);

    // Done for the week: nothing more is checked or given.
    expect(await submitVerse(s.kid, m, 2, PS23[2].text, TODAY)).toEqual({ ok: false, reason: "already_done" });
    expect(await submitVerse(s.kid, m, 0, PS23[0].text, TODAY)).toEqual({ ok: false, reason: "already_done" });
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await db.query("select 1 from drop_ledger")).toHaveLength(1);
  });

  it("a second tap for a verse already written only reports where the child is", async () => {
    const m = await fixedVerse();
    const [a, b] = await Promise.all([submitVerse(s.kid, m, 0, PS23[0].text, TODAY), submitVerse(s.kid, m, 0, PS23[0].text, TODAY)]);
    expect(a).toEqual({ ok: true, finished: false, done: 1, total: 3 });
    expect(b).toEqual({ ok: true, finished: false, done: 1, total: 3 });
    // Skipping ahead is not possible either: the position is reported, nothing is compared.
    expect(await submitVerse(s.kid, m, 2, PS23[2].text, TODAY)).toEqual({ ok: true, finished: false, done: 1, total: 3 });
    expect(await done(m)).toBe(1);
  });

  it("two taps on the last verse credit the mission once", async () => {
    const m = await fixedVerse(PS23.slice(0, 1));
    const both = await Promise.all([submitVerse(s.kid, m, 0, PS23[0].text, TODAY), submitVerse(s.kid, m, 0, PS23[0].text, TODAY)]);
    expect(both.filter((r) => r.ok && r.finished)).toHaveLength(1);
    expect(both.filter((r) => !r.ok && r.reason === "already_done")).toHaveLength(1);
    expect(await dropBalance(db, s.kid)).toBe(2);
    expect(await pointBalance(db, s.kid)).toBe(15);
    expect(await db.query("select 1 from mission_completions")).toHaveLength(1);
  });

  it("the server forgives only what cannot be seen", async () => {
    const m = await fixedVerse([{ n: "1", text: "주께서 “두려워하지 말라” 하시니, 그들이 기뻐하더라." }]);
    expect(await submitVerse(s.kid, m, 0, "주께서 \"두려워하지 말라\" 하시니 그들이 기뻐하더라.", TODAY)).toMatchObject({ ok: false, reason: "mismatch", at: 18 });
    expect(await submitVerse(s.kid, m, 0, "주께서 \"두려워하지 말라\" 하시니, 그들이 기뻐하더라", TODAY)).toMatchObject({ ok: false, reason: "mismatch" });
    expect(await submitVerse(s.kid, m, 0, "주께서\"두려워하지 말라\" 하시니, 그들이 기뻐하더라.", TODAY)).toMatchObject({ ok: false, reason: "mismatch", at: 3 });
    expect(await submitVerse(s.kid, m, 0, 12345, TODAY)).toMatchObject({ ok: false, reason: "mismatch", at: 0 });
    const decomposed = "  주께서  \"두려워하지\n말라\" 하시니， 그들이 기뻐하더라． ".normalize("NFD");
    expect(await submitVerse(s.kid, m, 0, decomposed, TODAY)).toMatchObject({ ok: true, finished: true, drops: 2 });
  });

  it("calling completeMission directly does not finish a verse mission; a teacher may enter it for the child", async () => {
    const m = await fixedVerse();
    expect(await completeMission(s.kid, m, { date: TODAY })).toEqual({ ok: false, reason: "not_available" });
    expect(await completeMission(s.kid, m, { date: TODAY, text: PS23.map((v) => v.text).join(" ") })).toEqual({ ok: false, reason: "not_available" });
    expect(await submitVerse(s.kid, 99999, 0, "x", TODAY)).toEqual({ ok: false, reason: "not_found" });
    expect(await submitVerse(s.kid, m, 0.5, "x", TODAY)).toEqual({ ok: false, reason: "not_found" });
    expect(await dropBalance(db, s.kid)).toBe(0);
    expect(await completeMission(s.kid, m, { date: TODAY, byStaffId: s.teacher.id })).toMatchObject({ ok: true, status: "approved", drops: 2, points: 15 });
  });

  it("progress belongs to the week: next week starts at the first verse again", async () => {
    const m = await fixedVerse();
    await saveWeekVerses(s.admin, m, W1, { ref: "시편 23:1-3", verses: PS23 });
    await submitVerse(s.kid, m, 0, PS23[0].text, TODAY);
    await submitVerse(s.kid, m, 1, PS23[1].text, TODAY);
    expect(await done(m)).toBe(2);
    expect(await done(m, W1)).toBe(0);
    expect(await submitVerse(s.kid, m, 0, PS23[0].text, W1)).toEqual({ ok: true, finished: false, done: 1, total: 3 });
    // This week's progress is untouched by next week's.
    expect(await done(m)).toBe(2);
  });

  it("changing verses the child has already written starts them over; changing a later verse does not", async () => {
    const m = await fixedVerse();
    await submitVerse(s.kid, m, 0, PS23[0].text, TODAY);
    await submitVerse(s.kid, m, 1, PS23[1].text, TODAY);
    // A fix in the third verse (not written yet): the child stays at the third verse and writes the new text.
    await saveWeekVerses(s.admin, m, W0, { ref: "시편 23:1-3", verses: [PS23[0], PS23[1], { n: "3", text: "내 영혼을 소생시키시고" }] });
    expect(await done(m)).toBe(2);
    // A fix in the first verse: what the child wrote is no longer that verse, so they begin again.
    await saveWeekVerses(s.admin, m, W0, { ref: "시편 23:1-3", verses: [{ n: "1", text: "여호와는 나의 목자시니" }, PS23[1], PS23[2]] });
    expect(await done(m)).toBe(0);
    expect(await submitVerse(s.kid, m, 2, PS23[2].text, TODAY)).toEqual({ ok: true, finished: false, done: 0, total: 3 });
    // Fewer verses than the child had already written: begin again rather than skip.
    await submitVerse(s.kid, m, 0, "여호와는 나의 목자시니", TODAY);
    await saveWeekVerses(s.admin, m, W0, { ref: null, verses: [{ n: "1", text: "여호와는 나의 목자시니" }] });
    expect(await done(m)).toBe(0);
    expect(await submitVerse(s.kid, m, 0, "여호와는 나의 목자시니", TODAY)).toMatchObject({ ok: true, finished: true });
  });

  it("a dated or rotating verse mission carries its own verses, or the older single text", async () => {
    const many = await s.add("여러 절", "dated", { kind: "verse", drops: 2, points: 10, verses: PS23.slice(0, 2), verseText: "쓰이지 않는 옛 글" });
    const single = await s.add("한 절", "pool", { kind: "verse", drops: 1, points: 5, verseText: "  빛이 있으라\n하시니 빛이 있었고 " });
    const empty = await s.add("빈 말씀", "dated", { kind: "verse" });
    await setWeekRotation(s.admin, W0, [single]);
    const list = await missionsForChild(db, s.kid, TODAY);
    expect(list.find((m) => m.id === many)?.verse_list).toEqual(PS23.slice(0, 2));
    expect(list.find((m) => m.id === single)?.verse_list).toEqual([{ n: null, text: "빛이 있으라 하시니 빛이 있었고" }]);
    // Shown (as "getting ready"), but there is nothing to write.
    expect(list.find((m) => m.id === empty)).toMatchObject({ verse_list: null, state: "available" });
    expect(await submitVerse(s.kid, empty, 0, "", TODAY)).toEqual({ ok: false, reason: "not_found" });

    expect(await submitVerse(s.kid, single, 0, "빛이 있으라 하시니 빛이 있었고", TODAY)).toMatchObject({ ok: true, finished: true, drops: 1, points: 5 });
    expect(await submitVerse(s.kid, many, 0, PS23[0].text, TODAY)).toEqual({ ok: true, finished: false, done: 1, total: 2 });
    expect(await submitVerse(s.kid, many, 1, PS23[1].text, TODAY)).toMatchObject({ ok: true, finished: true, drops: 2, points: 10 });
    expect(await dropBalance(db, s.kid)).toBe(3);
  });
});

describe("admin: saving a mission with a mode, a pool place and verses", () => {
  const input = (over: Partial<ReturnType<typeof defaultMissionInput>>) => ({ ...defaultMissionInput(), title: "새 미션", ...over });
  const row = (id: number) => one<{ mode: string; pool_order: number; verses: unknown; verse_text: string | null }>(db, "select mode, pool_order, verses, verse_text from missions where id = $1", [id]);

  it("a new mission is dated unless told otherwise; an edit that leaves the mode out keeps it", async () => {
    const plain = await saveMission(s.admin, null, { ...input({}), mode: undefined });
    const fixed = await saveMission(s.admin, null, input({ mode: "fixed" }));
    if (!plain.ok || !fixed.ok) throw new Error();
    expect((await row(plain.id))?.mode).toBe("dated");
    expect((await row(fixed.id))?.mode).toBe("fixed");
    // The older form does not know about modes: saving through it must not turn a fixed mission into a dated one.
    expect(await saveMission(s.admin, fixed.id, { ...input({ title: "이름 바꿈" }), mode: undefined })).toMatchObject({ ok: true });
    expect((await row(fixed.id))?.mode).toBe("fixed");
    expect(await saveMission(s.admin, fixed.id, input({ mode: "dated" }))).toMatchObject({ ok: true });
    expect((await row(fixed.id))?.mode).toBe("dated");
    expect(await saveMission(s.admin, null, input({ mode: "sometimes" }))).toMatchObject({ ok: false });
  });

  it("a mission joining the pool goes to the end unless a place is given", async () => {
    const a = await saveMission(s.admin, null, input({ mode: "pool" }));
    const b = await saveMission(s.admin, null, input({ mode: "pool" }));
    const c = await saveMission(s.admin, null, input({ mode: "pool", pool_order: 0 }));
    const d = await saveMission(s.admin, null, input({}));
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error();
    expect([(await row(a.id))?.pool_order, (await row(b.id))?.pool_order, (await row(c.id))?.pool_order]).toEqual([1, 2, 0]);
    // An edit without a place keeps the place; a dated mission moved into the pool goes last.
    await saveMission(s.admin, a.id, input({ mode: "pool", title: "고침" }));
    expect((await row(a.id))?.pool_order).toBe(1);
    await saveMission(s.admin, d.id, input({ mode: "pool" }));
    expect((await row(d.id))?.pool_order).toBe(3);
    expect(await saveMission(s.admin, null, input({ mode: "pool", pool_order: -1 }))).toMatchObject({ ok: false });
    expect(await pickRotation(db, W0)).toEqual([c.id, a.id, b.id]);
  });

  it("a dated or rotating verse mission needs verses or the older single text; a fixed one needs neither", async () => {
    expect(await saveMission(s.admin, null, input({ kind: "verse" }))).toMatchObject({ ok: false });
    expect(await saveMission(s.admin, null, input({ kind: "verse", mode: "pool", verses: [] }))).toMatchObject({ ok: false });
    expect(await saveMission(s.admin, null, input({ kind: "verse", verses: [{ n: "1", text: " " }] }))).toMatchObject({ ok: false });
    expect(await saveMission(s.admin, null, input({ kind: "verse", verses: Array.from({ length: 11 }, () => PS23[0]) }))).toMatchObject({ ok: false });
    const fixed = await saveMission(s.admin, null, input({ kind: "verse", mode: "fixed" }));
    const old = await saveMission(s.admin, null, input({ kind: "verse", verse_text: "빛이 있으라", verse_ref: "창세기 1:3" }));
    const many = await saveMission(s.admin, null, input({ kind: "verse", mode: "pool", verses: PS23, verse_ref: "시편 23:1-3" }));
    if (!fixed.ok || !old.ok || !many.ok) throw new Error();
    expect(await row(old.id)).toMatchObject({ verses: null, verse_text: "빛이 있으라" });
    expect((await getMission(s.admin, many.id))?.verses).toEqual(PS23);

    // The older form sends only verse_text. Left empty, the stored verses stay; filled in, it replaces them.
    expect(await saveMission(s.admin, many.id, { ...input({ kind: "verse", mode: "pool" }), verses: undefined })).toMatchObject({ ok: true });
    expect((await getMission(s.admin, many.id))?.verses).toEqual(PS23);
    expect(await saveMission(s.admin, many.id, { ...input({ kind: "verse", mode: "pool", verse_text: "한 절로 바꿈" }), verses: undefined })).toMatchObject({ ok: true });
    expect(await row(many.id)).toMatchObject({ verses: null, verse_text: "한 절로 바꿈" });
    // Verses are not kept on a mission of another kind.
    await saveMission(s.admin, old.id, input({ kind: "verse", verses: PS23.slice(0, 1) }));
    expect((await getMission(s.admin, old.id))?.verses).toEqual(PS23.slice(0, 1));
    await saveMission(s.admin, old.id, input({ kind: "self", verses: PS23 }));
    expect(await row(old.id)).toMatchObject({ verses: null, verse_text: null });
  });

  it("a copy for next week is a dated mission with the same verses", async () => {
    const many = await saveMission(s.admin, null, input({ kind: "verse", mode: "pool", verses: PS23.slice(0, 2) }));
    if (!many.ok) throw new Error();
    const copy = await duplicateToNextWeek(s.admin, many.id);
    if (!copy.ok) throw new Error();
    expect(await getMission(s.admin, copy.id)).toMatchObject({ mode: "dated", verses: PS23.slice(0, 2), starts_on: W1 });
  });
});

describe("the words on the children's mission list", () => {
  const m = (over: Record<string, unknown> = {}) =>
    ({ state: "available", drops: 2, drops_now: 2, points: 15, repeat: "weekly", weekly_limit: null, done_this_week: 0, description: "설명", kind: "self", verse_ref: null, verse_list: null, verse_done: 0, returned: false, ...over }) as Parameters<typeof missionSubLine>[0] &
      Parameters<typeof pillLabel>[0];
  const reading = m({ drops: 0, drops_now: 0, points: 2, repeat: "daily", description: "오늘 말씀을 읽고 눌러요" });

  it("the pill shows drops, or the points of a mission that has no drops, or '포인트만' after the weekly cap", () => {
    expect(pillLabel(m())).toBe("물방울 2개");
    expect(pillLabel(m({ drops_now: 1 }))).toBe("물방울 1개");
    expect(pillLabel(reading)).toBe("2P");
    expect(pillShowsPoints(reading)).toBe(true);
    // A mission with drops whose drops are used up for the week.
    expect(pillLabel(m({ drops_now: 0 }))).toBe("포인트만");
    expect(pillShowsPoints(m({ drops_now: 0 }))).toBe(false);
    expect(pillShowsPoints(m())).toBe(false);
    expect(pillLabel(m({ drops: 0, drops_now: 0, points: 0 }))).toBe("하기");
    expect(pillLabel(m({ state: "pending" }))).toBe("확인 중");
    expect(pillLabel({ ...reading, state: "done" })).toBe("완료");
    expect(pillShowsPoints({ ...reading, state: "done" })).toBe(false);
  });

  it("the mission screen names what the child gets", () => {
    expect(rewardPill(m())).toBe("15P · 물방울 2개");
    expect(rewardPill(reading)).toBe("2P");
    expect(rewardPill(m({ drops_now: 0 }))).toBe("15P");
    expect(rewardPill(m({ drops: 0, drops_now: 0, points: 0 }))).toBe("");
    expect(rewardButton(m())).toBe("물방울 2개 받기");
    expect(rewardButton(reading)).toBe("2P 받기");
    expect(rewardButton(m({ drops: 0, drops_now: 0, points: 0 }))).toBe("완료하기");
  });

  it("a daily mission reads naturally with and without a weekly limit", () => {
    expect(missionSubLine(reading, 0)).toBe("하루 한 번 · 오늘 말씀을 읽고 눌러요");
    expect(missionSubLine({ ...reading, description: "" }, 0)).toBe("하루 한 번");
    expect(missionSubLine({ ...reading, state: "done", done_this_week: 3 }, 0)).toBe("오늘은 했어요");
    const limited = m({ repeat: "daily", weekly_limit: 3 });
    expect(missionSubLine(limited, 0)).toBe("하루 한 번 · 이번 주 3번 남음");
    expect(missionSubLine({ ...limited, state: "done", done_this_week: 1 }, 1)).toBe("오늘은 했어요 · 이번 주 2번 남음");
    expect(missionSubLine({ ...limited, state: "done", done_this_week: 3 }, 3)).toBe("이번 주에 할 만큼 다 했어요");
  });

  it("other rows say what the mission is, how far a verse is, and when a teacher sent it back", () => {
    expect(missionSubLine(m(), 0)).toBe("설명");
    expect(missionSubLine(m({ state: "done" }), 2)).toBe("설명 · 물방울 2개 받음");
    expect(missionSubLine(m({ state: "done", description: "" }), 0)).toBe("완료");
    expect(missionSubLine(m({ state: "pending" }), 0)).toBe("선생님이 확인하고 있어요");
    expect(missionSubLine(m({ kind: "photo", returned: true }), 0)).toBe("선생님이 다시 해 달라고 했어요");
    const verse = m({ kind: "verse", verse_ref: "시편 23:1-3", verse_list: PS23, description: "이번 주 말씀을 따라 써요" });
    expect(missionSubLine(verse, 0)).toBe("시편 23:1-3 따라 쓰기");
    expect(missionSubLine({ ...verse, verse_done: 1 }, 0)).toBe("시편 23:1-3 따라 쓰기 · 3절 중 1절 썼어요");
    expect(missionSubLine({ ...verse, verse_ref: null }, 0)).toBe("이번 주 말씀을 따라 써요");
    expect(missionSubLine({ ...verse, state: "done" }, 2)).toBe("시편 23:1-3 따라 쓰기 · 물방울 2개 받음");
  });

  it("the headline counts drops only", () => {
    const attendance = m({ drops: 2, drops_now: 2 });
    const photo = m({ drops: 3, drops_now: 3 });
    expect(listHeadline([attendance, photo, reading], 12, 0).title).toBe("미션하고 물방울 5개 받기");
    // What is left this week caps the total as well as each mission.
    expect(listHeadline([m({ drops: 3, drops_now: 2 }), m({ drops: 3, drops_now: 2 }), reading], 12, 10).title).toBe("미션하고 물방울 2개 받기");
    // Only the points-only mission is left: no "물방울 0개 받기".
    const left = listHeadline([{ ...attendance, state: "done" }, { ...photo, state: "pending" }, reading], 12, 2);
    expect(left.title).toBe("물방울 미션을 모두 했어요");
    expect(left.sub).toContain("물방울 2개");
    // Everything done today, with a daily mission that opens again tomorrow.
    expect(listHeadline([{ ...attendance, state: "done" }, { ...reading, state: "done", done_this_week: 2 }], 12, 2).title).toBe("오늘 할 미션을 모두 했어요");
    expect(listHeadline([{ ...attendance, state: "done" }], 12, 2).title).toBe("이번 주 미션을 모두 했어요");
    // The weekly cap is reached: said plainly, whatever is still open.
    expect(listHeadline([m({ drops_now: 0 }), reading], 12, 12).title).toBe("이번 주 물방울을 모두 받았어요");
    expect(listHeadline([], 12, 0).title).toBe("이번 주 미션을 모두 했어요");
  });
});
