import { db, one } from "@/lib/db";
import { kidManifest } from "@/lib/kid/manifest";
import { readSession } from "@/lib/session";

/**
 * The web app manifest for children's screens. A signed-in child gets a start_url that is their own
 * card entry (/join/<token>/card: remembers the card, then asks for the PIN), so an icon added to the
 * home screen keeps working even where the home-screen app has its own empty cookie storage (iOS).
 * Nobody signed in: the generic manifest. The answer holds the card token, so it must never be cached
 * by anything shared.
 */
export async function GET() {
  const id = await readSession("kid");
  const child = id ? await one<{ qr_token: string }>(db, "select qr_token from children where id = $1 and active", [id]) : null;
  return new Response(JSON.stringify(kidManifest(child?.qr_token ?? null)), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
