"use client";

import type { ReactNode } from "react";
import type { MonthKid, MonthMark } from "@/lib/staff/attendance-month";
import { MonthTable, type TableColumn } from "./attendance/MonthTable";
import { RollCall } from "./attendance/RollCall";
import { entryKey, useAttendanceStore, type Entry } from "./attendance/store";

/**
 * The attendance screen below its header: the roll call of the chosen day (below `lg`) and the
 * month table (from `lg`). Both are always rendered and share one store, so a mark made in one is
 * the mark the other shows; which of the two is visible is a matter of screen width only.
 *
 * Give it a `key` of class and date: another class or day starts from what the server sent.
 */
export function AttendanceBoard({
  date,
  kids,
  columns,
  marks,
  grouped,
  title,
  total,
  side,
}: {
  /** The chosen day: the one the roll call marks. */
  date: string;
  kids: MonthKid[];
  columns: TableColumn[];
  marks: Record<number, Record<string, MonthMark>>;
  /** Several classes at once (모든 반): the roll call lists them class by class, the table gets a class column. */
  grouped: boolean;
  /** Roll call heading: the class name or the class picker. */
  title: ReactNode;
  /** Heading of the table's sum column ('이번 달'). */
  total: string;
  /** The box beside the table. */
  side: ReactNode;
}) {
  const initial: Record<string, Entry> = {};
  for (const [id, days] of Object.entries(marks)) for (const [d, m] of Object.entries(days)) initial[entryKey(Number(id), d)] = { status: m.status, note: m.note };
  const store = useAttendanceStore(initial);
  return (
    <>
      <RollCall date={date} kids={kids} store={store} title={title} grouped={grouped} />
      <MonthTable date={date} kids={kids} columns={columns} store={store} showClass={grouped} total={total} side={side} />
    </>
  );
}
