import "server-only";
import { createHash } from "node:crypto";
import { readCards } from "@/lib/card";
import { db } from "@/lib/db";

export interface RememberedFriend {
  /** A short fingerprint of the card for the pick form, so the card token itself never appears in the page. */
  key: string;
  token: string;
  name: string;
}

/**
 * The children whose cards are remembered on this device, newest first.
 * Cards that no longer belong to a child on the list (removed, or the card was reissued) are left out.
 */
export async function rememberedFriends(): Promise<RememberedFriend[]> {
  const tokens = await readCards();
  if (tokens.length === 0) return [];
  const marks = tokens.map((_, i) => "$" + (i + 1)).join(", ");
  const rows = await db.query<{ name: string; qr_token: string }>("select name, qr_token from children where active and qr_token in (" + marks + ")", tokens);
  const names = new Map(rows.map((r) => [r.qr_token, r.name]));
  return tokens
    .filter((t) => names.has(t))
    .map((t) => ({ key: createHash("sha256").update(t).digest("hex").slice(0, 16), token: t, name: names.get(t)! }));
}
