import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db, one } from "./db";
import { clearSession, readSession, setSession } from "./session";
import type { Child, Staff } from "./types";
import { PIN_LOCK_MINUTES, PIN_MAX_FAILS, verifyPin } from "./pin";

export * from "./pin";

const CHILD_COLS = `id, name, class_id, birth_date, birth_year, gender, school, school_class, address, phone, guardian_phone, photo_url,
  best_friend_id, best_friend_name, has_phone, qr_token, onboarded_at, consent_on, photo_consent, memo, active,
  (pin_hash is not null) as has_pin`;

export async function childByToken(token: string): Promise<Child | null> {
  return one<Child>(db, `select ${CHILD_COLS} from children where qr_token = $1 and active`, [token]);
}

export type KidLoginResult = { ok: true; childId: number } | { ok: false; reason: "not_found" | "no_pin" | "locked" | "wrong"; left?: number };

/** QR token (something the child has) + PIN (something the child knows). Locks after repeated failures. */
export async function kidLogin(token: string, pin: string): Promise<KidLoginResult> {
  const row = await one<{ id: number; pin_hash: string | null; pin_fail_count: number; locked: boolean }>(
    db,
    "select id, pin_hash, pin_fail_count, (pin_locked_until is not null and pin_locked_until > now()) as locked from children where qr_token = $1 and active",
    [token],
  );
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.pin_hash) return { ok: false, reason: "no_pin" };
  if (row.locked) return { ok: false, reason: "locked" };
  if (!(await verifyPin(pin, row.pin_hash))) {
    const fails = row.pin_fail_count + 1;
    if (fails >= PIN_MAX_FAILS) {
      await db.query(`update children set pin_fail_count = 0, pin_locked_until = now() + interval '${PIN_LOCK_MINUTES} minutes' where id = $1`, [row.id]);
      return { ok: false, reason: "locked" };
    }
    await db.query("update children set pin_fail_count = $2 where id = $1", [row.id, fails]);
    return { ok: false, reason: "wrong", left: PIN_MAX_FAILS - fails };
  }
  await db.query("update children set pin_fail_count = 0, pin_locked_until = null where id = $1", [row.id]);
  await setSession("kid", row.id);
  return { ok: true, childId: row.id };
}

/** Cached per request: layouts, pages and actions in one request share a single lookup. */
export const getKid = cache(async (): Promise<Child | null> => {
  const id = await readSession("kid");
  if (!id) return null;
  return one<Child>(db, `select ${CHILD_COLS} from children where id = $1 and active`, [id]);
});

export async function requireKid(): Promise<Child> {
  const kid = await getKid();
  if (!kid) redirect("/login");
  if (!kid.onboarded_at) redirect(`/join/${kid.qr_token}`);
  return kid;
}

/** Cached per request, and read in one query (the teacher and their classes together). */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const id = await readSession("staff");
  if (!id) return null;
  return one<Staff>(
    db,
    `select s.id, s.name, s.role, s.can_attendance, s.can_visits, s.can_approve, s.can_view_all, s.can_read_pastor_worries, s.active,
            coalesce((select array_agg(sc.class_id) from staff_classes sc where sc.staff_id = s.id), '{}') as class_ids
       from staff s where s.id = $1 and s.active`,
    [id],
  );
});

export async function requireStaff(): Promise<Staff> {
  const s = await getStaff();
  if (!s) redirect("/staff/login");
  return s;
}

export async function requireAdmin(): Promise<Staff> {
  const s = await requireStaff();
  if (s.role !== "admin") redirect("/staff");
  return s;
}

export async function signOut(kind: "kid" | "staff") {
  await clearSession(kind);
}

export { setSession };
