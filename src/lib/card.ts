import "server-only";
import { cookies } from "next/headers";

/**
 * Remembers which QR card was last scanned on this device, so the PIN screen knows whose PIN to ask for.
 * The card alone is not enough to sign in; the PIN is still required.
 */
const NAME = "dream_card";

export async function rememberCard(token: string) {
  (await cookies()).set(NAME, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function readCard(): Promise<string | null> {
  return (await cookies()).get(NAME)?.value ?? null;
}

export async function forgetCard() {
  (await cookies()).delete(NAME);
}
