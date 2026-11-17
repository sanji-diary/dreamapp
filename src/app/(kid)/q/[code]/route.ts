import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getKid } from "@/lib/auth";
import { isQrCode, scanQr } from "@/lib/kid/qr";
import { forgetScan, rememberScan } from "@/lib/kid/scan-cookie";

/**
 * Where a mission QR posted at church lands: /q/<code>.
 *
 * This is a route handler rather than a page because it has to set and clear a cookie. A child
 * who is not signed in yet goes to the sign-in screen with the code kept in a short-lived cookie
 * and is brought back here after the PIN. Every outcome redirects to a fixed path of this app.
 * Opening the link a second time only shows "이미 했어요", so a repeated or pre-loaded GET is harmless.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!isQrCode(code)) redirect("/q/unknown/info?why=unknown");
  const kid = await getKid();
  if (!kid || !kid.onboarded_at) {
    await rememberScan(code);
    redirect(kid ? `/join/${encodeURIComponent(kid.qr_token)}` : "/login");
  }
  await forgetScan();
  const r = await scanQr(kid.id, code);
  if (!r.ok) redirect(`/q/${code}/info?why=${r.reason}`);
  revalidatePath("/missions");
  redirect(`/missions/done/${r.completionId}`);
}
