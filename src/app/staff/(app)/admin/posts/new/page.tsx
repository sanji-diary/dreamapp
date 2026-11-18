import { PostWritePage } from "../write";

export const metadata = { title: "새 소식 쓰기 · 꿈의숲키우기" };

export default async function NewPostPage({ searchParams }: PageProps<"/staff/admin/posts/new">) {
  const sp = await searchParams;
  return <PostWritePage post={null} error={typeof sp.error === "string" ? sp.error : null} />;
}
