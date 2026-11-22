import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import type { Queryable } from "@/lib/db";
import { seedIfEmpty } from "@/lib/seed";

/**
 * tools/reset/reset-keep-admin.sql, run on a database built from migrations/ and filled with the
 * local example data plus a row in every table the example data leaves empty.
 */

const SCRIPT = fs.readFileSync(path.join(process.cwd(), "tools", "reset", "reset-keep-admin.sql"), "utf8");
const KEPT = ["staff", "settings", "_migrations"];

let pg: PGlite;
const q: Queryable = {
  async query<T>(text: string, params: unknown[] = []) {
    return (await pg.query(text, params)).rows as T[];
  },
};
const count = async (table: string) => (await q.query<{ n: number }>(`select count(*)::int as n from ${table}`))[0].n;
const tables = async () => (await q.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by tablename")).map((r) => r.tablename);

beforeEach(async () => {
  pg = new PGlite();
  await pg.waitReady;
  await pg.exec("create table _migrations (name text primary key, applied_at timestamptz not null default now())");
  for (const f of fs.readdirSync(path.join(process.cwd(), "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(fs.readFileSync(path.join(process.cwd(), "migrations", f), "utf8"));
    await q.query("insert into _migrations (name) values ($1)", [f]);
  }
  await seedIfEmpty(q);
  // The admin signed in with Kakao; another teacher still has an unused invite.
  await q.query("update staff set kakao_id = 'kakao-admin' where role = 'admin'");
  await q.query("update staff set invite_code = 'invite-basic' where role = 'basic'");

  const [child] = await q.query<{ id: number }>("select id from children order by id limit 1");
  const [mission] = await q.query<{ id: number }>("select id from missions order by id limit 1");
  const [worry] = await q.query<{ id: number }>("select id from worries order by id limit 1");
  const [post] = await q.query<{ id: number }>("select id from posts order by id limit 1");
  const [comment] = await q.query<{ id: number }>("select id from comments order by id limit 1");
  const [admin] = await q.query<{ id: number }>("select id from staff where role = 'admin'");
  await q.query("insert into mission_completions (mission_id, child_id, done_on, week_start) values ($1,$2,current_date,current_date)", [mission.id, child.id]);
  await q.query("insert into worry_replies (worry_id, staff_id, content) values ($1,$2,'답장')", [worry.id, admin.id]);
  await q.query("insert into worry_reads (worry_id, staff_id) values ($1,$2)", [worry.id, admin.id]);
  await q.query("insert into post_likes (post_id, child_id) values ($1,$2)", [post.id, child.id]);
  await q.query("insert into comment_reports (comment_id, child_id) values ($1,$2)", [comment.id, child.id]);
  await q.query("insert into badges (child_id, code) values ($1,'first')", [child.id]);
  await q.query("insert into uploads (purpose, child_id, mime, bytes) values ('profile',$1,'image/webp','\\x00')", [child.id]);
  await q.query("insert into audit_log (staff_id, action) values ($1,'test')", [admin.id]);
  await q.query("insert into quiz_attempts (child_id, mission_id) values ($1,$2)", [child.id, mission.id]);
  await q.query("insert into verse_progress (child_id, mission_id, period) values ($1,$2,'2026-11-15')", [child.id, mission.id]);
  const [ev] = await q.query<{ id: number }>("insert into talent_events (name, points_per_talent) values ('잔치', 10) returning id");
  await q.query("insert into talent_grants (event_id, child_id, points_at_open, talents) values ($1,$2,100,10)", [ev.id, child.id]);
  await q.query("insert into talent_ledger (event_id, child_id, delta, kind, reason) values ($1,$2,-1,'payment','과자')", [ev.id, child.id]);
});

describe("reset that keeps the admin", () => {
  it("starts from a database where every table has something in it", async () => {
    for (const t of await tables()) expect(await count(t), t).toBeGreaterThan(0);
  });

  it("leaves only the admin account, the settings and the migration record", async () => {
    const settingsBefore = await q.query("select key, value from settings order by key");
    const [{ max: lastChild }] = await q.query<{ max: number }>("select max(id) as max from children");
    await pg.exec(SCRIPT);

    for (const t of await tables()) {
      if (!KEPT.includes(t)) expect(await count(t), t).toBe(0);
    }
    expect(await q.query("select name, role, kakao_id from staff")).toEqual([{ name: "김인성", role: "admin", kakao_id: "kakao-admin" }]);
    expect(await q.query("select key, value from settings order by key")).toEqual(settingsBefore);
    expect(await count("_migrations")).toBe(fs.readdirSync(path.join(process.cwd(), "migrations")).filter((f) => f.endsWith(".sql")).length);

    // Numbers carry on, so an old sign-in cookie never points at someone new.
    const [fresh] = await q.query<{ id: number }>("insert into children (name, qr_token) values ('새 아이', 'fresh-token') returning id");
    expect(fresh.id).toBeGreaterThan(lastChild);
  });

  it("can be run again on an emptied database", async () => {
    await pg.exec(SCRIPT);
    await pg.exec(SCRIPT);
    expect(await count("staff")).toBe(1);
    expect(await count("children")).toBe(0);
  });

  it("stops and deletes nothing when no admin could sign in afterwards", async () => {
    await q.query("update staff set kakao_id = null, invite_code = null where role = 'admin'");
    const before = await count("children");
    await expect(pg.exec(SCRIPT)).rejects.toThrow(/관리자 계정이 없어서/);
    await pg.exec("rollback");
    expect(await count("children")).toBe(before);
    expect(await count("staff")).toBe(4);
  });

  it("stops and deletes nothing when a table is missing from the list", async () => {
    await pg.exec("create table extra_notes (id serial primary key, body text); insert into extra_notes (body) values ('남아 있어요')");
    const before = await count("children");
    await expect(pg.exec(SCRIPT)).rejects.toThrow(/extra_notes/);
    await pg.exec("rollback");
    expect(await count("children")).toBe(before);
    expect(await count("extra_notes")).toBe(1);
  });
});
