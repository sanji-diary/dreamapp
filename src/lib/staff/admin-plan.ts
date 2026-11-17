import "server-only";
import { db, one } from "@/lib/db";
import { isOpenInWeek, ROTATING_MAX, rotatingPerWeek, rotationPlan } from "@/lib/plan";
import { addDays, todayKst, weekEnd, weekLabel, weekStart } from "@/lib/time";
import type { Mission, Staff, Verse } from "@/lib/types";
import { parseVerses, validateVerses, VERSE_REF_MAX } from "@/lib/verse";
import { audit } from "./access";
import { deny, fail, isDate, type Result } from "./util";

/**
 * The admin's side of the mission plan (src/lib/plan.ts): the rotating missions of a week,
 * the order of the pool, the verses of "이번 주 말씀 쓰기" week by week, and the four fixed missions
 * every week starts with. Admin role only; every function checks it.
 *
 * `today` in the options exists for tests; screens leave it out.
 */

const WEEKS_AHEAD = 52;

interface Clock {
  today?: string;
}

/** The Sunday of a week given as any of its days, or null when it is not a date. */
function sundayOf(week: unknown): string | null {
  return isDate(week) ? weekStart(week) : null;
}

/* ---------- a week's plan ---------- */

export interface PoolMission extends Mission {
  /** Sunday of the most recent week before the one shown in which this mission was on; null when never. */
  last_used: string | null;
}

export interface WeekPlan {
  /** The week's Sunday. */
  week: string;
  /** '11월 3주차' */
  label: string;
  current: boolean;
  /** This week or a later one (within a year): its rotating missions can be chosen by hand. */
  editable: boolean;
  /** The setting: how many rotating missions are picked automatically. */
  perWeek: number;
  /** Active fixed missions, on every week. */
  fixed: Mission[];
  /** The week's rotating missions in plan order (only ones still active and in the pool). */
  rotating: Mission[];
  /** Chosen by an admin for this week. */
  manual: boolean;
  /** False: `rotating` is only what would be picked today (a week that has not begun), or empty (a past week nothing was kept for). */
  stored: boolean;
  /** Every rotating mission in pool order, switched-off ones included. */
  pool: PoolMission[];
  /** Active dated missions with at least one day in the week. */
  dated: Mission[];
}

/** Everything the plan screen shows for one week. Looking at the current week keeps its automatic pick, as a child's visit would. */
export async function weekPlan(staff: Staff, week: string = weekStart(), opts: Clock = {}): Promise<WeekPlan | null> {
  if (staff.role !== "admin") return null;
  const ws = sundayOf(week);
  if (!ws) return null;
  const today = opts.today ?? todayKst();
  const thisWeek = weekStart(today);
  const [rotation, perWeek, all, used] = await Promise.all([
    rotationPlan(db, ws, today),
    rotatingPerWeek(db),
    db.query<Mission>("select * from missions order by id"),
    db.query<{ id: number; last_used: string }>(
      "select u.id, max(r.week_start) as last_used from rotation_weeks r, unnest(r.mission_ids) as u(id) where r.week_start < $1 group by u.id",
      [ws],
    ),
  ]);
  const lastUsed = new Map(used.map((u) => [u.id, u.last_used]));
  const pool = all.filter((m) => m.mode === "pool").sort((a, b) => a.pool_order - b.pool_order || a.id - b.id);
  const rotating = rotation.ids.map((id) => pool.find((m) => m.id === id && m.active)).filter((m): m is Mission => m !== undefined);
  return {
    week: ws,
    label: weekLabel(ws),
    current: ws === thisWeek,
    editable: ws >= thisWeek && ws <= addDays(thisWeek, 7 * WEEKS_AHEAD),
    perWeek,
    fixed: all.filter((m) => m.mode === "fixed" && m.active),
    rotating,
    manual: rotation.manual,
    stored: rotation.stored,
    pool: pool.map((m) => ({ ...m, last_used: lastUsed.get(m.id) ?? null })),
    dated: all.filter((m) => m.mode === "dated" && isOpenInWeek(m, ws, [])).sort((a, b) => Number(b.is_challenge) - Number(a.is_challenge) || a.id - b.id),
  };
}

/** Checks that a week may still be planned: a real date, this week or later, at most a year ahead. */
function plannable(week: unknown, today: string): Result<{ ws: string }> {
  const ws = sundayOf(week);
  if (!ws) return fail("날짜가 올바르지 않아요");
  const thisWeek = weekStart(today);
  if (ws < thisWeek) return fail("지난 주는 바꿀 수 없어요");
  if (ws > addDays(thisWeek, 7 * WEEKS_AHEAD)) return fail("1년 뒤까지만 미리 정할 수 있어요");
  return { ok: true, ws };
}

/**
 * Chooses a week's rotating missions by hand, in the order given (an empty list means none that week).
 * Only this week or a later one; every id must be an active rotating mission; at most ROTATING_MAX of them.
 */
export async function setWeekRotation(staff: Staff, week: string, missionIds: number[], opts: Clock = {}): Promise<Result> {
  if (staff.role !== "admin") return deny;
  const w = plannable(week, opts.today ?? todayKst());
  if (!w.ok) return w;
  if (!Array.isArray(missionIds) || !missionIds.every((id) => Number.isInteger(id))) return fail("미션을 다시 골라 주세요");
  const ids = [...new Set(missionIds)];
  if (ids.length > ROTATING_MAX) return fail(`돌아가는 미션은 한 주에 ${ROTATING_MAX}개까지 고를 수 있어요`);
  if (ids.length > 0) {
    const ok = await db.query<{ id: number }>("select id from missions where id = any($1::int[]) and active and mode = 'pool'", [ids]);
    if (ok.length !== ids.length) return fail("지금 쓸 수 있는 돌아가는 미션만 고를 수 있어요");
  }
  await db.query(
    `insert into rotation_weeks (week_start, mission_ids, manual, updated_by) values ($1, $2::int[], true, $3)
     on conflict (week_start) do update set mission_ids = excluded.mission_ids, manual = true, updated_by = excluded.updated_by, updated_at = now()`,
    [w.ws, ids, staff.id],
  );
  await audit(db, staff.id, "rotation_set", "rotation_week", null, { week: w.ws, mission_ids: ids });
  return { ok: true };
}

/**
 * Back to automatic for a week (this week or later): the hand-made or kept choice is dropped.
 * This week is then picked again the next time anyone looks; a later week shows a preview until it begins.
 */
export async function resetWeekRotation(staff: Staff, week: string, opts: Clock = {}): Promise<Result> {
  if (staff.role !== "admin") return deny;
  const w = plannable(week, opts.today ?? todayKst());
  if (!w.ok) return w;
  await db.query("delete from rotation_weeks where week_start = $1", [w.ws]);
  await audit(db, staff.id, "rotation_reset", "rotation_week", null, { week: w.ws });
  return { ok: true };
}

/**
 * Sets the order of the rotating pool. The missions listed come first in the order given;
 * rotating missions left out keep their order among themselves after them.
 */
export async function setPoolOrder(staff: Staff, missionIds: number[]): Promise<Result> {
  if (staff.role !== "admin") return deny;
  if (!Array.isArray(missionIds) || !missionIds.every((id) => Number.isInteger(id))) return fail("미션을 다시 골라 주세요");
  const ids = [...new Set(missionIds)];
  return db.tx(async (q) => {
    const pool = await q.query<{ id: number }>("select id from missions where mode = 'pool' order by pool_order, id for update");
    const known = new Set(pool.map((m) => m.id));
    if (!ids.every((id) => known.has(id))) return fail("돌아가는 미션만 순서를 바꿀 수 있어요");
    const order = [...ids, ...pool.map((m) => m.id).filter((id) => !ids.includes(id))];
    for (let i = 0; i < order.length; i++) await q.query("update missions set pool_order = $2 where id = $1", [order[i], i + 1]);
    await audit(q, staff.id, "pool_order", "mission", null, { order });
    return { ok: true } as const;
  });
}

/* ---------- the verses of a fixed verse mission, week by week ---------- */

async function fixedVerseMission(missionId: number): Promise<Mission | null> {
  if (!Number.isInteger(missionId)) return null;
  return one<Mission>(db, "select * from missions where id = $1 and kind = 'verse' and mode = 'fixed'", [missionId]);
}

export interface WeekVerses {
  /** The week's Sunday. */
  week: string;
  label: string;
  current: boolean;
  /** e.g. "요한복음 3:16-17" */
  ref: string | null;
  /** Empty when nothing has been entered for the week: children do not see the mission that week. */
  verses: Verse[];
}

/** One week's verses of a fixed verse mission. Null when the caller is not an admin or the mission is not one of those. */
export async function getWeekVerses(staff: Staff, missionId: number, week: string = weekStart(), opts: Clock = {}): Promise<WeekVerses | null> {
  if (staff.role !== "admin") return null;
  const ws = sundayOf(week);
  if (!ws || !(await fixedVerseMission(missionId))) return null;
  const row = await one<{ verse_ref: string | null; verses: unknown }>(db, "select verse_ref, verses from mission_weeks where mission_id = $1 and week_start = $2", [missionId, ws]);
  return { week: ws, label: weekLabel(ws), current: ws === weekStart(opts.today ?? todayKst()), ref: row?.verse_ref ?? null, verses: parseVerses(row?.verses) };
}

/**
 * Saves one week's verses of a fixed verse mission (this week or later, so they can be entered ahead).
 * 1 to 10 verses, each with text of at most 300 characters; the reference at most 40.
 * Changing this week's verses after a child has started keeps their place only if the verses already written are unchanged.
 */
export async function saveWeekVerses(staff: Staff, missionId: number, week: string, input: { ref: string | null; verses: Verse[] }, opts: Clock = {}): Promise<Result> {
  if (staff.role !== "admin") return deny;
  if (!(await fixedVerseMission(missionId))) return fail("매주 말씀이 바뀌는 미션이 아니에요");
  const w = plannable(week, opts.today ?? todayKst());
  if (!w.ok) return w;
  const ref = typeof input?.ref === "string" ? input.ref.trim() : "";
  if (ref.length > VERSE_REF_MAX) return fail(`말씀 주소는 ${VERSE_REF_MAX}자까지 쓸 수 있어요`);
  const checked = validateVerses(input?.verses);
  if (!checked.ok) return fail(checked.error);
  await db.query(
    `insert into mission_weeks (mission_id, week_start, verse_ref, verses, updated_by) values ($1,$2,$3,$4::jsonb,$5)
     on conflict (mission_id, week_start) do update set verse_ref = excluded.verse_ref, verses = excluded.verses, updated_by = excluded.updated_by, updated_at = now()`,
    [missionId, w.ws, ref === "" ? null : ref, JSON.stringify(checked.verses), staff.id],
  );
  return { ok: true };
}

/** Removes one week's verses (this week or later). Children do not see the mission in a week without verses. */
export async function clearWeekVerses(staff: Staff, missionId: number, week: string, opts: Clock = {}): Promise<Result> {
  if (staff.role !== "admin") return deny;
  if (!(await fixedVerseMission(missionId))) return fail("매주 말씀이 바뀌는 미션이 아니에요");
  const w = plannable(week, opts.today ?? todayKst());
  if (!w.ok) return w;
  await db.query("delete from mission_weeks where mission_id = $1 and week_start = $2", [missionId, w.ws]);
  return { ok: true };
}

export interface VerseWeek {
  week: string;
  label: string;
  current: boolean;
  /** Verses entered for the week; 0 means children will not see the mission that week. */
  count: number;
  ref: string | null;
}

/** This week and the next few (8 by default, 26 at most) with whether each has its verses. */
export async function verseWeeks(staff: Staff, missionId: number, opts: Clock & { weeks?: number } = {}): Promise<VerseWeek[] | null> {
  if (staff.role !== "admin" || !(await fixedVerseMission(missionId))) return null;
  const thisWeek = weekStart(opts.today ?? todayKst());
  const n = Math.min(26, Math.max(1, Math.trunc(opts.weeks ?? 8) || 8));
  const rows = await db.query<{ week_start: string; verse_ref: string | null; verses: unknown }>(
    "select week_start, verse_ref, verses from mission_weeks where mission_id = $1 and week_start >= $2 and week_start <= $3",
    [missionId, thisWeek, addDays(thisWeek, 7 * (n - 1))],
  );
  const byWeek = new Map(rows.map((r) => [r.week_start, r]));
  return Array.from({ length: n }, (_, i) => {
    const week = addDays(thisWeek, 7 * i);
    const row = byWeek.get(week);
    return { week, label: weekLabel(week), current: i === 0, count: parseVerses(row?.verses).length, ref: row?.verse_ref ?? null };
  });
}

/* ---------- the four fixed missions ---------- */

/** What every week starts with. The daily mission gives points only (no drops), with no weekly limit. */
export const DEFAULT_FIXED_MISSIONS = [
  { title: "주일 예배 출석", description: "선생님이 출석을 확인해요", kind: "attendance", icon: "stamp", drops: 2, points: 20, repeat: "weekly" },
  { title: "이번 주 말씀 쓰기", description: "이번 주 말씀을 따라 써요", kind: "verse", icon: "bible", drops: 2, points: 15, repeat: "weekly" },
  { title: "가정예배 드리기", description: "예배 사진 한 장 올리기", kind: "photo", icon: "house", drops: 3, points: 30, repeat: "weekly" },
  { title: "오늘의 말씀 읽기", description: "오늘 말씀을 읽고 눌러요", kind: "self", icon: "bible", drops: 0, points: 2, repeat: "daily" },
] as const;

/**
 * Creates the four fixed missions. Does nothing (created: 0) when a fixed mission already exists,
 * switched off or not, so pressing it twice never doubles them. The verse mission stays hidden
 * from children until verses are entered for the week (saveWeekVerses).
 */
export async function createDefaultFixedMissions(staff: Staff, opts: Clock = {}): Promise<Result<{ created: number; ids: number[] }>> {
  if (staff.role !== "admin") return deny;
  const today = opts.today ?? todayKst();
  return db.tx(async (q) => {
    // One at a time: two admins pressing together must not both find "none yet".
    await q.query("select pg_advisory_xact_lock(727275)");
    if (await one(q, "select 1 as x from missions where mode = 'fixed' limit 1")) return { ok: true, created: 0, ids: [] } as const;
    const ids: number[] = [];
    for (const m of DEFAULT_FIXED_MISSIONS) {
      // The dates of a fixed mission are not used; they are filled in because the columns need a value.
      const rows = await q.query<{ id: number }>(
        `insert into missions (title, description, kind, icon, points, drops, repeat, weekly_limit, starts_on, ends_on, mode, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,null,$8,$9,'fixed',$10) returning id`,
        [m.title, m.description, m.kind, m.icon, m.points, m.drops, m.repeat, weekStart(today), weekEnd(today), staff.id],
      );
      ids.push(rows[0].id);
    }
    await audit(q, staff.id, "fixed_missions_create", "mission", null, { ids });
    return { ok: true, created: ids.length, ids } as const;
  });
}

/** How many rotating missions a week gets automatically (0 to ROTATING_MAX). Weeks already picked keep their pick. */
export async function setRotatingPerWeek(staff: Staff, n: number): Promise<Result> {
  if (staff.role !== "admin") return deny;
  if (!Number.isInteger(n) || n < 0 || n > ROTATING_MAX) return fail(`돌아가는 미션 수는 0에서 ${ROTATING_MAX} 사이로 적어 주세요`);
  await db.query("insert into settings (key, value) values ('rotating_per_week', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(n)]);
  await audit(db, staff.id, "settings_update", "settings", null, { rotating_per_week: n });
  return { ok: true };
}

/** Re-exported for forms that show the limit. */
export { ROTATING_MAX };
