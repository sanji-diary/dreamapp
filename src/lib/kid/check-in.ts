import { attendanceOpenOn, type EventPeriod } from "@/lib/event";
import { todayKst } from "@/lib/time";

/**
 * Whether the tree screen offers "출석 체크" today: the attendance QR is accepted today (a Sunday, or
 * an extra day of the event period), and an attendance mission with a QR is still waiting for this
 * child. After the scan (or once a teacher has marked the child) it is gone.
 */
export function canCheckIn(missions: readonly { kind: string; qr_code: string | null; state: string }[], today: string = todayKst(), event: EventPeriod | null = null): boolean {
  return attendanceOpenOn(event, today) && missions.some((m) => m.kind === "attendance" && m.qr_code !== null && m.state === "available");
}
