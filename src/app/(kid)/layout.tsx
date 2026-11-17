import { PhoneColumn } from "@/components/ui";
import { getKid } from "@/lib/auth";

/**
 * Children's screens link the per-child web app manifest (/api/manifest): for a signed-in child its
 * start_url is the child's own card entry, so the home-screen icon works as their card.
 * The link is written by hand instead of through `metadata.manifest` because the browser must send
 * the session cookie when it fetches the manifest, which needs crossorigin="use-credentials".
 * React moves <link> elements into <head>.
 */
export default async function KidLayout({ children }: { children: React.ReactNode }) {
  // Some browsers fetch the manifest without cookies (seen on iPhone home-screen installs), which
  // would give the generic manifest and an icon that opens on "scan your card". Putting the child's
  // own card in the manifest address makes the answer the same with or without cookies.
  const kid = await getKid();
  const href = kid ? `/api/manifest?c=${encodeURIComponent(kid.qr_token)}` : "/api/manifest";
  return (
    <>
      <link rel="manifest" href={href} crossOrigin="use-credentials" />
      <PhoneColumn>{children}</PhoneColumn>
    </>
  );
}
