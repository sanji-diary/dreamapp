import "server-only";
import { db } from "@/lib/db";
import { addDays, formatKoreanDate, todayKst, weekLabel, weekStart } from "@/lib/time";
import type { Staff } from "@/lib/types";
import { attendanceScope, scopeSql } from "./access";
import { attendanceClasses, attendanceRoster, type AttStatus, type RosterKid } from "./attendance";
import { shortClassName } from "./home";
import { isDate } from "./util";

/**
 * A month of attendance: the row of Sundays on the phone screen and the month table on wide screens.
 * Everything here reads through attendanceRoster / attendanceScope, so a teacher only ever gets the
 * classes they may take attendance for. Saving stays in saveAttendance (lib/staff/attendance).
 */

/* ---------- which days ---------- */

/** One day that can carry attendance: a column of the month table, a pill on the phone. */
export interface AttColumn {
  date: string;
  /** '3주차' for a Sunday (the week is named as in weekLabel), the weekday for any other day ('수요일'). */
  label: string;
  /** '11/15' */
  md: string;
  sunday: boolean;
  /** Still to come: shown, but it cannot be marked yet. */
  future: boolean;
}

/** 'YYYY-MM' of a date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Every Sunday of a month ('YYYY-MM'), oldest first: four or five dates. */
export function sundaysOfMonth(ym: string): string[] {
  const first = `${ym}-01`;
  const day = new Date(first + "T00:00:00Z").getUTCDay();
  const out: string[] = [];
  for (let d = addDays(first, (7 - day) % 7); monthOf(d) === ym; d = addDays(d, 7)) out.push(d);
  return out;
}

function column(date: string, today: string): AttColumn {
  const sunday = weekStart(date) === date;
  const [, m, d] = date.split("-").map(Number);
  // weekLabel gives '11월 3주차', formatKoreanDate '11월 18일 수요일': the last word is what the column needs.
  const label = sunday ? weekLabel(date).split(" ")[1] : formatKoreanDate(date).split(" ")[2];
  return { date, label, md: `${m}/${d}`, sunday, future: date > today };
}

/**
 * The days of a month to show: its Sundays, plus any other day of that month in `extra`
 * (a weekday that already has marks, or the one the teacher asked for).
 */
export function monthColumns(ym: string, today: string, extra: string[] = []): AttColumn[] {
  const dates = new Set(sundaysOfMonth(ym));
  for (const d of extra) if (isDate(d) && monthOf(d) === ym) dates.add(d);
  return [...dates].sort().map((d) => column(d, today));
}

export interface MonthStep {
  /** '10월', or '2025년 12월' when it is not this year. */
  label: string;
  /** The day to open in that month. */
  date: string;
}

/** '11월'; the year is added when it is not the year of `today`. */
export function monthLabel(ym: string, today: string): string {
  const [y, m] = ym.split("-").map(Number);
  return ym.slice(0, 4) === today.slice(0, 4) ? `${m}월` : `${y}년 ${m}월`;
}

/**
 * The months before and after `ym`. The earlier one opens on its last Sunday, the later one on its
 * first; there is no later month until one of its Sundays has come.
 */
export function monthSteps(ym: string, today: string): { prev: MonthStep; next: MonthStep | null } {
  const first = `${ym}-01`;
  const prevYm = monthOf(addDays(first, -1));
  const nextYm = monthOf(addDays(first, 31));
  const nextSunday = sundaysOfMonth(nextYm)[0];
  return {
    prev: { label: monthLabel(prevYm, today), date: sundaysOfMonth(prevYm).at(-1)! },
    next: nextSunday <= today ? { label: monthLabel(nextYm, today), date: nextSunday } : null,
  };
}

/* ---------- the month of one or more classes ---------- */

export interface MonthKid extends RosterKid {
  class_id: number;
  class_name: string;
  /** '5-2' */
  class_short: string;
  /** Tree level, for the picture beside the name. */
  level: number;
}

export interface MonthMark {
  status: AttStatus;
  note: string;
}

export interface MonthData {
  /** In class order, then by name. `status`, `note` and `prior` are those of the chosen date. */
  kids: MonthKid[];
  columns: AttColumn[];
  /** marks[child id][date] for every column. */
  marks: Record<number, Record<string, MonthMark>>;
}

/**
 * The children of the given classes with their marks for the month that holds `date`.
 * Classes this teacher may not take attendance for are left out (attendanceRoster refuses them),
 * so asking for another teacher's class gives an empty list, never its children.
 */
export async function attendanceMonth(staff: Staff, classIds: number[], date: string, today: string = todayKst()): Promise<MonthData | null> {
  if (!isDate(date)) return null;
  const ym = monthOf(date);
  const classes = (await attendanceClasses(staff)).filter((c) => classIds.includes(c.id));
  const kids: MonthKid[] = [];
  for (const c of classes) {
    const roster = await attendanceRoster(staff, c.id, date);
    for (const k of roster ?? []) kids.push({ ...k, class_id: c.id, class_name: c.name, class_short: shortClassName(c.name), level: 1 });
  }
  const ids = kids.map((k) => k.id);
  const marks: MonthData["marks"] = {};
  const weekdays: string[] = [];
  if (ids.length > 0) {
    const [rows, trees] = await Promise.all([
      db.query<{ child_id: number; date: string; status: AttStatus; note: string | null }>(
        "select child_id, date, status, note from attendance where child_id = any($1::int[]) and date >= $2 and date < $3",
        [ids, `${ym}-01`, `${monthOf(addDays(`${ym}-01`, 31))}-01`],
      ),
      db.query<{ child_id: number; level: number }>("select child_id, level from trees where child_id = any($1::int[]) and harvested_at is null", [ids]),
    ]);
    for (const r of rows) {
      (marks[r.child_id] ??= {})[r.date] = { status: r.status, note: r.note ?? "" };
      if (weekStart(r.date) !== r.date) weekdays.push(r.date);
    }
    for (const k of kids) k.level = trees.find((t) => t.child_id === k.id)?.level ?? 1;
  }
  return { kids, columns: monthColumns(ym, today, [date, ...weekdays]), marks };
}

/* ---------- one day, class by class ---------- */

export interface ClassCount {
  id: number;
  name: string;
  /** Children in the class now. */
  kids: number;
  /** Children with a mark on that day. */
  recorded: number;
  /** Of those, the ones who came (late counts). */
  present: number;
}

/** One row per class this teacher may take attendance for, with that day's numbers. */
export async function attendanceCounts(staff: Staff, date: string): Promise<ClassCount[]> {
  if (!isDate(date)) return [];
  const sc = scopeSql(attendanceScope(staff), "k.id", 2);
  return db.query<ClassCount>(
    `select k.id, k.name,
            (select count(*)::int from children c where c.class_id = k.id and c.active) as kids,
            (select count(*)::int from attendance a join children c on c.id = a.child_id where c.class_id = k.id and c.active and a.date = $1) as recorded,
            (select count(*)::int from attendance a join children c on c.id = a.child_id where c.class_id = k.id and c.active and a.date = $1 and a.status in ('present','late')) as present
       from classes k
      where not k.archived and ${sc.sql}
      order by k.sort, k.id`,
    [date, ...sc.params],
  );
}
