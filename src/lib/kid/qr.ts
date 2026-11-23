import "server-only";
import { weeklyAttendanceCode } from "@/lib/attendance-code";
import { db, one } from "@/lib/db";
import { completeMission, missionsForChild, recordAttendance } from "@/lib/game";
import { isOpenOn, rotationFor } from "@/lib/plan";
import { addDays, isSunday, todayKst, weekStart } from "@/lib/time";
import type { Mission } from "@/lib/types";

/** Shape of a mission QR code (newToken output). Anything else is rejected before it touches the database or a cookie. */
export function isQrCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(code);
}

export type ScanFail = "unknown" | "closed" | "not_sunday" | "not_yours" | "already" | "ask_teacher" | "expired";
export type ScanResult = { ok: true; completionId: number; kind: "qr" | "attendance" } | { ok: false; reason: ScanFail };

/**
 * A child scanned a mission QR posted at church.
 *
 * Works only for the mission that owns the code, only while it is open (active, and on its dates,
 * every week, or in this week's rotation, depending on how it is scheduled), and only for children
 * the mission is meant for. An attendance QR works on Sundays only. For an attendance mission the
 * scan also marks the child present today (staff_id null = self check-in), unless a teacher already
 * marked them: a teacher's mark is never overwritten, and after an 'absent' mark the child is sent
 * to the teacher.
 *
 * The attendance QR changes every Sunday (src/lib/attendance-code.ts): only the code of this week
 * finishes the mission. An older one (or the QR from before it changed weekly) answers "expired",
 * next Sunday's answers that it is not open yet.
 *
 * Honest limit: the code is a link. A child who photographs this Sunday's poster, or is sent the
 * link by a friend, can open it from home that same Sunday. Teachers can still correct the
 * attendance board.
 */
type Found = { m: Mission; when: "now" | "past" | "next" };

/** How many past Sundays are recognised as "an old attendance QR" rather than an unknown one. */
const PAST_WEEKS = 12;

async function findMission(code: string, date: string): Promise<Found | null> {
  const direct = await one<Mission>(db, "select * from missions where qr_code = $1 and kind in ('qr','attendance')", [code]);
  // An attendance mission's own secret was the QR before it changed weekly: an old poster.
  if (direct) return { m: direct, when: direct.kind === "attendance" ? "past" : "now" };
  const rows = await db.query<Mission>("select * from missions where kind = 'attendance' and qr_code is not null order by id");
  const sunday = weekStart(date);
  const made = (m: Mission, s: string) => m.qr_code !== null && weeklyAttendanceCode(m.qr_code, s) === code;
  for (const m of rows) if (made(m, sunday)) return { m, when: "now" };
  for (const m of rows) if (made(m, addDays(sunday, 7))) return { m, when: "next" };
  for (let i = 1; i <= PAST_WEEKS; i++) for (const m of rows) if (made(m, addDays(sunday, -7 * i))) return { m, when: "past" };
  return null;
}

export async function scanQr(childId: number, code: string, date: string = todayKst()): Promise<ScanResult> {
  if (!isQrCode(code)) return { ok: false, reason: "unknown" };
  const found = await findMission(code, date);
  if (!found) return { ok: false, reason: "unknown" };
  const m = found.m;
  if (found.when === "past") return { ok: false, reason: "expired" };
  if (found.when === "next") return { ok: false, reason: isSunday(date) ? "closed" : "not_sunday" };
  if (!isOpenOn(m, date, m.mode === "pool" ? await rotationFor(db, weekStart(date)) : [])) return { ok: false, reason: "closed" };
  if (m.kind === "attendance" && !isSunday(date)) return { ok: false, reason: "not_sunday" };
  const mine = (await missionsForChild(db, childId, date)).find((x) => x.id === m.id);
  if (!mine) return { ok: false, reason: "not_yours" };
  if (mine.state !== "available") return { ok: false, reason: "already" };

  let marked: { status: string } | null = null;
  if (m.kind === "attendance") {
    marked = await one<{ status: string }>(db, "select status from attendance where child_id = $1 and date = $2", [childId, date]);
    if (marked?.status === "absent") return { ok: false, reason: "ask_teacher" };
  }
  // The mission is finished with its own secret (the weekly code was checked above).
  const r = await completeMission(childId, m.id, { viaQr: m.qr_code ?? code, date });
  if (!r.ok) return { ok: false, reason: r.reason === "already_done" ? "already" : "closed" };
  // Only the mark: this scan has completed its own mission, and must not finish a second attendance mission open today.
  if (m.kind === "attendance" && !marked) await recordAttendance(null, childId, date, "present", undefined, { markOnly: true });
  return { ok: true, completionId: r.completionId, kind: m.kind === "attendance" ? "attendance" : "qr" };
}
