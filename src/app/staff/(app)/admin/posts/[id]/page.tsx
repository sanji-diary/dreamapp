import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listPosts } from "@/lib/staff/admin-misc";
import { toInt } from "@/lib/staff/util";
import { PostWritePage } from "../write";

export const metadata = { title: "소식 고치기 · 꿈의숲키우기" };

export default async function EditPostPage({ params, searchParams }: PageProps<"/staff/admin/posts/[id]">) {
  const staff = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const post = ((await listPosts(staff)) ?? []).find((p) => p.id === toInt(id));
  if (!post) notFound();
  return <PostWritePage post={post} error={typeof sp.error === "string" ? sp.error : null} ok={typeof sp.ok === "string" ? sp.ok : null} />;
}
