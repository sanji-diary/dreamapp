"use client";

import { useRef, useState } from "react";
import { markAttendanceAction } from "@/lib/staff/actions";
import type { AttStatus } from "@/lib/staff/attendance";

/** One child's mark on one day. */
export type Entry = { status: AttStatus | null; note: string };

export const EMPTY: Entry = { status: null, note: "" };

export const entryKey = (childId: number, date: string) => `${childId}:${date}`;

export interface AttendanceStore {
  get(childId: number, date: string): Entry;
  /** Shows the change straight away, then saves it. A failed save puts the old mark back. */
  save(childId: number, date: string, next: Entry): Promise<unknown>;
  /** Tries the failed saves again and waits until nothing is on its way. */
  saveAll(): Promise<void>;
  /** Marks that could not be saved yet. */
  failed: number;
  /** Saves on their way. */
  busy: number;
  /** True once the latest change has been saved. */
  done: boolean;
  message: { text: string; error: boolean } | null;
}

/**
 * The marks of the attendance screen (roll call on phones, month table on wide screens: both read
 * and write the same store). Each change is saved at once through markAttendanceAction, which
 * checks the teacher's class and the date on the server; the screen updates first and rolls back
 * if the save fails. Saves run one after another so quick taps on one child land in order.
 */
export function useAttendanceStore(initial: Record<string, Entry>): AttendanceStore {
  const [entries, setEntries] = useState<Record<string, Entry>>(initial);
  const [failed, setFailed] = useState<Record<string, Entry>>({});
  const [message, setMessage] = useState<AttendanceStore["message"]>(null);
  const [busy, setBusy] = useState(0);
  const [done, setDone] = useState(false);
  const saved = useRef<Record<string, Entry>>({ ...initial });
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  function save(childId: number, date: string, next: Entry) {
    const k = entryKey(childId, date);
    setEntries((e) => ({ ...e, [k]: next }));
    setMessage(null);
    setDone(false);
    setBusy((n) => n + 1);
    queue.current = queue.current.then(async () => {
      let ok = false;
      let error = "저장하지 못했어요. 다시 눌러 주세요";
      try {
        const r = await markAttendanceAction(childId, date, next.status, next.note);
        ok = r.ok;
        if (!r.ok) error = r.error;
      } catch {
        // network trouble: keep the default message
      }
      setBusy((n) => n - 1);
      if (ok) {
        saved.current[k] = next;
        setDone(true);
        setFailed((f) => {
          const rest = { ...f };
          delete rest[k];
          return rest;
        });
      } else {
        setFailed((f) => ({ ...f, [k]: next }));
        setEntries((e) => ({ ...e, [k]: saved.current[k] ?? EMPTY }));
        setMessage({ text: error, error: true });
      }
    });
    return queue.current;
  }

  async function saveAll() {
    for (const [k, entry] of Object.entries(failed)) {
      const [id, date] = k.split(":");
      save(Number(id), date, entry);
    }
    await queue.current;
    setMessage((m) => (m?.error ? m : { text: "출석을 저장했어요", error: false }));
  }

  return { get: (childId, date) => entries[entryKey(childId, date)] ?? EMPTY, save, saveAll, failed: Object.keys(failed).length, busy, done, message };
}
