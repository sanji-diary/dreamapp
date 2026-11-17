/**
 * Children's screens link the per-child web app manifest (/api/manifest): for a signed-in child its
 * start_url is the child's own card entry, so the home-screen icon works as their card.
 * The link is written by hand instead of through `metadata.manifest` because the browser must send
 * the session cookie when it fetches the manifest, which needs crossorigin="use-credentials".
 * React moves <link> elements into <head>.
 */
export default function KidLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="manifest" href="/api/manifest" crossOrigin="use-credentials" />
      {children}
    </>
  );
}
