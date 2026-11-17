import "server-only";
import { db, one } from "@/lib/db";
import { completeMission, missionsForChild, recordAttendance } from "@/lib/game";
import { isOpenOn, rotationFor } from "@/lib/plan";
import { isSunday, todayKst, weekStart } from "@/lib/time";
import type { Mission } from "@/lib/types";

/** Shape of a mission QR code (newToken output). Anything else is rejected before it touches the database or a cookie. */
export function isQrCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(code);
}

export type ScanFail = "unknown" | "closed" | "not_sunday" | "not_yours" | "already" | "ask_teacher";
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
 * Honest limit: the code is a link. A child who photographs the poster, or is sent the link by a
 * friend, can open it from home on a Sunday the mission is open. Take the poster down afterwards;
 * teachers can still correct the attendance board.
 */
export async function scanQr(childId: number, code: string, date: string = todayKst()): Promise<ScanResult> {
  if (!isQrCode(code)) return { ok: false, reason: "unknown" };
  const m = await one<Mission>(db, "select * from missions where qr_code = $1 and kind in ('qr','attendance')", [code]);
  if (!m) return { ok: false, reason: "unknown" };
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
  const r = await completeMission(childId, m.id, { viaQr: code, date });
  if (!r.ok) return { ok: false, reason: r.reason === "already_done" ? "already" : "closed" };
  // Only the mark: this scan has completed its own mission, and must not finish a second attendance mission open today.
  if (m.kind === "attendance" && !marked) await recordAttendance(null, childId, date, "present", undefined, { markOnly: true });
  return { ok: true, completionId: r.completionId, kind: m.kind === "attendance" ? "attendance" : "qr" };
}
