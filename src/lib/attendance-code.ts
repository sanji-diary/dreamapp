import "server-only";
import { createHmac } from "node:crypto";
import { addDays, isSunday, todayKst, weekStart } from "@/lib/time";

/**
 * The attendance QR changes every Sunday.
 *
 * An attendance mission keeps one secret (`missions.qr_code`); the code printed in the QR of a given
 * Sunday is made from that secret and the date. Last week's poster, or a photo of it, no longer
 * works; nothing has to be stored per week. The secret itself is never shown or printed.
 * (QR missions of the 'qr' kind keep their one code: they are set up per event.)
 *
 * What this does not stop: a photo of this Sunday's QR sent to a friend the same day.
 */
export function weeklyAttendanceCode(secret: string, sunday: string): string {
  return createHmac("sha256", secret).update(`attendance:${sunday}`).digest("base64url").slice(0, 12);
}

/** The Sunday an attendance QR shown or printed today is for: today on a Sunday, otherwise the next one. */
export function comingSunday(today: string = todayKst()): string {
  return isSunday(today) ? today : addDays(weekStart(today), 7);
}
