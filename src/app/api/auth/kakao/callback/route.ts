import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { setSession } from "@/lib/auth";
import { INVITE_COOKIE, STATE_COOKIE, appOrigin, kakaoConfigured, kakaoUserId, resolveKakaoStaff } from "@/lib/staff/kakao";

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Kakao sends the teacher back here with ?code and ?state after they agree to sign in. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value ?? "";
  const invite = jar.get(INVITE_COOKIE)?.value ?? null;
  // Both cookies are single-use.
  jar.delete(STATE_COOKIE);
  jar.delete(INVITE_COOKIE);

  if (!kakaoConfigured()) redirect("/staff/login?error=config");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) redirect("/staff/login?error=cancelled");
  // The state must match the cookie set when the sign-in started (CSRF protection).
  if (!expected || !state || !same(state, expected) || !code) redirect("/staff/login?error=state");

  const kakaoId = await kakaoUserId(code, appOrigin(url.origin));
  if (!kakaoId) redirect("/staff/login?error=kakao");

  const r = await resolveKakaoStaff(kakaoId, invite);
  if (!r.ok) redirect(`/staff/login?error=${r.reason}`);
  await setSession("staff", r.staffId);
  redirect("/staff");
}
