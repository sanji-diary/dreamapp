import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type SessionKind = "kid" | "staff";
const COOKIE: Record<SessionKind, string> = { kid: "dream_kid", staff: "dream_staff" };
const MAX_AGE: Record<SessionKind, number> = { kid: 60 * 60 * 24 * 180, staff: 60 * 60 * 24 * 30 };

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
    return new TextEncoder().encode("dev-only-secret-do-not-use-in-production");
  }
  return new TextEncoder().encode(s);
}

export async function setSession(kind: SessionKind, id: number) {
  const token = await new SignJWT({ kind, id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + MAX_AGE[kind])
    .sign(secret());
  (await cookies()).set(COOKIE[kind], token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE[kind],
  });
}

export async function readSession(kind: SessionKind): Promise<number | null> {
  const token = (await cookies()).get(COOKIE[kind])?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.kind !== kind || typeof payload.id !== "number") return null;
    return payload.id;
  } catch {
    return null;
  }
}

export async function clearSession(kind: SessionKind) {
  (await cookies()).delete(COOKIE[kind]);
}
