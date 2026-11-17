import { db } from "@/lib/db";

/**
 * Deployment check. Shows only whether each setting exists, simple counts and timings:
 * no values, no names, no personal data.
 */
export async function GET() {
  const settings = {
    session_secret: Boolean(process.env.SESSION_SECRET),
    app_url: Boolean(process.env.APP_URL),
    kakao_key: Boolean(process.env.KAKAO_REST_API_KEY),
    kakao_client_secret: Boolean(process.env.KAKAO_CLIENT_SECRET),
    admin_invite_code: Boolean(process.env.ADMIN_INVITE_CODE),
  };
  // Where the server runs and how long one database round trip takes. A slow round trip
  // usually means the server and the database are in different parts of the world.
  const server_region = process.env.VERCEL_REGION ?? "local";
  let database_region = "unknown";
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    database_region = /([a-z]{2}-[a-z]+-\d)/.exec(host)?.[1] ?? "unknown";
  } catch {}
  try {
    const first = Date.now();
    const m = await db.query<{ n: number }>("select count(*)::int as n from _migrations");
    const first_query_ms = Date.now() - first;
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = Date.now();
      await db.query("select 1");
      times.push(Date.now() - t);
    }
    const s = await db.query<{ total: number; waiting: number; linked: number }>(
      "select count(*)::int as total, count(invite_code)::int as waiting, count(kakao_id)::int as linked from staff",
    );
    return Response.json({
      ok: true,
      database: process.env.DATABASE_URL ? "postgres" : "local",
      migrations: m[0]?.n ?? 0,
      speed: { server_region, database_region, first_query_ms, query_ms: times },
      settings,
      staff: { total: s[0]?.total ?? 0, invites_waiting: s[0]?.waiting ?? 0, kakao_linked: s[0]?.linked ?? 0 },
    });
  } catch (e) {
    console.error("health check failed", e);
    return Response.json({ ok: false, error: "database", speed: { server_region, database_region }, settings }, { status: 500 });
  }
}
