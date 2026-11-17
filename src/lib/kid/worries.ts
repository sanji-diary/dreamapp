import "server-only";
import { db, one } from "@/lib/db";
import { autoComplete, type CompleteResult } from "@/lib/game";
import type { WorryAudience } from "@/lib/types";

export const WORRY_MAX = 1000;

export interface WorryReaders {
  /** Homeroom teachers of the child's class: they read 'teacher' and 'both'. */
  teachers: string[];
  /** Admins and staff allowed to read pastor worries: they read 'pastor' and 'both'. */
  pastors: { name: string; isAdmin: boolean }[];
}

/** The real people who would read a worry, mirroring canReadWorry() in lib/authz. */
export async function worryReaders(childId: number): Promise<WorryReaders> {
  const teachers = await db.query<{ name: string }>(
    `select s.name from staff s join staff_classes sc on sc.staff_id = s.id join children c on c.class_id = sc.class_id
      where c.id = $1 and s.active and s.role = 'homeroom' order by s.id`,
    [childId],
  );
  const pastors = await db.query<{ name: string; is_admin: boolean }>(
    "select name, (role = 'admin') as is_admin from staff where active and (role = 'admin' or can_read_pastor_worries) order by (role = 'admin') desc, id",
  );
  return { teachers: teachers.map((t) => t.name), pastors: pastors.map((p) => ({ name: p.name, isAdmin: p.is_admin })) };
}

export function teacherLabel(r: WorryReaders): string {
  return r.teachers.length > 0 ? `${r.teachers.join(", ")} 선생님` : "담임 선생님";
}

export function pastorLabel(r: WorryReaders): string {
  if (r.pastors.length === 0) return "전도사님";
  return r.pastors.map((p) => `${p.name} ${p.isAdmin ? "전도사님" : "선생님"}`).join(", ");
}

export type SubmitWorryResult =
  | { ok: true; worryId: number; mission: CompleteResult | null }
  | { ok: false; reason: "empty" | "too_long" | "audience" | "no_reader" };

const AUDIENCES: WorryAudience[] = ["teacher", "pastor", "both"];

/**
 * Saves a worry for exactly the audience the child picked (there is no default) and freezes the
 * class at writing time so a later class change does not hand it to a different teacher.
 */
export async function submitWorry(childId: number, content: unknown, audience: unknown): Promise<SubmitWorryResult> {
  const body = typeof content === "string" ? content.trim() : "";
  if (!body) return { ok: false, reason: "empty" };
  if ([...body].length > WORRY_MAX) return { ok: false, reason: "too_long" };
  if (typeof audience !== "string" || !AUDIENCES.includes(audience as WorryAudience)) return { ok: false, reason: "audience" };
  const readers = await worryReaders(childId);
  if (audience === "teacher" && readers.teachers.length === 0) return { ok: false, reason: "no_reader" };
  if (audience === "pastor" && readers.pastors.length === 0) return { ok: false, reason: "no_reader" };
  if (audience === "both" && readers.teachers.length + readers.pastors.length === 0) return { ok: false, reason: "no_reader" };
  const rows = await db.query<{ id: number }>(
    "insert into worries (child_id, content, audience, class_id_at_write) select id, $2, $3, class_id from children where id = $1 returning id",
    [childId, body, audience],
  );
  if (rows.length === 0) return { ok: false, reason: "empty" };
  const mission = await autoComplete(childId, "worry");
  return { ok: true, worryId: rows[0].id, mission };
}

export interface MyWorry {
  id: number;
  content: string;
  audience: WorryAudience;
  created_at: Date;
  replies: { id: number; content: string; created_at: Date; author: string; unread: boolean }[];
}

/** The child's own worries with replies. Never used for anyone else's. */
export async function myWorries(childId: number): Promise<MyWorry[]> {
  const worries = await db.query<Omit<MyWorry, "replies">>(
    "select id, content, audience, created_at from worries where child_id = $1 and deleted_at is null order by created_at desc, id desc",
    [childId],
  );
  if (worries.length === 0) return [];
  const replies = await db.query<{ id: number; worry_id: number; content: string; created_at: Date; name: string | null; role: string | null; unread: boolean }>(
    `select r.id, r.worry_id, r.content, r.created_at, s.name, s.role, (r.read_by_child_at is null) as unread
       from worry_replies r join worries w on w.id = r.worry_id left join staff s on s.id = r.staff_id
      where w.child_id = $1 and w.deleted_at is null order by r.created_at, r.id`,
    [childId],
  );
  return worries.map((w) => ({
    ...w,
    replies: replies
      .filter((r) => r.worry_id === w.id)
      .map((r) => ({ id: r.id, content: r.content, created_at: r.created_at, unread: r.unread, author: r.name ? `${r.name} ${r.role === "admin" ? "전도사님" : "선생님"}` : "선생님" })),
  }));
}

export async function unreadReplyCount(childId: number): Promise<number> {
  const r = await one<{ n: number }>(
    db,
    `select count(*)::int as n from worry_replies r join worries w on w.id = r.worry_id
      where w.child_id = $1 and w.deleted_at is null and r.read_by_child_at is null`,
    [childId],
  );
  return r?.n ?? 0;
}

export async function markRepliesRead(childId: number): Promise<void> {
  await db.query(
    "update worry_replies set read_by_child_at = now() where read_by_child_at is null and worry_id in (select id from worries where child_id = $1)",
    [childId],
  );
}

/** Soft delete: the row stays for safeguarding records but disappears from the child's list. */
export async function deleteWorry(childId: number, worryId: number): Promise<boolean> {
  const rows = await db.query("update worries set deleted_at = now() where id = $1 and child_id = $2 and deleted_at is null returning id", [worryId, childId]);
  return rows.length > 0;
}
