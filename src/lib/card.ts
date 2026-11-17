import "server-only";
import { cookies } from "next/headers";

/**
 * Remembers which QR cards were used on this device, so a child can get back to the PIN screen
 * without scanning again. A card alone is never enough to sign in; the PIN is still required.
 *
 * - `dream_card`  : the card the PIN screen is asking about right now.
 * - `dream_cards` : every card used on this device, newest first (a shared family phone has several).
 *   "다른 친구예요" only clears the current card. The list stays, so a mistaken tap can be undone
 *   by picking the name again.
 */
const CURRENT = "dream_card";
const LIST = "dream_cards";
const MAX_REMEMBERED = 6;
const YEAR = 60 * 60 * 24 * 365;

const options = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: YEAR });

/** Card tokens are URL-safe text; anything else in the cookie is dropped. */
const isToken = (t: string) => /^[A-Za-z0-9_-]{1,128}$/.test(t);
const parse = (raw: string | undefined): string[] => [...new Set((raw ?? "").split(".").filter(isToken))].slice(0, MAX_REMEMBERED);

export async function rememberCard(token: string) {
  if (!isToken(token)) return;
  const jar = await cookies();
  const list = [token, ...parse(jar.get(LIST)?.value).filter((t) => t !== token)].slice(0, MAX_REMEMBERED);
  jar.set(CURRENT, token, options());
  jar.set(LIST, list.join("."), options());
}

/** The card the PIN screen is asking about, if any. */
export async function readCard(): Promise<string | null> {
  return (await cookies()).get(CURRENT)?.value ?? null;
}

/** Every card remembered on this device, newest first. Includes the current one. */
export async function readCards(): Promise<string[]> {
  const jar = await cookies();
  const current = jar.get(CURRENT)?.value;
  const list = parse(jar.get(LIST)?.value);
  return current && isToken(current) && !list.includes(current) ? [current, ...list].slice(0, MAX_REMEMBERED) : list;
}

/** "I am someone else": stop asking for this card's PIN, but keep it in the list. */
export async function leaveCard() {
  const jar = await cookies();
  const current = jar.get(CURRENT)?.value;
  // A card remembered before the list existed is moved into it, so it can still be picked again.
  if (current && isToken(current)) {
    const list = parse(jar.get(LIST)?.value);
    if (!list.includes(current)) jar.set(LIST, [current, ...list].slice(0, MAX_REMEMBERED).join("."), options());
  }
  jar.delete(CURRENT);
}

/** Pick one of the cards already remembered on this device. A token that is not in the list is refused. */
export async function chooseCard(token: string): Promise<boolean> {
  const jar = await cookies();
  if (!parse(jar.get(LIST)?.value).includes(token)) return false;
  jar.set(CURRENT, token, options());
  return true;
}

/** The card no longer works (the child was removed or the card was reissued): forget it completely. */
export async function forgetCard(token?: string) {
  const jar = await cookies();
  const gone = token ?? jar.get(CURRENT)?.value;
  if (gone) {
    const list = parse(jar.get(LIST)?.value).filter((t) => t !== gone);
    if (list.length > 0) jar.set(LIST, list.join("."), options());
    else jar.delete(LIST);
  }
  if (!token || jar.get(CURRENT)?.value === token) jar.delete(CURRENT);
}
