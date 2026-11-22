import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

/**
 * migrations/008_rls.sql: every table keeps the Supabase REST API out. The database here is set up
 * like Supabase's: API roles that are granted everything in the public schema by default.
 */

const DIR = path.join(process.cwd(), "migrations");
const files = () => fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

async function build(supabaseRoles: boolean): Promise<PGlite> {
  const pg = new PGlite();
  await pg.waitReady;
  if (supabaseRoles) {
    await pg.exec(`
      create role anon nologin;
      create role authenticated nologin;
      grant usage on schema public to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant all on sequences to anon, authenticated;`);
  }
  // As the server does: _migrations first, then every file in order.
  await pg.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
  for (const f of files()) {
    await pg.exec(fs.readFileSync(path.join(DIR, f), "utf8"));
    await pg.query("insert into _migrations (name) values ($1)", [f]);
  }
  return pg;
}

const tablesWithoutRls = async (pg: PGlite) =>
  (await pg.query<{ relname: string }>("select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity order by 1")).rows.map((r) => r.relname);

describe("row level security", () => {
  it("is on for every table after all migrations (a table added later without it fails here)", async () => {
    const pg = await build(false);
    const all = (await pg.query<{ n: number }>("select count(*)::int as n from pg_tables where schemaname = 'public'")).rows[0].n;
    expect(all).toBeGreaterThan(30);
    expect(await tablesWithoutRls(pg)).toEqual([]);
  });

  it("keeps the Supabase API roles away from the data, while the owner (the app) works as before", async () => {
    const pg = await build(true);
    await pg.query("insert into classes (name, grade) values ('5학년 1반', 5)");
    await pg.query("insert into children (name, qr_token) values ('가은', 'tok-1')");

    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await expect(pg.query("select name from children")).rejects.toThrow(/permission denied/);
      await expect(pg.query("insert into children (name, qr_token) values ('나은', 'tok-2')")).rejects.toThrow(/permission denied/);
      await pg.exec("reset role");
    }
    // Even with a right given back by mistake, row level security still shows no rows.
    await pg.exec("grant select on children to anon");
    await pg.exec("set role anon");
    expect((await pg.query("select name from children")).rows).toEqual([]);
    await pg.exec("reset role");

    expect((await pg.query<{ name: string }>("select name from children")).rows).toEqual([{ name: "가은" }]);
  });

  it("takes the API roles' rights away for tables made after it, too", async () => {
    const pg = await build(true);
    await pg.exec("create table later_table (id serial primary key, body text); insert into later_table (body) values ('나중');");
    await pg.exec("set role anon");
    await expect(pg.query("select body from later_table")).rejects.toThrow(/permission denied/);
    await pg.exec("reset role");
  });
});
