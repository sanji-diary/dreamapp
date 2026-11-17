import type { Role, Staff } from "./types";

/**
 * Who may see what. Every staff-facing query must go through these helpers.
 *
 * - basic (비담임): names, photos and classes only. No personal details.
 * - homeroom (담임): children of the classes assigned to them.
 * - head (부장): every class, read-only for visits.
 * - admin (교역자): everything, plus settings.
 * Individual switches (can_*) refine the preset for one teacher.
 */
export const ROLE_PRESETS: Record<Role, Pick<Staff, "can_attendance" | "can_visits" | "can_approve" | "can_view_all" | "can_read_pastor_worries">> = {
  basic: { can_attendance: false, can_visits: false, can_approve: false, can_view_all: false, can_read_pastor_worries: false },
  homeroom: { can_attendance: true, can_visits: true, can_approve: true, can_view_all: false, can_read_pastor_worries: false },
  head: { can_attendance: true, can_visits: true, can_approve: true, can_view_all: true, can_read_pastor_worries: false },
  admin: { can_attendance: true, can_visits: true, can_approve: true, can_view_all: true, can_read_pastor_worries: true },
};

export function isAdmin(s: Staff): boolean {
  return s.role === "admin";
}

/** Class ids whose children this teacher may see in detail. null means every class. */
export function detailScope(s: Staff): number[] | null {
  if (s.role === "basic") return [];
  if (s.role === "admin" || s.role === "head" || s.can_view_all) return null;
  return s.class_ids;
}

export function canSeeChildDetail(s: Staff, classId: number | null): boolean {
  const scope = detailScope(s);
  if (scope === null) return true;
  return classId !== null && scope.includes(classId);
}

export function canTakeAttendance(s: Staff, classId: number | null): boolean {
  return s.can_attendance && canSeeChildDetail(s, classId);
}

export function canApprove(s: Staff, classId: number | null): boolean {
  return s.can_approve && canSeeChildDetail(s, classId);
}

export function canReadVisits(s: Staff, classId: number | null): boolean {
  return (s.can_visits || s.role === "head" || s.role === "admin") && canSeeChildDetail(s, classId);
}

/** Head teachers read visit notes but only homeroom teachers and admins write them. */
export function canWriteVisits(s: Staff, classId: number | null): boolean {
  if (s.role === "admin") return true;
  return s.role === "homeroom" && s.can_visits && s.class_ids.includes(classId ?? -1);
}

/** Any teacher may hide a comment on the feed. */
export function canModerateComments(s: Staff): boolean {
  return s.active;
}

/**
 * Worries are readable only by the people the child chose.
 * - audience 'pastor' or 'both' -> admins (and staff explicitly granted can_read_pastor_worries)
 * - audience 'teacher' or 'both' -> homeroom teachers of the class the child was in when writing
 * Head and basic teachers never see worries. Returns a SQL condition over alias `w`.
 */
export function worryCondition(s: Staff, firstParam: number): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (s.role === "admin" || s.can_read_pastor_worries) {
    parts.push("w.audience in ('pastor','both')");
  }
  if (s.role === "homeroom" && s.class_ids.length > 0) {
    params.push(s.class_ids);
    parts.push(`(w.audience in ('teacher','both') and w.class_id_at_write = any($${firstParam}::int[]))`);
  }
  if (parts.length === 0) return { sql: "false", params: [] };
  return { sql: `(${parts.join(" or ")})`, params };
}

export function canReadWorry(s: Staff, w: { audience: string; class_id_at_write: number | null }): boolean {
  const pastorSide = (s.role === "admin" || s.can_read_pastor_worries) && (w.audience === "pastor" || w.audience === "both");
  const teacherSide =
    s.role === "homeroom" && (w.audience === "teacher" || w.audience === "both") && w.class_id_at_write !== null && s.class_ids.includes(w.class_id_at_write);
  return pastorSide || teacherSide;
}
