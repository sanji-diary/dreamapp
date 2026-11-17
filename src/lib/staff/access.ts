import { detailScope } from "@/lib/authz";
import type { Queryable } from "@/lib/db";
import type { Staff } from "@/lib/types";

/**
 * Class scopes for list queries, built on the rules in lib/authz.
 * null = every class, [] = none.
 */
export function attendanceScope(s: Staff): number[] | null {
  return s.can_attendance ? detailScope(s) : [];
}

export function approveScope(s: Staff): number[] | null {
  return s.can_approve ? detailScope(s) : [];
}

/** SQL condition for "column is inside this scope". Children without a class match only the 'every class' scope. */
export function scopeSql(scope: number[] | null, column: string, param: number): { sql: string; params: unknown[] } {
  if (scope === null) return { sql: "true", params: [] };
  if (scope.length === 0) return { sql: "false", params: [] };
  return { sql: `${column} = any($${param}::int[])`, params: [scope] };
}

export function hasScope(scope: number[] | null): boolean {
  return scope === null || scope.length > 0;
}

export function canSeeWorryBox(s: Staff): boolean {
  return s.role === "admin" || s.can_read_pastor_worries || (s.role === "homeroom" && s.class_ids.length > 0);
}

/** Which bottom tabs a teacher gets. Tabs they cannot use at all are hidden (pages still check on their own). */
export function staffTabs(s: Staff) {
  return {
    attendance: hasScope(attendanceScope(s)),
    children: true,
    approvals: true, // every teacher may handle reported comments
    worries: canSeeWorryBox(s),
    admin: s.role === "admin",
  };
}

export async function audit(q: Queryable, staffId: number, action: string, targetType: string, targetId: number | null, detail: Record<string, unknown> = {}) {
  await q.query("insert into audit_log (staff_id, action, target_type, target_id, detail) values ($1,$2,$3,$4,$5)", [staffId, action, targetType, targetId, JSON.stringify(detail)]);
}

export interface ClassRow {
  id: number;
  name: string;
  grade: number | null;
  sort: number;
  archived: boolean;
}

export async function listClasses(q: Queryable, includeArchived = false): Promise<ClassRow[]> {
  return q.query<ClassRow>(`select id, name, grade, sort, archived from classes ${includeArchived ? "" : "where not archived"} order by archived, sort, id`);
}
