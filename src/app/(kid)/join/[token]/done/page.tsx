import Link from "next/link";
import { redirect } from "next/navigation";
import { SceneCard } from "@/components/kid/SceneCard";
import { primaryButtonClass } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { callName } from "@/lib/kid/korean";
import { pendingScan } from "@/lib/kid/scan-cookie";

export const metadata = { title: "씨앗을 받았어요 · 꿈의숲키우기" };

/** The last screen of the join wizard: the seed drops into the ground. */
export default async function JoinDonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const kid = await requireKid();
  if (kid.qr_token !== token) redirect("/home");
  const scan = await pendingScan();
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
          {/* A mission QR scanned before joining is still waiting: finish it first. */}
          {scan ? (
            // A plain link: /q/<code> is a route handler, so it needs a full page request.
            <a href={`/q/${scan}`} className={`${primaryButtonClass} h-14 rounded-2xl text-[17px] no-underline`}>
              찍은 QR 미션 마치러 가기
            </a>
          ) : (
            <Link href="/home" className={`${primaryButtonClass} h-14 rounded-2xl text-[17px] no-underline`}>
              내 나무 보러 가기
            </Link>
          )}
        </div>
      }
    />
  );
}
