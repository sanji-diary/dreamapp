import { db } from "@/lib/db";

/** Deployment check: confirms the server can reach the database and the schema is in place. No personal data. */
export async function GET() {
  try {
    const rows = await db.query<{ n: number }>("select count(*)::int as n from _migrations");
    return Response.json({ ok: true, database: process.env.DATABASE_URL ? "postgres" : "local", migrations: rows[0]?.n ?? 0 });
  } catch (e) {
    console.error("health check failed", e);
    return Response.json({ ok: false, error: "database" }, { status: 500 });
  }
}
