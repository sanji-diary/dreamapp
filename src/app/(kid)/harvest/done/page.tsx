import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon, primaryButtonClass } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { getSettings } from "@/lib/game";
import { classForestCount, harvestedCount } from "@/lib/kid/queries";

export const metadata = { title: "수확했어요 · 꿈의숲키우기" };

const SPARKS = [
  [-96, -54, "2.8s", "0s"],
  [92, -66, "3.4s", "0.6s"],
  [-70, 58, "3s", "1.1s"],
  [84, 44, "3.6s", "0.3s"],
] as const;

/** A short celebration after harvesting, then back home to the new seed. */
export default async function HarvestDonePage() {
  const kid = await requireKid();
  const [mine, forest, settings] = await Promise.all([harvestedCount(kid.id), classForestCount(kid.class_id), getSettings()]);
  if (mine === 0) redirect("/home");
  return (
    <main data-bleed className="flex min-h-dvh flex-col bg-sky">
      <div className="step-in flex grow flex-col items-center justify-center gap-2 px-6 text-center">
        <div aria-hidden="true" className="relative mb-3 flex h-[136px] w-[136px] items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(25,31,40,0.08)]">
          <Icon name="persimmon" size={92} className="[animation:hover_2.4s_ease-in-out_infinite]" />
          {SPARKS.map(([x, y, dur, delay]) => (
            <svg key={`${x}${y}`} width="16" height="16" viewBox="-7 -7 14 14" style={{ position: "absolute", left: 60 + x, top: 60 + y, animation: `twinkle ${dur} ease-in-out ${delay} infinite` }}>
              <path d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z" fill="#FFFFFF" />
            </svg>
          ))}
        </div>
        <h1 className="m-0 text-[26px] leading-[35px] font-bold tracking-[-0.6px]">열매를 수확했어요!</h1>
        <p className="m-0 text-[15px] leading-[22px] text-sub">
          보너스 {settings.harvestBonusPoints}P를 받았어요.
          <br />내 나무는 우리 반 숲의 {forest}번째 나무가 되었어요.
        </p>
        <p className="m-0 mt-3 flex h-9 items-center gap-1 rounded-full bg-white pr-3.5 pl-2 text-[15px] font-bold">
          <Icon name="persimmon" size={24} />
          지금까지 키운 나무 {mine}그루
        </p>
      </div>
      <div className="kid-col px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
        <Link href="/home?new=1" className={`${primaryButtonClass} h-[54px] rounded-[14px] text-[17px] no-underline`}>
          새 씨앗 심으러 가기
        </Link>
      </div>
    </main>
  );
}
