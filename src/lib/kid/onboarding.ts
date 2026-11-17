import "server-only";
import { db, one } from "@/lib/db";
import { ensureTree } from "@/lib/game";
import { hashPin, isValidPin } from "@/lib/pin";
import { todayKst } from "@/lib/time";
import { parseBirth, phoneDigits } from "./korean";

/** What the join wizard sends. Everything is untrusted and checked again here. */
export interface OnboardingInput {
  birth: string;
  gender: string;
  school: string;
  schoolClass: string;
  hasPhone: boolean;
  phone: string;
  guardianPhone: string;
  address: string;
  friendId: number | null;
  friendName: string;
  pin: string;
  pin2: string;
}

export type OnboardingField = "birth" | "gender" | "school" | "schoolClass" | "phone" | "guardianPhone" | "address" | "friend" | "pin" | "pin2";
export type OnboardingErrors = Partial<Record<OnboardingField, string>>;

export interface OnboardingData {
  birth: string;
  gender: "M" | "F";
  school: string;
  schoolClass: string;
  hasPhone: boolean;
  phone: string | null;
  guardianPhone: string | null;
  address: string | null;
  friendId: number | null;
  friendName: string | null;
  pin: string;
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

export function validatePins(pin: unknown, pin2: unknown): OnboardingErrors {
  const errors: OnboardingErrors = {};
  if (typeof pin !== "string" || !isValidPin(pin)) errors.pin = "숫자 4개로 만들어 주세요";
  else if (pin !== pin2) errors.pin2 = "두 번 누른 숫자가 달라요";
  return errors;
}

export function validateOnboarding(input: OnboardingInput, today: string = todayKst()): { ok: true; data: OnboardingData } | { ok: false; errors: OnboardingErrors } {
  const errors: OnboardingErrors = validatePins(input?.pin, input?.pin2);
  const birth = parseBirth(typeof input?.birth === "string" ? input.birth : "", today);
  if (!birth) errors.birth = "생년월일을 다시 확인해 주세요";
  const gender = input?.gender === "M" || input?.gender === "F" ? input.gender : null;
  if (!gender) errors.gender = "하나를 골라 주세요";
  const school = text(input?.school, 40);
  if (school.length < 2) errors.school = "학교 이름을 적어 주세요";
  const schoolClass = text(input?.schoolClass, 20);
  if (!schoolClass) errors.schoolClass = "학년과 반을 알려 주세요";

  const hasPhone = input?.hasPhone !== false;
  let phone: string | null = null;
  if (hasPhone) {
    phone = phoneDigits(typeof input?.phone === "string" ? input.phone : "");
    if (!phone) errors.phone = "전화번호를 다시 확인해 주세요";
  }
  let guardianPhone: string | null = null;
  const guardianRaw = text(input?.guardianPhone, 20);
  if (guardianRaw) {
    guardianPhone = phoneDigits(guardianRaw);
    if (!guardianPhone) errors.guardianPhone = "전화번호를 다시 확인해 주세요";
  }
  const address = text(input?.address, 120) || null;
  const friendId = typeof input?.friendId === "number" && Number.isInteger(input.friendId) && input.friendId > 0 ? input.friendId : null;
  const friendName = friendId ? null : text(input?.friendName, 20) || null;

  if (Object.keys(errors).length > 0 || !birth || !gender) return { ok: false, errors };
  return { ok: true, data: { birth, gender, school, schoolClass, hasPhone, phone, guardianPhone, address, friendId, friendName, pin: input.pin } };
}

export type SaveResult = { ok: true; childId: number } | { ok: false; reason: "not_found" | "no_consent" | "already" | "invalid"; errors?: OnboardingErrors };

/**
 * Finishes the first-time setup for the child who holds this QR card.
 * Only works once: a card whose child already has a PIN cannot be re-registered by someone else.
 * Guardian phone and address were possibly entered by a teacher, so a skipped answer keeps what is there.
 */
export async function saveOnboarding(token: string, input: OnboardingInput): Promise<SaveResult> {
  const child = await one<{ id: number; consent_on: string | null; has_pin: boolean }>(
    db,
    "select id, consent_on, (pin_hash is not null) as has_pin from children where qr_token = $1 and active",
    [typeof token === "string" ? token : ""],
  );
  if (!child) return { ok: false, reason: "not_found" };
  if (!child.consent_on) return { ok: false, reason: "no_consent" };
  if (child.has_pin) return { ok: false, reason: "already" };
  const v = validateOnboarding(input);
  if (!v.ok) return { ok: false, reason: "invalid", errors: v.errors };
  const d = v.data;
  if (d.friendId !== null) {
    const friend = await one(db, "select id from children where id = $1 and active and id <> $2", [d.friendId, child.id]);
    if (!friend) return { ok: false, reason: "invalid", errors: { friend: "친구를 다시 골라 주세요" } };
  }
  const pinHash = await hashPin(d.pin);
  const saved = await db.tx(async (q) => {
    const rows = await q.query<{ id: number }>(
      `update children set birth_date = $2, gender = $3, school = $4, school_class = $5, has_phone = $6, phone = $7,
         guardian_phone = coalesce($8, guardian_phone), address = coalesce($9, address),
         best_friend_id = $10, best_friend_name = $11, pin_hash = $12, pin_fail_count = 0, pin_locked_until = null, onboarded_at = now()
       where id = $1 and pin_hash is null returning id`,
      [child.id, d.birth, d.gender, d.school, d.schoolClass, d.hasPhone, d.phone, d.guardianPhone, d.address, d.friendId, d.friendName, pinHash],
    );
    if (rows.length === 0) return false;
    await ensureTree(q, child.id);
    return true;
  });
  if (!saved) return { ok: false, reason: "already" };
  return { ok: true, childId: child.id };
}

/** A teacher cleared the PIN of a child who had already joined: the child only makes a new PIN. */
export async function saveNewPin(token: string, pin: string, pin2: string): Promise<SaveResult> {
  const errors = validatePins(pin, pin2);
  if (Object.keys(errors).length > 0) return { ok: false, reason: "invalid", errors };
  const pinHash = await hashPin(pin);
  const rows = await db.query<{ id: number }>(
    `update children set pin_hash = $2, pin_fail_count = 0, pin_locked_until = null
     where qr_token = $1 and active and pin_hash is null and onboarded_at is not null and consent_on is not null returning id`,
    [typeof token === "string" ? token : "", pinHash],
  );
  if (rows.length === 0) return { ok: false, reason: "already" };
  return { ok: true, childId: rows[0].id };
}

/** Names for the "best friend at church" step. Names only; nothing else about other children leaves the server. */
export async function friendChoices(exceptChildId: number): Promise<{ id: number; name: string }[]> {
  return db.query<{ id: number; name: string }>("select id, name from children where active and id <> $1 order by name", [exceptChildId]);
}
