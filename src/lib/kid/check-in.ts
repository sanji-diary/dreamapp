import { isSunday, todayKst } from "@/lib/time";

/**
 * Whether the tree screen offers "출석 체크" today: it is Sunday, and an attendance mission with a QR
 * is still waiting for this child. After the scan (or once a teacher has marked the child) it is gone.
 */
export function canCheckIn(missions: readonly { kind: string; qr_code: string | null; state: string }[], today: string = todayKst()): boolean {
  return isSunday(today) && missions.some((m) => m.kind === "attendance" && m.qr_code !== null && m.state === "available");
}
