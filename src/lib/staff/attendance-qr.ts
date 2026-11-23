import "server-only";
import { comingSunday, weeklyAttendanceCode } from "@/lib/attendance-code";
import { db } from "@/lib/db";
import { newToken } from "@/lib/pin";
import { isOpenOn, rotationFor } from "@/lib/plan";
import { todayKst, weekStart } from "@/lib/time";
import type { Mission, Staff } from "@/lib/types";
import { attendanceScope, audit, hasScope } from "./access";
import { deny, fail, type Result } from "./util";

/**
 * The attendance QR ("출석 QR"): the QR of the attendance mission that is open on the coming Sunday
 * (today, on a Sunday). Children scan it in the app ("출석 체크") or with the phone camera; the scan
 * marks them present and finishes the mission (src/lib/kid/qr.ts).
 * The QR is a new one every Sunday (src/lib/attendance-code.ts): `code` is the one for `sunday`.
 *
 * Anyone who takes attendance may show or print it. Turning it on for a mission that has no QR yet
 * is for admins, as it is on the mission form ("아이가 QR로 직접 출석").
 */
export interface AttendanceQr {
  /** The mission whose QR is shown, or null when no attendance mission has a QR yet. */
  mission: { id: number; title: string; code: string } | null;
  /** The mission an admin can turn the QR on for, when none has one. */
  canEnable: { id: number; title: string } | null;
  /** The Sunday the QR is for. */
  sunday: string;
}

async function attendanceMissions(date: string): Promise<Mission[]> {
  const rows = await db.query<Mission>("select * from missions where kind = 'attendance' and active order by (mode = 'fixed') desc, id");
  const rotation = rows.some((m) => m.mode === "pool") ? await rotationFor(db, weekStart(date)) : [];
  return rows.filter((m) => isOpenOn(m, date, rotation));
}

export async function attendanceQr(staff: Staff, today: string = todayKst()): Promise<AttendanceQr | null> {
  if (!hasScope(attendanceScope(staff))) return null;
  const sunday = comingSunday(today);
  const open = await attendanceMissions(sunday);
  const withQr = open.find((m) => m.qr_code !== null);
  const without = open[0];
  return {
    mission: withQr && withQr.qr_code ? { id: withQr.id, title: withQr.title, code: weeklyAttendanceCode(withQr.qr_code, sunday) } : null,
    canEnable: !withQr && without && staff.role === "admin" ? { id: without.id, title: without.title } : null,
    sunday,
  };
}

/** Admins only: gives the attendance mission a QR so children can check in by themselves. */
export async function enableAttendanceQr(staff: Staff, today: string = todayKst()): Promise<Result> {
  if (staff.role !== "admin") return deny;
  const state = await attendanceQr(staff, today);
  if (state?.mission) return { ok: true };
  if (!state?.canEnable) return fail("출석 미션이 없어요. 미션 계획에서 출석 미션을 먼저 만들어 주세요");
  await db.query("update missions set qr_code = $2 where id = $1 and qr_code is null", [state.canEnable.id, newToken(9)]);
  await audit(db, staff.id, "attendance_qr_on", "mission", state.canEnable.id);
  return { ok: true };
}
