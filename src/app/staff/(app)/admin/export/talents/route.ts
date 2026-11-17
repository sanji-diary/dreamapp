import type { NextRequest } from "next/server";
import { getStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/staff/access";
import { talentsCsv } from "@/lib/staff/festival";
import { toInt } from "@/lib/staff/util";
import { todayKst } from "@/lib/time";

/**
 * 달란트 잔치 as a CSV file. ?event=<id>&kind=summary (one row per child: grant, spent, left)
 * or kind=log (every payment, cancellation and adjustment). Admins only; downloads are audited.
 */
export async function GET(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return new Response("로그인이 필요해요", { status: 401 });
  const id = toInt(req.nextUrl.searchParams.get("event"));
  const kind = req.nextUrl.searchParams.get("kind") === "log" ? "log" : "summary";
  const body = id === null ? null : await talentsCsv(staff, id, kind);
  if (body === null) return new Response(staff.role === "admin" ? "잔치를 찾을 수 없어요" : "권한이 없어요", { status: staff.role === "admin" ? 404 : 403 });
  await audit(db, staff.id, "export_talents", "talent_event", id, { kind });
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="talents-${kind}-${todayKst()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
