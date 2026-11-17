import { redirect } from "next/navigation";
import { InstallGuide } from "@/components/kid/InstallGuide";
import { getKid } from "@/lib/auth";
import { pendingScan } from "@/lib/kid/scan-cookie";

export const metadata = { title: "홈 화면에 추가하기 · 꿈의숲키우기" };

/**
 * How to put the app on the home screen. The address carries the child's own card on purpose:
 * a home-screen icon made from this very page (or this link opened in another browser) arrives
 * without a session, and is then treated exactly like a scanned card: remembered, then the PIN.
 */
export default async function InstallPage({ params, searchParams }: PageProps<"/join/[token]/install">) {
  const { token } = await params;
  const kid = await getKid();
  if (!kid || kid.qr_token !== token) redirect(`/join/${encodeURIComponent(token)}/card`);
  const first = (await searchParams).first === "1";
  // A mission QR scanned before joining is still waiting: finish it after this screen.
  const scan = first ? await pendingScan() : null;
  return <InstallGuide entryPath={`/join/${encodeURIComponent(token)}/install`} next={first ? (scan ? `/q/${scan}` : "/home") : "/me"} first={first} />;
}
