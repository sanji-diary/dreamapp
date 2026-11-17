import "server-only";
import { db, one } from "@/lib/db";
import { addDays, todayKst, weekEnd, weekStart } from "@/lib/time";

/** Read-only queries for the child screens. Every function takes the signed-in child's id. */

export async function className(classId: number | null): Promise<string> {
  if (classId === null) return "";
  const r = await one<{ name: string }>(db, "select name from classes where id = $1", [classId]);
  return r?.name ?? "";
}

export async function homeroomNames(classId: number | null): Promise<string[]> {
  if (classId === null) return [];
  const rows = await db.query<{ name: string }>(
    "select s.name from staff s join staff_classes sc on sc.staff_id = s.id where sc.class_id = $1 and s.active and s.role = 'homeroom' order by s.id",
    [classId],
  );
  return rows.map((r) => r.name);
}

/** Drops already received this week per mission, for the "물방울 2개 받음" line. */
export async function weekAwards(childId: number, ws: string = weekStart()): Promise<Map<number, number>> {
  const rows = await db.query<{ mission_id: number; drops: number }>(
    "select mission_id, coalesce(sum(drops_awarded),0)::int as drops from mission_completions where child_id = $1 and week_start = $2 and status = 'approved' group by mission_id",
    [childId, ws],
  );
  return new Map(rows.map((r) => [r.mission_id, r.drops]));
}

export interface CompletionView {
  id: number;
  status: "pending" | "approved" | "rejected";
  drops_awarded: number;
  points_awarded: number;
  title: string;
  kind: string;
  /** What the mission itself gives, to tell "this mission has no drops" from "the weekly cap is reached". */
  mission_drops: number;
  mission_points: number;
}

/** One of the child's own completions, for the success screen. */
export async function completionForChild(childId: number, completionId: number): Promise<CompletionView | null> {
  if (!Number.isInteger(completionId)) return null;
  return one<CompletionView>(
    db,
    `select mc.id, mc.status, mc.drops_awarded, mc.points_awarded, m.title, m.kind, m.drops as mission_drops, m.points as mission_points
       from mission_completions mc join missions m on m.id = mc.mission_id where mc.id = $1 and mc.child_id = $2`,
    [completionId, childId],
  );
}

export async function weekPoints(childId: number, ws: string = weekStart()): Promise<number> {
  const r = await one<{ n: number }>(
    db,
    "select coalesce(sum(delta),0)::int as n from point_ledger where child_id = $1 and created_at >= ($2::date)::timestamp at time zone 'Asia/Seoul'",
    [childId, ws],
  );
  return r?.n ?? 0;
}

/**
 * Weeks in a row with a present or late mark, counting back from this week.
 * A week with no mark yet (today is before Sunday's roll call) does not break the run.
 */
export async function attendanceStreak(childId: number, today: string = todayKst()): Promise<number> {
  const rows = await db.query<{ date: string; status: string }>("select date, status from attendance where child_id = $1 and date <= $2 order by date desc limit 120", [childId, today]);
  const attended = new Set(rows.filter((r) => r.status !== "absent").map((r) => weekStart(r.date)));
  const marked = new Set(rows.map((r) => weekStart(r.date)));
  let week = weekStart(today);
  if (!marked.has(week)) week = addDays(week, -7);
  let n = 0;
  while (attended.has(week)) {
    n += 1;
    week = addDays(week, -7);
  }
  return n;
}

export async function harvestedCount(childId: number): Promise<number> {
  const r = await one<{ n: number }>(db, "select count(*)::int as n from trees where child_id = $1 and harvested_at is not null", [childId]);
  return r?.n ?? 0;
}

/** Trees the whole class has grown. A shared total, never a ranking of children. */
export async function classForestCount(classId: number | null): Promise<number> {
  if (classId === null) return 0;
  const r = await one<{ n: number }>(db, "select count(*)::int as n from trees t join children c on c.id = t.child_id where c.class_id = $1 and t.harvested_at is not null", [classId]);
  return r?.n ?? 0;
}

const BADGES: Record<string, { name: string; icon: string }> = {
  first_tree: { name: "첫 나무", icon: "badge" },
};

export async function badgesFor(childId: number): Promise<{ code: string; name: string; icon: string }[]> {
  const rows = await db.query<{ code: string }>("select code from badges where child_id = $1 order by earned_at", [childId]);
  return rows.map((r) => ({ code: r.code, ...(BADGES[r.code] ?? { name: r.code, icon: "badge" }) }));
}

export async function hasBadge(childId: number, code: string): Promise<boolean> {
  return (await one(db, "select 1 as x from badges where child_id = $1 and code = $2", [childId, code])) !== null;
}

export interface PointRow {
  id: number;
  delta: number;
  reason: string;
  created_at: Date;
}

export async function pointHistory(childId: number): Promise<PointRow[]> {
  return db.query<PointRow>("select id, delta, reason, created_at from point_ledger where child_id = $1 order by created_at desc, id desc limit 100", [childId]);
}

export interface WorshipRow {
  id: number;
  date: string;
  time_place: string;
  sermon_title: string;
  scripture: string;
  preacher: string;
  memory_verse: string;
  items: { title: string; detail?: string }[];
}

/** This week's order of worship, or the most recent one when this week's is not written yet. */
export async function currentWorship(today: string = todayKst()): Promise<{ worship: WorshipRow; thisWeek: boolean } | null> {
  const cols = "id, date, time_place, sermon_title, scripture, preacher, memory_verse, items";
  const now = await one<WorshipRow>(db, `select ${cols} from worship where date >= $1 and date <= $2 order by date limit 1`, [weekStart(today), weekEnd(today)]);
  const row = now ?? (await one<WorshipRow>(db, `select ${cols} from worship order by date desc limit 1`));
  if (!row) return null;
  const items = typeof row.items === "string" ? JSON.parse(row.items) : row.items;
  return { worship: { ...row, items: Array.isArray(items) ? items : [] }, thisWeek: now !== null };
}

export interface NoticeRow {
  id: number;
  title: string;
  body: string;
  important: boolean;
  event_date: string | null;
  created_at: Date;
}

/** Notices for children; staff-only notices never reach these screens. */
export async function kidNotices(): Promise<NoticeRow[]> {
  return db.query<NoticeRow>("select id, title, body, important, event_date, created_at from notices where not staff_only order by important desc, created_at desc, id desc limit 30");
}

export async function kidNotice(id: number): Promise<NoticeRow | null> {
  if (!Number.isInteger(id)) return null;
  return one<NoticeRow>(db, "select id, title, body, important, event_date, created_at from notices where id = $1 and not staff_only", [id]);
}

/** Minutes left on a PIN lock for the remembered card, or 0. */
export async function lockMinutes(token: string): Promise<number> {
  const r = await one<{ m: number }>(
    db,
    "select ceil(extract(epoch from (pin_locked_until - now())) / 60)::int as m from children where qr_token = $1 and active and pin_locked_until is not null and pin_locked_until > now()",
    [token],
  );
  return Math.max(0, r?.m ?? 0);
}

export function dateOf(ts: Date | string): string {
  return todayKst(new Date(ts));
}

/** Whole days a tree has been growing, counting the planting day as day 1. */
export function daysGrowing(plantedAt: Date | string): number {
  return Math.max(1, Math.ceil((Date.now() - new Date(plantedAt).getTime()) / 86_400_000));
}
