import "server-only";
import { db, one } from "@/lib/db";

/**
 * Kakao sign-in for teachers (OAuth 2.0 authorization code flow, written by hand).
 * Only the numeric Kakao user id is used; no profile, e-mail or other consent item is requested.
 */
export const STATE_COOKIE = "dream_kakao_state";
export const INVITE_COOKIE = "dream_staff_invite";

export function kakaoConfigured(): boolean {
  return Boolean(process.env.KAKAO_REST_API_KEY);
}

/** The dev sign-in exists only outside production and only while Kakao is not configured. */
export function devLoginAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && !kakaoConfigured();
}

export function appOrigin(requestOrigin?: string): string {
  const env = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return env || requestOrigin || "http://localhost:3000";
}

export function redirectUri(origin: string): string {
  return `${origin}/api/auth/kakao/callback`;
}

export function authorizeUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    state,
  });
  return `https://kauth.kakao.com/oauth/authorize?${p}`;
}

export type KakaoIdResult = { id: string } | { id: null; errorCode: string };

/** Kakao error bodies carry a short code such as KOE010; keep only that, never tokens or keys. */
async function kakaoErrorCode(res: Response, step: string): Promise<string> {
  let code = "";
  try {
    const j = (await res.json()) as { error_code?: unknown; error?: unknown; code?: unknown };
    code = String(j.error_code ?? j.error ?? j.code ?? "");
  } catch {}
  const safe = /^[A-Za-z0-9_-]{1,30}$/.test(code) ? code : `HTTP${res.status}`;
  console.error(`kakao ${step} failed: ${res.status} ${safe}`);
  return safe;
}

/** Exchanges the code for a token and returns the Kakao user id, or the Kakao error code when a step fails. */
export async function kakaoUserId(code: string, origin: string): Promise<KakaoIdResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.KAKAO_REST_API_KEY ?? "",
    redirect_uri: redirectUri(origin),
    code,
  });
  if (process.env.KAKAO_CLIENT_SECRET) body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  try {
    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body,
      cache: "no-store",
    });
    if (!tokenRes.ok) return { id: null, errorCode: await kakaoErrorCode(tokenRes, "token") };
    const token = (await tokenRes.json()) as { access_token?: unknown };
    if (typeof token.access_token !== "string") return { id: null, errorCode: "NO_TOKEN" };
    const meRes = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    if (!meRes.ok) return { id: null, errorCode: await kakaoErrorCode(meRes, "user") };
    const me = (await meRes.json()) as { id?: unknown };
    if (typeof me.id !== "number" && typeof me.id !== "string") return { id: null, errorCode: "NO_ID" };
    const id = String(me.id);
    return /^\d{1,30}$/.test(id) ? { id } : { id: null, errorCode: "BAD_ID" };
  } catch (e) {
    console.error("kakao request failed", e);
    return { id: null, errorCode: "NETWORK" };
  }
}

export type KakaoSignIn = { ok: true; staffId: number } | { ok: false; reason: "not_invited" | "inactive" };

/**
 * Finds the teacher for a Kakao id. A known id signs in (unless switched off).
 * An unknown id needs a valid invite code: the id is bound to that staff row and the code is used up.
 */
export async function resolveKakaoStaff(kakaoId: string, invite: string | null): Promise<KakaoSignIn> {
  const known = await one<{ id: number; active: boolean }>(db, "select id, active from staff where kakao_id = $1", [kakaoId]);
  if (known) return known.active ? { ok: true, staffId: known.id } : { ok: false, reason: "inactive" };
  if (!invite) return { ok: false, reason: "not_invited" };
  // One statement, so two people cannot both claim the same invite.
  const bound = await db.query<{ id: number }>("update staff set kakao_id = $1, invite_code = null where invite_code = $2 and kakao_id is null and active returning id", [kakaoId, invite]);
  if (bound.length === 0) return { ok: false, reason: "not_invited" };
  await db.query("insert into audit_log (staff_id, action, target_type, target_id) values ($1, 'staff_invite_accept', 'staff', $1)", [bound[0].id]);
  return { ok: true, staffId: bound[0].id };
}

/** Name to greet on the login page for a valid, unused invite. */
export async function inviteName(invite: string): Promise<string | null> {
  const r = await one<{ name: string }>(db, "select name from staff where invite_code = $1 and kakao_id is null and active", [invite]);
  return r?.name ?? null;
}
