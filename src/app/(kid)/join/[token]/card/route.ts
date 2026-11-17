import { redirect } from "next/navigation";
import { childByToken, getKid, signOut } from "@/lib/auth";
import { rememberCard } from "@/lib/card";

/**
 * A child who already has a PIN scanned their card: remember the card on this device and ask for the PIN.
 * The card alone never signs anyone in.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const child = await childByToken(token);
  if (!child || !child.has_pin) redirect(`/join/${encodeURIComponent(token)}`);
  // Someone else was signed in on this device: the newly scanned card takes over.
  const current = await getKid();
  if (current && current.id !== child.id) await signOut("kid");
  await rememberCard(token);
  redirect("/login");
}
