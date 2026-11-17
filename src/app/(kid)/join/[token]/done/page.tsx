import Link from "next/link";
import { redirect } from "next/navigation";
import { SceneCard } from "@/components/kid/SceneCard";
import { primaryButtonClass } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { callName } from "@/lib/kid/korean";

export const metadata = { title: "씨앗을 받았어요 · 꿈의숲키우기" };

/** The last screen of the join wizard: the seed drops into the ground. */
export default async function JoinDonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const kid = await requireKid();
  if (kid.qr_token !== token) redirect("/home");
  return (
    <SceneCard
      level={1}
      intro
      top={
        <div className="step-in px-5 pt-[max(56px,env(safe-area-inset-top))]">
          <h1 className="m-0 text-[26px] leading-[35px] font-bold tracking-[-0.6px]">
            {callName(kid.name)},
            <br />
            씨앗을 받았어요!
          </h1>
          <p className="m-0 mt-1.5 text-[15px] leading-[22px] font-medium text-sub">미션을 하고 물을 주면 나무로 자라요</p>
        </div>
      }
      bottom={
        <div className="px-4 pt-3 pb-[max(34px,env(safe-area-inset-bottom))]">
          <Link href="/home" className={`${primaryButtonClass} h-14 rounded-2xl text-[17px] no-underline`}>
            내 나무 보러 가기
          </Link>
        </div>
      }
    />
  );
}
