import { db } from "@/lib/db";

/**
 * Deployment check. Shows only whether each setting exists and simple counts:
 * no values, no names, no personal data.
 */
export async function GET() {
  const settings = {
    session_secret: Boolean(process.env.SESSION_SECRET),
    app_url: Boolean(process.env.APP_URL),
    kakao_key: Boolean(process.env.KAKAO_REST_API_KEY),
    admin_invite_code: Boolean(process.env.ADMIN_INVITE_CODE),
  };
  try {
    const m = await db.query<{ n: number }>("select count(*)::int as n from _migrations");
    const s = await db.query<{ total: number; waiting: number; linked: number }>(
      "select count(*)::int as total, count(invite_code)::int as waiting, count(kakao_id)::int as linked from staff",
    );
    return Response.json({
      ok: true,
      database: process.env.DATABASE_URL ? "postgres" : "local",
      migrations: m[0]?.n ?? 0,
      settings,
      staff: { total: s[0]?.total ?? 0, invites_waiting: s[0]?.waiting ?? 0, kakao_linked: s[0]?.linked ?? 0 },
    });
  } catch (e) {
    console.error("health check failed", e);
    return Response.json({ ok: false, error: "database", settings }, { status: 500 });
  }
}
