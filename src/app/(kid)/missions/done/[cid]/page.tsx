import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, primaryButtonClass } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { completionForChild } from "@/lib/kid/queries";

export const metadata = { title: "미션 완료 · 꿈의숲키우기" };

/** Shown right after a mission: what was received, and a way back to the tree. */
export default async function MissionDonePage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  const kid = await requireKid();
  const c = await completionForChild(kid.id, Number(cid));
  if (!c) notFound();

  const pending = c.status === "pending";
  const drops = c.drops_awarded;
  const points = c.points_awarded;
  let title = "미션을 마쳤어요";
  let sub = "잘했어요!";
  if (pending) {
    title = "선생님께 보냈어요";
    sub = "선생님이 확인하면 물방울을 받아요";
  } else if (c.status === "rejected") {
    title = "다시 해 볼까요?";
    sub = "선생님이 한 번 더 해 보자고 했어요";
  } else if (drops > 0) {
    title = `물방울 ${drops}개를 받았어요`;
    sub = points > 0 ? `${points}P도 함께 쌓였어요` : "나무에 물을 줄 수 있어요";
  } else if (points > 0) {
    title = `${points}P를 받았어요`;
    sub = "이번 주 물방울은 모두 받아서 포인트만 쌓였어요";
  }
  if (c.kind === "worry" && !pending) sub = `${sub}. 답장이 오면 '나'에서 볼 수 있어요`;

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="step-in flex grow flex-col items-center justify-center gap-2 px-6 text-center">
        <div aria-hidden="true" className="mb-3 flex h-[112px] w-[112px] items-center justify-center rounded-full bg-navy-tint">
          <Icon name={pending ? "stamp" : drops > 0 ? "drop" : "persimmon"} size={72} />
        </div>
        <p className="m-0 text-[14px] font-bold text-navy">{c.title}</p>
        <h1 className="m-0 text-[26px] leading-[35px] font-bold tracking-[-0.6px]">{title}</h1>
        <p className="m-0 text-[15px] leading-[22px] text-sub">{sub}</p>
        {!pending && (drops > 0 || points > 0) ? (
          <div className="mt-4 flex gap-2">
            {drops > 0 ? <span className="flex h-9 items-center gap-1 rounded-full bg-fill pr-3.5 pl-2 text-[15px] font-bold"><Icon name="drop" size={24} />+{drops}</span> : null}
            {points > 0 ? <span className="flex h-9 items-center gap-1 rounded-full bg-fill pr-3.5 pl-2 text-[15px] font-bold"><Icon name="persimmon" size={24} />+{points}P</span> : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
        <Link href="/home" className={`${primaryButtonClass} h-[54px] rounded-[14px] text-[17px] no-underline`}>
          {drops > 0 ? "나무에 물 주러 가기" : "내 나무로 가기"}
        </Link>
        <Link href="/missions" className="flex h-11 items-center justify-center text-[15px] font-semibold text-sub underline underline-offset-2">
          다른 미션 보기
        </Link>
      </div>
    </main>
  );
}
