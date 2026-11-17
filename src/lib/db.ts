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

type Driver = Db & { exec(sql: string): Promise<void> };

const g = globalThis as unknown as { __dreamDb?: Promise<Driver> };

async function createPg(url: string): Promise<Driver> {
  const { Pool, types } = await import("pg");
  // Keep DATE as 'YYYY-MM-DD' strings and counts as numbers, same as PGlite config below.
  types.setTypeParser(1082, (v: string) => v);
  types.setTypeParser(20, (v: string) => Number(v));
  const pool = new Pool({ connectionString: url, max: 5, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  return {
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

async function migrate(d: Driver) {
  await d.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await d.query<{ name: string }>("select name from _migrations")).map((r) => r.name));
  const dir = path.join(process.cwd(), "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    await d.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    await d.query("insert into _migrations (name) values ($1)", [f]);
  }
}

async function init(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  const d = url ? await createPg(url) : await createPglite();
  await migrate(d);
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
