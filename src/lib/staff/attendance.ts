import "server-only";
import { canTakeAttendance } from "@/lib/authz";
import { db, one } from "@/lib/db";
import { recordAttendance } from "@/lib/game";
import { addDays, isSunday, todayKst, weekStart } from "@/lib/time";
import type { Staff } from "@/lib/types";
import { attendanceScope, listClasses, scopeSql, type ClassRow } from "./access";
import { clean, deny, fail, isDate, type Result } from "./util";

export type AttStatus = "present" | "late" | "absent";
export interface Streak {
  kind: "attend" | "absent" | null;
  n: number;
}

/** Counts weeks in a row with the same outcome, walking back 7 days at a time from `from`. Late counts as attended. */
export function streakFrom(byDate: Map<string, string>, from: string): Streak {
  let kind: Streak["kind"] = null;
  let n = 0;
  for (let d = from; n < 60; d = addDays(d, -7)) {
    const st = byDate.get(d);
    if (!st) break;
    const k = st === "absent" ? "absent" : "attend";
    if (kind === null) kind = k;
    else if (kind !== k) break;
    n++;
  }
  return { kind, n };
}

export function mostRecentSunday(today: string = todayKst()): string {
  return weekStart(today);
}

/** Classes this teacher may take attendance for. */
export async function attendanceClasses(staff: Staff): Promise<ClassRow[]> {
  const all = await listClasses(db);
  return all.filter((c) => canTakeAttendance(staff, c.id));
}

export interface RosterKid {
  id: number;
  name: string;
  photo_url: string | null;
  status: AttStatus | null;
  note: string;
  /** Streak of the weeks before the chosen date. */
  prior: Streak;
  isNew: boolean;
}

export async function attendanceRoster(staff: Staff, classId: number, date: string): Promise<RosterKid[] | null> {
  if (!canTakeAttendance(staff, classId) || !isDate(date)) return null;
  const kids = await db.query<{ id: number; name: string; photo_url: string | null }>("select id, name, photo_url from children where class_id = $1 and active order by name, id", [classId]);
  if (kids.length === 0) return [];
  const rows = await db.query<{ child_id: number; date: string; status: AttStatus; note: string | null }>(
    "select child_id, date, status, note from attendance where child_id = any($1::int[]) and date <= $2 and date >= $3",
    [kids.map((k) => k.id), date, addDays(date, -7 * 60)],
  );
  return kids.map((k) => {
    const mine = rows.filter((r) => r.child_id === k.id);
    const byDate = new Map(mine.map((r) => [r.date, r.status as string]));
    const today = mine.find((r) => r.date === date);
    return {
      ...k,
      status: today?.status ?? null,
      note: today?.note ?? "",
      prior: streakFrom(byDate, addDays(date, -7)),
      isNew: mine.filter((r) => r.date < date).length === 0,
    };
  });
}

/** Saves one child's attendance. The child's class is looked up here; nothing from the client is trusted. */
export async function saveAttendance(staff: Staff, childId: number, date: string, status: AttStatus | null, note?: string): Promise<Result> {
  if (!isDate(date)) return fail("날짜가 올바르지 않아요");
  if (date > todayKst()) return fail("아직 오지 않은 날짜예요");
  if (status !== null && !["present", "late", "absent"].includes(status)) return fail("출석 상태가 올바르지 않아요");
  // Attendance is for Sunday worship. A mark that slipped onto another day can still be cleared.
  if (status !== null && !isSunday(date)) return fail("출석은 주일에만 기록할 수 있어요");
  const child = await one<{ class_id: number | null }>(db, "select class_id from children where id = $1 and active", [childId]);
  if (!child || !canTakeAttendance(staff, child.class_id)) return deny;
  await recordAttendance(staff.id, childId, date, status, status === "absent" ? clean(note, 200) || undefined : undefined);
  return { ok: true };
}

/** For the home screen: children in my attendance classes with no record on `date`. */
export async function uncheckedCount(staff: Staff, date: string): Promise<number> {
  const sc = scopeSql(attendanceScope(staff), "c.class_id", 2);
  const r = await one<{ n: number }>(
    db,
    `select count(*)::int as n from children c where c.active and c.class_id is not null and ${sc.sql}
       and not exists (select 1 from attendance a where a.child_id = c.id and a.date = $1)`,
    [date, ...sc.params],
  );
  return r?.n ?? 0;
}
