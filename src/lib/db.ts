import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * One database interface, two drivers:
 * - DATABASE_URL set  -> node-postgres (Supabase or any Postgres) for production
 * - otherwise         -> PGlite, a file-backed Postgres in .data/ for local development and tests
 * Both accept the same SQL, so there is a single set of queries and migrations.
 */
export type Row = Record<string, unknown>;
export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}

type Driver = Db & { exec(sql: string): Promise<void>; kind: "pg" | "pglite" };

const g = globalThis as unknown as { __dreamDb?: Promise<Driver> };

async function createPg(url: string): Promise<Driver> {
  const { Pool, types } = await import("pg");
  // Keep DATE as 'YYYY-MM-DD' strings and counts as numbers, same as PGlite config below.
  types.setTypeParser(1082, (v: string) => v);
  types.setTypeParser(20, (v: string) => Number(v));
  const pool = new Pool({ connectionString: url, max: 5, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  return {
    kind: "pg",
    async query<T>(text: string, params: unknown[] = []) {
      const r = await pool.query(text, params);
      return r.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async tx<T>(fn: (q: Queryable) => Promise<T>) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn({
          async query<U>(text: string, params: unknown[] = []) {
            const r = await c.query(text, params);
            return r.rows as U[];
          },
        });
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

async function createPglite(): Promise<Driver> {
  const { PGlite, types } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const inMemory = dir === "memory";
  if (!inMemory) fs.mkdirSync(dir, { recursive: true });
  const parsers = { [types.DATE]: (v: string) => v, [types.INT8]: (v: string) => Number(v) };
  const pg = new PGlite(inMemory ? undefined : dir);
  const opts = { parsers };
  await pg.waitReady;
  return {
    kind: "pglite",
    async query<T>(text: string, params: unknown[] = []) {
      const r = await pg.query(text, params, opts);
      return r.rows as T[];
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async tx<T>(fn: (q: Queryable) => Promise<T>) {
      return (await pg.transaction(async (t) =>
        fn({
          async query<U>(text: string, params: unknown[] = []) {
            const r = await t.query(text, params, opts);
            return r.rows as U[];
          },
        }),
      )) as T;
    },
  };
}

const MIGRATION_LOCK = 727274;

async function pendingMigrations(q: Queryable): Promise<string[]> {
  const done = new Set((await q.query<{ name: string }>("select name from _migrations")).map((r) => r.name));
  const dir = path.join(process.cwd(), "migrations");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().filter((f) => !done.has(f));
}

/**
 * Applies new files from migrations/ once each. On Postgres the whole run happens on one connection
 * inside a transaction holding an advisory lock, so two servers starting together cannot both apply a file.
 */
async function migrate(d: Driver) {
  await d.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
  if ((await pendingMigrations(d)).length === 0) return;
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), "migrations", f), "utf8");
  if (d.kind === "pglite") {
    for (const f of await pendingMigrations(d)) {
      await d.exec(read(f));
      await d.query("insert into _migrations (name) values ($1)", [f]);
    }
    return;
  }
  const { Client } = await import("pg");
  const url = process.env.DATABASE_URL!;
  const c = new Client({ connectionString: url, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(`select pg_advisory_xact_lock(${MIGRATION_LOCK})`);
    const todo = await pendingMigrations({ query: async <T,>(t: string, p?: unknown[]) => (await c.query(t, p)).rows as T[] });
    for (const f of todo) {
      await c.query(read(f));
      await c.query("insert into _migrations (name) values ($1)", [f]);
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

/**
 * A new production database has no teachers, so nobody could sign in to invite the others.
 * When ADMIN_INVITE_CODE is set and the staff table is empty, create one admin who signs in
 * once at /staff/login?invite=<code>. The code stops working after that first sign-in.
 */
async function bootstrapAdmin(d: Driver) {
  const code = process.env.ADMIN_INVITE_CODE;
  if (!code) return;
  await d.query(
    `insert into staff (name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries, invite_code)
     select '관리자', 'admin', true, true, true, true, true, $1 where not exists (select 1 from staff)`,
    [code],
  );
}

async function init(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (!url && process.env.VERCEL) throw new Error("DATABASE_URL is required when deployed");
  const d = url ? await createPg(url) : await createPglite();
  await migrate(d);
  if (url) await bootstrapAdmin(d);
  if (!url && process.env.DREAM_SEED !== "off") {
    const { seedIfEmpty } = await import("./seed");
    await seedIfEmpty(d);
  }
  return d;
}

function driver(): Promise<Driver> {
  if (!g.__dreamDb) g.__dreamDb = init();
  return g.__dreamDb;
}

export const db: Db = {
  async query<T>(text: string, params?: unknown[]) {
    return (await driver()).query<T>(text, params);
  },
  async tx<T>(fn: (q: Queryable) => Promise<T>) {
    return (await driver()).tx(fn);
  },
};

export async function one<T = Row>(q: Queryable, text: string, params?: unknown[]): Promise<T | null> {
  const rows = await q.query<T>(text, params);
  return rows[0] ?? null;
}

/** For tests: drop the cached connection so a fresh in-memory database is created. */
export function resetDbForTests() {
  g.__dreamDb = undefined;
}
