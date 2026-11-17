import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db, type Queryable } from "./db";
import { newToken } from "./pin";

/**
 * The one QR every child may scan to register themselves (/start/<code>).
 * Both values live in the settings table: 'join_code' (a string) and 'self_join_on' (a boolean, on unless switched off).
 */
export interface SelfJoinState {
  on: boolean;
  code: string | null;
}

export async function selfJoinState(q: Queryable = db): Promise<SelfJoinState> {
  const rows = await q.query<{ key: string; value: unknown }>("select key, value from settings where key in ('join_code', 'self_join_on')");
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const code = m.get("join_code");
  return { on: m.get("self_join_on") !== false, code: typeof code === "string" && code.length >= 8 ? code : null };
}

export function newJoinCode(): string {
  return newToken(9);
}

/** The current code, made on first need. Two servers asking at once end up with the same one. */
export async function ensureJoinCode(): Promise<string> {
  const cur = await selfJoinState();
  if (cur.code) return cur.code;
  await db.query("insert into settings (key, value) values ('join_code', $1) on conflict (key) do nothing", [JSON.stringify(newJoinCode())]);
  const again = await selfJoinState();
  if (!again.code) throw new Error("join code could not be created");
  return again.code;
}

/** True only when self-join is switched on and this is the current code. */
export async function joinCodeOpen(code: unknown, q: Queryable = db): Promise<boolean> {
  if (typeof code !== "string" || code.length < 8 || code.length > 64) return false;
  const s = await selfJoinState(q);
  if (!s.on || !s.code) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(s.code);
  return a.length === b.length && timingSafeEqual(a, b);
}
