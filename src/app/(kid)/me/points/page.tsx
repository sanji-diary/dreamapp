import { BackLink, H1, KidTabBar, Sub } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { pointBalance } from "@/lib/game";
import { formatPoints } from "@/lib/kid/korean";
import { dateOf, pointHistory } from "@/lib/kid/queries";
import { formatKoreanDate } from "@/lib/time";

export const metadata = { title: "포인트 내역 · 꿈의숲키우기" };

export default async function PointsPage() {
  const kid = await requireKid();
  const [rows, total] = await Promise.all([pointHistory(kid.id), pointBalance(db, kid.id)]);
  return (
    <>
      <main className="flex grow flex-col bg-white pb-4">
        <div className="pt-[max(8px,env(safe-area-inset-top))] pl-2">
          <BackLink href="/me" label="나로 돌아가기" />
        </div>
        <div className="flex flex-col gap-1.5 px-4 pt-2">
          <H1>포인트 내역</H1>
          <Sub>지금까지 모은 포인트는 {formatPoints(total)}예요. 포인트는 연말에 달란트가 돼요.</Sub>
        </div>
        {rows.length === 0 ? <p className="mt-12 text-center text-[15px] text-sub">아직 받은 포인트가 없어요. 미션을 해 볼까요?</p> : null}
        <ul className="m-0 mt-3 list-none px-4 py-0">
          {rows.map((r, i) => (
            <li key={r.id} className={`flex min-h-[60px] items-center gap-3 py-2 ${i === rows.length - 1 ? "" : "border-b border-line"}`}>
              <div className="flex min-w-0 grow flex-col gap-px">
                <span className="truncate text-[16px] font-bold tracking-[-0.3px] text-ink2">{r.reason}</span>
                <span className="text-[13px] text-sub">{formatKoreanDate(dateOf(r.created_at))}</span>
              </div>
              <span className={`shrink-0 text-[16px] font-bold ${r.delta >= 0 ? "text-blue" : "text-sub"}`}>
                {r.delta >= 0 ? "+" : "−"}
                {formatPoints(Math.abs(r.delta))}
              </span>
            </li>
          ))}
        </ul>
      </main>
      <KidTabBar active="/me" />
    </>
  );
}
