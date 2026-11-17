import { db, one } from "@/lib/db";
import { kidManifest } from "@/lib/kid/manifest";
import { readSession } from "@/lib/session";

/**
 * The web app manifest for children's screens. Its start_url is the child's own card entry
 * (/join/<token>/card: remembers the card, then asks for the PIN), so an icon added to the home
 * screen keeps working even where the home-screen app has its own empty cookie storage (iOS).
 *
 * Whose card: the `c` parameter the child's own page put in the manifest address, or else the
 * signed-in child. The parameter matters because some browsers fetch the manifest without cookies.
 * It grants nothing by itself: the card still needs the PIN, exactly like a scanned paper card.
 * Nobody known: the generic manifest. The answer holds a card token, so it is never cached by
 * anything shared.
 */
export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("c");
  let token: string | null = null;
  if (asked) {
    token = (await one<{ qr_token: string }>(db, "select qr_token from children where qr_token = $1 and active", [asked]))?.qr_token ?? null;
  }
  if (!token) {
    const id = await readSession("kid");
    token = id ? ((await one<{ qr_token: string }>(db, "select qr_token from children where id = $1 and active", [id]))?.qr_token ?? null) : null;
  }
  return new Response(JSON.stringify(kidManifest(token)), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
