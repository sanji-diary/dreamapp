import { getKid, getStaff } from "@/lib/auth";
import { canSeeChildDetail } from "@/lib/authz";
import { db, one } from "@/lib/db";
import { readUpload } from "@/lib/uploads";

/**
 * Photos are private.
 * - Feed images: anyone signed in.
 * - Profile photos: the child, and every teacher (teachers see names, photos and classes).
 * - Mission proof photos: the child, and teachers who may see that child's details.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const up = await readUpload(Number(id));
  if (!up) return new Response("not found", { status: 404 });
  const [kid, staff] = await Promise.all([getKid(), getStaff()]);
  let allowed = false;
  if (up.purpose === "post") allowed = kid !== null || staff !== null;
  else if (kid !== null && up.child_id === kid.id) allowed = true;
  else if (staff !== null && up.purpose === "profile") allowed = true;
  else if (staff !== null && up.child_id !== null) {
    const c = await one<{ class_id: number | null }>(db, "select class_id from children where id = $1", [up.child_id]);
    allowed = c !== null && canSeeChildDetail(staff, c.class_id);
  }
  if (!allowed) return new Response("forbidden", { status: 403 });
  return new Response(Buffer.from(up.bytes), { headers: { "content-type": up.mime, "cache-control": "private, max-age=3600" } });
}
