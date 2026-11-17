import { getStaff } from "@/lib/auth";
import { attendanceCsv } from "@/lib/staff/admin-misc";
import { audit } from "@/lib/staff/access";
import { db } from "@/lib/db";
import { todayKst } from "@/lib/time";

/** Attendance of the last 26 Sundays as a CSV file. Admins only; each download is written to the audit log. */
export async function GET() {
  const staff = await getStaff();
  if (!staff) return new Response("로그인이 필요해요", { status: 401 });
  const body = await attendanceCsv(staff);
  if (body === null) return new Response("권한이 없어요", { status: 403 });
  await audit(db, staff.id, "export_attendance", "export", null);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="attendance-${todayKst()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
