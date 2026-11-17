import { PostCard } from "@/components/kid/PostCard";
import { H1, KidTabBar } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { missionsForChild } from "@/lib/game";
import { feedFor } from "@/lib/kid/feed";
import { dateOf } from "@/lib/kid/queries";
import { formatKoreanDate } from "@/lib/time";

export const metadata = { title: "숲 소식 · 꿈의숲키우기" };

export default async function FeedPage() {
  const kid = await requireKid();
  const [posts, missions] = await Promise.all([feedFor(kid.id), missionsForChild(db, kid.id)]);
  const m = missions.find((x) => x.kind === "comment" && x.state === "available");
  const rewardHint = m ? (m.drops_now > 0 ? `댓글 달면 물방울 ${m.drops_now}개` : m.points > 0 ? `댓글 달면 ${m.points}P` : null) : null;
  return (
    <>
      <main className="flex grow flex-col bg-white">
        <div className="px-4 pt-[max(16px,env(safe-area-inset-top))] pb-1">
          <H1>숲 소식</H1>
        </div>
        {posts.length === 0 ? <p className="mt-16 text-center text-[15px] text-sub">아직 올라온 소식이 없어요</p> : null}
        {posts.map((p, i) => (
          <PostCard
            key={p.id}
            rewardHint={i === 0 ? rewardHint : null}
            post={{
              id: p.id,
              body: p.body,
              imageUrl: p.image_url,
              commentsOpen: p.comments_open,
              dateLabel: formatKoreanDate(dateOf(p.created_at)),
              likes: p.likes,
              liked: p.liked,
              comments: p.comments,
            }}
          />
        ))}
      </main>
      <KidTabBar active="/feed" />
    </>
  );
}
