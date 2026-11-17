import { getKid, getStaff } from "@/lib/auth";
import { readUpload } from "@/lib/uploads";

/** Photos are private: feed images need any sign-in, a child's own photos need that child or a teacher. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const up = await readUpload(Number(id));
  if (!up) return new Response("not found", { status: 404 });
  const [kid, staff] = await Promise.all([getKid(), getStaff()]);
  const allowed = staff !== null || (kid !== null && (up.purpose === "post" || up.child_id === kid.id));
  if (!allowed) return new Response("forbidden", { status: 403 });
  return new Response(Buffer.from(up.bytes), { headers: { "content-type": up.mime, "cache-control": "private, max-age=3600" } });
}
