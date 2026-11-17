import "server-only";
import { detailScope } from "@/lib/authz";
import { db, one } from "@/lib/db";
import { getEvent, openEvent, talentBalance, type TalentEvent } from "@/lib/talents";
import type { Staff } from "@/lib/types";
import { csv } from "./admin-misc";

/**
 * Read side of the 달란트 잔치 screens.
 * Admin screens: everything about an event. Payment screen: any active teacher, and only
 * what the screen needs (name, class, photo, talent balance) — no personal details.
 */

const admin = (s: Staff) => s.active && s.role === "admin";

/* ---------- admin ---------- */

export async function listEvents(staff: Staff): Promise<TalentEvent[] | null> {
  if (!admin(staff)) return null;
  return db.query<TalentEvent>(
    "select id, name, points_per_talent, status, opened_at, closed_at, created_at from talent_events order by case status when 'open' then 0 when 'draft' then 1 else 2 end, id desc",
  );
}

export interface PreviewRow {
  id: number;
  name: string;
  class_name: string | null;
  points: number;
}

/** Every active child's points, for trying out rates. Nothing is written. */
export async function previewRows(staff: Staff): Promise<PreviewRow[] | null> {
  if (!admin(staff)) return null;
  return db.query<PreviewRow>(
    `select c.id, c.name, k.name as class_name, (select coalesce(sum(delta),0)::int from point_ledger p where p.child_id = c.id) as points
       from children c left join classes k on k.id = c.class_id where c.active order by k.sort nulls last, k.id, c.name, c.id`,
  );
}

export interface BoardRow {
  id: number;
  name: string;
  class_name: string | null;
  active: boolean;
  points_at_open: number | null;
  granted: number;
  spent: number;
  adjusted: number;
  balance: number;
}

export interface LogRow {
  id: number;
  child_name: string;
  class_name: string | null;
  kind: "payment" | "undo" | "adjust";
  delta: number;
  reason: string;
  staff_name: string | null;
  created_at: Date;
}

export interface EventBoard {
  event: TalentEvent;
  rows: BoardRow[];
  totals: { granted: number; spent: number; adjusted: number; balance: number };
}

/** Per-child grants, spending (payments minus cancelled ones), manual adjustments and what is left. */
export async function eventBoard(staff: Staff, eventId: number): Promise<EventBoard | null> {
  if (!admin(staff)) return null;
  const event = await getEvent(eventId);
  if (!event || event.status === "draft") return null;
  const rows = await db.query<BoardRow>(
    `select c.id, c.name, k.name as class_name, c.active, g.points_at_open,
            coalesce(g.talents, 0)::int as granted,
            coalesce(l.spent, 0)::int as spent,
            coalesce(l.adjusted, 0)::int as adjusted,
            (coalesce(g.talents, 0) - coalesce(l.spent, 0) + coalesce(l.adjusted, 0))::int as balance
       from children c
       left join classes k on k.id = c.class_id
       left join talent_grants g on g.event_id = $1 and g.child_id = c.id
       left join lateral (
         select -sum(delta) filter (where kind in ('payment','undo')) as spent,
                sum(delta) filter (where kind = 'adjust') as adjusted,
                count(*) as n
           from talent_ledger where event_id = $1 and child_id = c.id) l on true
      where g.child_id is not null or l.n > 0 or (c.active and $2::boolean)
      order by k.sort nulls last, k.id, c.name, c.id`,
    [eventId, event.status === "open"],
  );
  const sum = (f: (r: BoardRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  return { event, rows, totals: { granted: sum((r) => r.granted), spent: sum((r) => r.spent), adjusted: sum((r) => r.adjusted), balance: sum((r) => r.balance) } };
}

export async function eventLog(staff: Staff, eventId: number, limit: number | null = 50): Promise<LogRow[] | null> {
  if (!admin(staff)) return null;
  return db.query<LogRow>(
    `select l.id, c.name as child_name, k.name as class_name, l.kind, l.delta, l.reason, s.name as staff_name, l.created_at
       from talent_ledger l join children c on c.id = l.child_id left join classes k on k.id = c.class_id left join staff s on s.id = l.staff_id
      where l.event_id = $1 order by l.id desc ${limit === null ? "" : "limit " + Math.max(1, Math.floor(limit))}`,
    [eventId],
  );
}

const KIND_KO: Record<LogRow["kind"], string> = { payment: "결제", undo: "결제 취소", adjust: "조정" };
export const kindName = (k: LogRow["kind"]) => KIND_KO[k];

const KST = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
/** '2027-12-19 14:03:22' in Korea time. */
export function kstDateTime(ts: Date | string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : KST.format(d);
}

/** kind 'summary': one row per child. kind 'log': every ledger row, oldest first. */
export async function talentsCsv(staff: Staff, eventId: number, kind: "summary" | "log"): Promise<string | null> {
  const board = await eventBoard(staff, eventId);
  if (!board) return null;
  if (kind === "summary") {
    return csv([
      ["반", "이름", "시작 때 포인트", "받은 달란트", "쓴 달란트", "조정", "남은 달란트"],
      ...board.rows.map((r) => [r.class_name, r.name, r.points_at_open, r.granted, r.spent, r.adjusted, r.balance]),
      ["합계", "", null, board.totals.granted, board.totals.spent, board.totals.adjusted, board.totals.balance],
    ]);
  }
  const log = (await eventLog(staff, eventId, null)) ?? [];
  return csv([["시각", "반", "이름", "구분", "달란트", "내용", "교사"], ...log.reverse().map((l) => [kstDateTime(l.created_at), l.class_name, l.child_name, KIND_KO[l.kind], l.delta, l.reason, l.staff_name])]);
}

/* ---------- payment screen (any active teacher) ---------- */

export interface FestivalKid {
  id: number;
  name: string;
  class_id: number | null;
  class_name: string | null;
  photo_url: string | null;
}

export interface FestivalChild {
  id: number;
  name: string;
  class_name: string | null;
  photo_url: string | null;
  balance: number;
}

/** Names, classes and photos of active children, for the search list. Empty when no event is open. */
export async function festivalKids(staff: Staff): Promise<FestivalKid[]> {
  if (!staff.active || !(await openEvent())) return [];
  return db.query<FestivalKid>(
    `select c.id, c.name, c.class_id, k.name as class_name, c.photo_url
       from children c left join classes k on k.id = c.class_id where c.active order by k.sort nulls last, k.id, c.name, c.id`,
  );
}

/**
 * Tree levels for the pictures on the payment screen, by child id. A tree is a detail of a child,
 * so a teacher gets it only for the children they may open (the same rule as the class list);
 * the others are shown with a plain leaf. Empty when no event is open.
 */
export async function festivalLevels(staff: Staff): Promise<Record<number, number>> {
  if (!staff.active || !(await openEvent())) return {};
  const scope = detailScope(staff);
  if (scope !== null && scope.length === 0) return {};
  const rows = await db.query<{ id: number; level: number }>(
    `select c.id, coalesce((select t.level from trees t where t.child_id = c.id and t.harvested_at is null order by t.seq desc limit 1), 1)::int as level
       from children c where c.active and ($1::int[] is null or c.class_id = any($1::int[]))`,
    [scope],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.level]));
}

async function childWhere(staff: Staff, where: string, param: unknown): Promise<FestivalChild | null> {
  if (!staff.active) return null;
  const ev = await openEvent();
  if (!ev) return null;
  const c = await one<Omit<FestivalChild, "balance">>(db, `select c.id, c.name, k.name as class_name, c.photo_url from children c left join classes k on k.id = c.class_id where c.active and ${where}`, [param]);
  return c ? { ...c, balance: await talentBalance(db, ev.id, c.id) } : null;
}

export async function festivalChild(staff: Staff, childId: number): Promise<FestivalChild | null> {
  return Number.isInteger(childId) ? childWhere(staff, "c.id = $1", childId) : null;
}

/** The token inside what a QR card holds: `${origin}/join/<token>` (or the bare token). */
export function cardToken(scanned: string): string | null {
  const text = scanned.trim().slice(0, 500);
  const m = /\/join\/([A-Za-z0-9_-]{1,100})(?:[/?#]|$)/.exec(text);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{4,100}$/.test(text) ? text : null;
}

/**
 * Finds the child a scanned card belongs to. The token is looked up here on the server and only
 * the child's id, name, class, photo and balance go back; tokens never reach the browser.
 */
export async function childByCard(staff: Staff, scanned: unknown): Promise<FestivalChild | null> {
  const token = typeof scanned === "string" ? cardToken(scanned) : null;
  return token ? childWhere(staff, "c.qr_token = $1", token) : null;
}
