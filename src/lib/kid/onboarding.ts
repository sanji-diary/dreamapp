import "server-only";
import { db, one, type Queryable } from "@/lib/db";
import { ensureTree } from "@/lib/game";
import { hashPin, isValidPin, newToken } from "@/lib/pin";
import { joinCodeOpen } from "@/lib/self-join";
import { todayKst } from "@/lib/time";
import { isBirthYear } from "./birth";

/**
 * What the join wizard sends: name, gender, birth year, school, church class, then the PIN twice.
 * Everything is untrusted and checked again here. Phone numbers, address and friends are not asked
 * of the child any more; a teacher may add them on the profile.
 */
export interface OnboardingInput {
  name: string;
  gender: string;
  birthYear: number;
  school: string;
  /** Church class. null = "I don't know": a teacher assigns it later. */
  classId: number | null;
  pin: string;
  pin2: string;
}

export type OnboardingField = "name" | "gender" | "birth" | "school" | "classId" | "pin" | "pin2";
export type OnboardingErrors = Partial<Record<OnboardingField, string>>;

export interface OnboardingData {
  name: string;
  gender: "M" | "F";
  birthYear: number;
  school: string;
  classId: number | null;
  pin: string;
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export function validatePins(pin: unknown, pin2: unknown): OnboardingErrors {
  const errors: OnboardingErrors = {};
  if (typeof pin !== "string" || !isValidPin(pin)) errors.pin = "숫자 4개로 만들어 주세요";
  else if (pin !== pin2) errors.pin2 = "두 번 누른 숫자가 달라요";
  return errors;
}

/** Everything that can be checked without the database. Whether the class exists is checked by the callers. */
export function validateOnboarding(input: OnboardingInput, today: string = todayKst()): { ok: true; data: OnboardingData } | { ok: false; errors: OnboardingErrors } {
  const errors: OnboardingErrors = validatePins(input?.pin, input?.pin2);
  const name = text(input?.name);
  if (name.length < 2 || name.length > 10) errors.name = "이름을 2글자에서 10글자로 적어 주세요";
  const gender = input?.gender === "M" || input?.gender === "F" ? input.gender : null;
  if (!gender) errors.gender = "하나를 골라 주세요";
  // Grades 4-6 are 9 to 13 years old; allow a little room on both sides.
  const thisYear = Number(today.slice(0, 4));
  const birthYear = isBirthYear(input?.birthYear, thisYear) ? input.birthYear : null;
  if (birthYear === null) errors.birth = "태어난 해를 골라 주세요";
  const school = text(input?.school);
  if (school.length < 2 || school.length > 40) errors.school = "학교 이름을 적어 주세요";
  const rawClass = input?.classId ?? null;
  const classId = rawClass === null ? null : typeof rawClass === "number" && Number.isInteger(rawClass) && rawClass > 0 ? rawClass : undefined;
  if (classId === undefined) errors.classId = "반을 다시 골라 주세요";

  if (Object.keys(errors).length > 0 || birthYear === null || !gender || classId === undefined) return { ok: false, errors };
  return { ok: true, data: { name, gender, birthYear, school, classId, pin: input.pin } };
}

async function classOk(q: Queryable, classId: number | null): Promise<boolean> {
  if (classId === null) return true;
  return (await one(q, "select 1 as x from classes where id = $1 and not archived", [classId])) !== null;
}

const BAD_CLASS = { ok: false, reason: "invalid", errors: { classId: "반을 다시 골라 주세요" } } as const;

export type SaveResult = { ok: true; childId: number } | { ok: false; reason: "not_found" | "already" | "invalid"; errors?: OnboardingErrors };

/**
 * Finishes the first-time setup for the child who holds this QR card.
 * Only works once: a card whose child already has a PIN cannot be re-registered by someone else.
 * A class a teacher already chose stays: the child's answer is used only when there is none, so a
 * child cannot move themselves to another class. Parental consent does not block joining:
 * teachers track it on the profile ("동의서 확인 필요").
 */
export async function saveOnboarding(token: string, input: OnboardingInput): Promise<SaveResult> {
  const child = await one<{ id: number; has_pin: boolean }>(db, "select id, (pin_hash is not null) as has_pin from children where qr_token = $1 and active", [typeof token === "string" ? token : ""]);
  if (!child) return { ok: false, reason: "not_found" };
  if (child.has_pin) return { ok: false, reason: "already" };
  const v = validateOnboarding(input);
  if (!v.ok) return { ok: false, reason: "invalid", errors: v.errors };
  const d = v.data;
  if (!(await classOk(db, d.classId))) return BAD_CLASS;
  const pinHash = await hashPin(d.pin);
  const saved = await db.tx(async (q) => {
    const rows = await q.query<{ id: number }>(
      `update children set name = $2, gender = $3, birth_year = $4, school = $5, class_id = coalesce(class_id, $6),
         pin_hash = $7, pin_fail_count = 0, pin_locked_until = null, onboarded_at = now()
       where id = $1 and pin_hash is null returning id`,
      [child.id, d.name, d.gender, d.birthYear, d.school, d.classId, pinHash],
    );
    if (rows.length === 0) return false;
    await ensureTree(q, child.id);
    return true;
  });
  if (!saved) return { ok: false, reason: "already" };
  return { ok: true, childId: child.id };
}

/** At most this many brand-new children may register themselves within one hour. */
export const SELF_JOIN_HOURLY_LIMIT = 40;

export type SelfJoinResult =
  | { ok: true; childId: number; token: string; claimed: boolean }
  | { ok: false; reason: "closed" | "busy" | "invalid"; errors?: OnboardingErrors };

/**
 * A child registers without a teacher creating them first, through the shared QR (/start/<code>).
 * - closed: the code is not the current one, or self-join is switched off.
 * - busy: too many new children in the last hour (someone may be flooding the form).
 * When exactly one active child with this name is still waiting to start (a teacher pre-registered
 * them: no PIN, never onboarded), that record is filled in instead of making a duplicate. With no
 * such record, or more than one, a new child is made with a fresh card token.
 */
export async function selfRegister(code: string, input: OnboardingInput): Promise<SelfJoinResult> {
  if (!(await joinCodeOpen(code))) return { ok: false, reason: "closed" };
  const v = validateOnboarding(input);
  if (!v.ok) return { ok: false, reason: "invalid", errors: v.errors };
  const d = v.data;
  if (!(await classOk(db, d.classId))) return BAD_CLASS;
  const pinHash = await hashPin(d.pin);
  return db.tx<SelfJoinResult>(async (q) => {
    // Checked again inside the transaction: the code may have been reissued or switched off meanwhile.
    if (!(await joinCodeOpen(code, q))) return { ok: false, reason: "closed" };
    const waiting = await q.query<{ id: number }>("select id from children where active and name = $1 and pin_hash is null and onboarded_at is null", [d.name]);
    if (waiting.length === 1) {
      const rows = await q.query<{ id: number; qr_token: string }>(
        `update children set gender = $2, birth_year = $3, school = $4, class_id = coalesce(class_id, $5),
           pin_hash = $6, pin_fail_count = 0, pin_locked_until = null, onboarded_at = now(), self_joined = true
         where id = $1 and pin_hash is null and onboarded_at is null returning id, qr_token`,
        [waiting[0].id, d.gender, d.birthYear, d.school, d.classId, pinHash],
      );
      if (rows.length === 1) {
        await ensureTree(q, rows[0].id);
        return { ok: true, childId: rows[0].id, token: rows[0].qr_token, claimed: true };
      }
    }
    const recent = await one<{ n: number }>(q, "select count(*)::int as n from children where self_joined and created_at > now() - interval '1 hour'");
    if ((recent?.n ?? 0) >= SELF_JOIN_HOURLY_LIMIT) return { ok: false, reason: "busy" };
    const rows = await q.query<{ id: number; qr_token: string }>(
      `insert into children (name, gender, birth_year, school, class_id, qr_token, pin_hash, onboarded_at, self_joined)
       values ($1, $2, $3, $4, $5, $6, $7, now(), true) returning id, qr_token`,
      [d.name, d.gender, d.birthYear, d.school, d.classId, newToken(), pinHash],
    );
    await ensureTree(q, rows[0].id);
    return { ok: true, childId: rows[0].id, token: rows[0].qr_token, claimed: false };
  });
}

/** A teacher cleared the PIN of a child who had already joined: the child only makes a new PIN. */
export async function saveNewPin(token: string, pin: string, pin2: string): Promise<SaveResult> {
  const errors = validatePins(pin, pin2);
  if (Object.keys(errors).length > 0) return { ok: false, reason: "invalid", errors };
  const pinHash = await hashPin(pin);
  const rows = await db.query<{ id: number }>(
    `update children set pin_hash = $2, pin_fail_count = 0, pin_locked_until = null
     where qr_token = $1 and active and pin_hash is null and onboarded_at is not null returning id`,
    [typeof token === "string" ? token : "", pinHash],
  );
  if (rows.length === 0) return { ok: false, reason: "already" };
  return { ok: true, childId: rows[0].id };
}

/** Church classes a child may pick in the wizard. Names only. */
export async function classChoices(): Promise<{ id: number; name: string }[]> {
  return db.query<{ id: number; name: string }>("select id, name from classes where not archived order by sort, id");
}
