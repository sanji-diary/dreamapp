import { redirect } from "next/navigation";
import { HarvestButton } from "@/components/kid/HarvestButton";
import { SceneCard } from "@/components/kid/SceneCard";
import { BackLink } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureTree, getSettings } from "@/lib/game";
import { ordinal } from "@/lib/kid/korean";
import { classForestCount, daysGrowing, harvestedCount, hasBadge } from "@/lib/kid/queries";

export const metadata = { title: "열매 수확 · 꿈의숲키우기" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[13px] font-medium text-sub">{label}</div>
      <div className="text-[17px] font-bold tracking-[-0.3px]">{value}</div>
    </div>
  );
}

export default async function HarvestPage() {
  const kid = await requireKid();
  const [tree, settings] = await Promise.all([ensureTree(db, kid.id), getSettings()]);
  // Only a fully ripe tree can be harvested.
  if (!(tree.level >= 6 && tree.given >= settings.levelNeeds[5])) redirect("/home");
  const [forest, mine, firstBadge] = await Promise.all([classForestCount(kid.class_id), harvestedCount(kid.id), hasBadge(kid.id, "first_tree")]);
  const days = daysGrowing(tree.planted_at);

  return (
    <SceneCard
      level={6}
      headerBottom={170}
      top={
        <>
          <div className="px-2.5 pt-[max(8px,env(safe-area-inset-top))]">
            <BackLink href="/home" label="내 나무로 돌아가기" />
          </div>
          <div className="flex flex-col gap-1.5 px-5 pt-2">
            <h1 className="m-0 text-[26px] leading-[35px] font-bold tracking-[-0.6px]">
              드디어
              <br />
              열매가 다 익었어요!
            </h1>
            <p className="m-0 text-[15px] leading-[22px] font-medium text-sub">
              {ordinal(tree.seq)} 나무 · {days}일 동안 키웠어요
            </p>
          </div>
        </>
      }
      bottom={
        <>
          <div className="mx-4 mb-3 grid grid-cols-3 rounded-[20px] bg-white px-2 py-4 shadow-[0_8px_24px_rgba(25,31,40,0.08)]">
            <Stat label="수확 보너스" value={`${settings.harvestBonusPoints}P`} />
            {firstBadge ? <Stat label="내가 키운 나무" value={`${mine + 1}그루째`} /> : <Stat label="새 배지" value="첫 나무" />}
            <Stat label="우리 반 숲" value={`${forest + 1}그루째`} />
          </div>
          <div className="flex flex-col gap-2.5 px-4 pb-[max(34px,env(safe-area-inset-bottom))]">
            <HarvestButton />
            <p className="m-0 text-center text-[13px] leading-[19px] text-sub">수확하면 이 나무는 우리 반 숲에 심기고, 새 씨앗을 받아요</p>
          </div>
        </>
      }
    />
  );
}
