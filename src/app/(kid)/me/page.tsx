import Link from "next/link";
import { Chevron, Icon, KidTabBar } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureTree, pointBalance } from "@/lib/game";
import { signOutAction } from "@/lib/kid/actions";
import { formatPoints } from "@/lib/kid/korean";
import { attendanceStreak, badgesFor, classForestCount, className, harvestedCount, homeroomNames, weekPoints } from "@/lib/kid/queries";
import { unreadReplyCount } from "@/lib/kid/worries";

export const metadata = { title: "나 · 꿈의숲키우기" };

const TREE_IMG = ["seed", "sprout", "sap", "big", "flower", "fruit"];
/** The class forest shows at most this many trees; the heading carries the real total. */
const FOREST: [string, number, number][] = [
  ["fruit", 50, 60],
  ["big", 46, 55],
  ["flower", 52, 62],
  ["fruit", 44, 53],
  ["big", 50, 60],
  ["flower", 46, 55],
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[13px] text-sub">{label}</span>
      <span className="text-[17px] font-bold tracking-[-0.3px]">{value}</span>
    </div>
  );
}

/* eslint-disable @next/next/no-img-element */
export default async function MePage() {
  const kid = await requireKid();
  const [tree, points, week, streak, grown, badges, forest, cls, teachers, unread] = await Promise.all([
    ensureTree(db, kid.id),
    pointBalance(db, kid.id),
    weekPoints(kid.id),
    attendanceStreak(kid.id),
    harvestedCount(kid.id),
    badgesFor(kid.id),
    classForestCount(kid.class_id),
    className(kid.class_id),
    homeroomNames(kid.class_id),
    unreadReplyCount(kid.id),
  ]);
  const under = [cls, teachers.length > 0 ? `${teachers.join(", ")} 선생님` : ""].filter(Boolean).join(" · ");

  return (
    <>
      <main className="flex grow flex-col bg-white pb-4">
        <div className="flex items-center gap-3.5 px-4 pt-[max(16px,env(safe-area-inset-top))]">
          <div aria-hidden="true" className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-[#E3F0D6]">
            <img alt="" src={`/img/tree-${TREE_IMG[tree.level - 1]}.webp`} style={{ width: 44, height: 44, objectFit: "contain" }} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="m-0 text-[22px] leading-7 font-bold tracking-[-0.5px]">{kid.name}</h1>
            <p className="m-0 text-[14px] leading-5 tracking-[-0.2px] text-mute">{under}</p>
          </div>
        </div>

        <div className="mx-4 mt-[18px] flex flex-col gap-3.5 rounded-2xl bg-fill p-[18px]">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-sub">내 포인트</span>
              <span className="text-[28px] leading-[34px] font-bold tracking-[-0.6px]">{formatPoints(points)}</span>
            </div>
            <Icon name="persimmon" size={56} />
          </div>
          <div className="grid grid-cols-3">
            <Stat label="이번 주" value={formatPoints(week)} />
            <Stat label="연속 출석" value={`${streak}주`} />
            <Stat label="키운 나무" value={`${grown}그루`} />
          </div>
        </div>

        <div className="px-4 pt-[18px]">
          <h2 className="m-0 mb-2.5 text-[15px] font-bold text-mute">내 배지 {badges.length}개</h2>
          {badges.length === 0 ? (
            <p className="m-0 rounded-2xl bg-fill px-4 py-3.5 text-[14px] leading-5 text-sub">아직 배지가 없어요. 나무를 끝까지 키우면 첫 배지를 받아요.</p>
          ) : (
            <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-3 p-0">
              {badges.map((b) => (
                <li key={b.code} className="flex w-[62px] flex-col items-center gap-1">
                  <div aria-hidden="true" className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-fill">
                    <Icon name={b.icon} size={40} />
                  </div>
                  <span className="text-center text-[12px] font-semibold text-sub">{b.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 pt-[18px]">
          <h2 className="m-0 mb-2 text-[15px] font-bold text-mute">우리 반 숲 {forest}그루</h2>
          <div
            role="img"
            aria-label={forest > 0 ? `우리 반 친구들이 함께 키운 나무 ${forest}그루` : "아직 나무가 없는 우리 반 숲"}
            className="flex h-[84px] items-end justify-center gap-0.5 rounded-2xl pb-3"
            style={{ background: "linear-gradient(180deg, #E4F3FB 0%, #E4F3FB 62%, #E9EBA8 62%, #E9EBA8 100%)" }}
          >
            {forest === 0 ? <span className="self-center pt-3 text-[13px] font-semibold text-sub">첫 나무를 기다리고 있어요</span> : null}
            {FOREST.slice(0, Math.min(forest, FOREST.length)).map(([img, w, h], i) => (
              <img key={i} alt="" src={`/img/tree-${img}.webp`} style={{ width: w, height: h }} />
            ))}
            {forest > FOREST.length ? <span className="mb-1 ml-1 flex h-7 items-center rounded-full bg-white px-2.5 text-[13px] font-bold text-ink2">+{forest - FOREST.length}</span> : null}
          </div>
        </div>

        <div className="flex flex-col px-4 pt-2">
          <Link href="/me/points" className="flex h-[54px] items-center gap-2 border-b border-line no-underline">
            <span className="grow text-[16px] font-semibold text-ink2">포인트 내역</span>
            <Chevron />
          </Link>
          <Link href="/me/worries" className="flex h-[54px] items-center gap-2 border-b border-line no-underline">
            <span className="grow text-[16px] font-semibold text-ink2">고민 답장</span>
            {unread > 0 ? (
              <span aria-label={`새 답장 ${unread}개`} className="flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] bg-[#D22030] px-1.5 text-[12px] font-bold text-white">
                {unread}
              </span>
            ) : null}
            <Chevron />
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="flex h-[54px] w-full cursor-pointer items-center border-0 bg-transparent p-0 text-left text-[16px] font-semibold text-sub">
              로그아웃
            </button>
          </form>
        </div>
      </main>
      <KidTabBar active="/me" />
    </>
  );
}
