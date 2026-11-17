import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isQrCode, scanQr } from "./qr";

/**
 * A child who scans a mission QR before signing in is sent to the sign-in screen. The scanned code
 * waits in this short-lived httpOnly cookie and is picked up after the PIN, so there is no
 * "return to" address in the URL that someone could point at another site.
 */
const NAME = "dream_scan";
const MAX_AGE = 60 * 10;

export async function rememberScan(code: string) {
  if (!isQrCode(code)) return;
  (await cookies()).set(NAME, code, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}

/** The waiting code, or null. Only ever turned into the fixed path /q/<code>. */
export async function pendingScan(): Promise<string | null> {
  const v = (await cookies()).get(NAME)?.value;
  return isQrCode(v) ? v : null;
}

export async function forgetScan() {
  (await cookies()).delete(NAME);
}

/**
 * Called by the sign-in actions right after the PIN is accepted. If a mission QR was scanned
 * before signing in, the scan is finished now and the child lands on its result; otherwise on the tree.
 * (The actions do this themselves instead of redirecting to /q/<code>: that address is a route
 * handler, which a server-action redirect cannot land on cleanly.)
 */
export async function afterSignInPath(childId: number): Promise<string> {
  const code = await pendingScan();
  if (!code) return "/home";
  await forgetScan();
  const r = await scanQr(childId, code);
  if (!r.ok) return `/q/${code}/info?why=${r.reason}`;
  revalidatePath("/missions");
  return `/missions/done/${r.completionId}`;
}
