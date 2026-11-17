import { notFound } from "next/navigation";
import { BackLink, KidTabBar } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { dateOf, kidNotice } from "@/lib/kid/queries";
import { formatKoreanDate } from "@/lib/time";

export const metadata = { title: "공지 · 꿈의숲키우기" };

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireKid();
  const n = await kidNotice(Number(id));
  if (!n) notFound();
  return (
    <>
      <main className="flex grow flex-col bg-white pb-6">
        <div className="pt-[max(8px,env(safe-area-inset-top))] pl-2">
          <BackLink href="/worship" label="예배로 돌아가기" />
        </div>
        <div className="flex flex-col gap-2 px-5 pt-2">
          {n.important ? <span className="flex h-6 items-center self-start rounded-md bg-danger-tint px-2 text-[12px] font-bold text-[#8E2A22]">중요</span> : null}
          <h1 className="m-0 text-[22px] leading-[30px] font-bold tracking-[-0.5px] break-words">{n.title}</h1>
          <p className="m-0 text-[13px] text-mute">{formatKoreanDate(dateOf(n.created_at))}에 올라온 공지</p>
          {n.event_date ? (
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-navy-tint px-4 py-3.5">
              <span className="text-[13px] font-bold text-navy">날짜</span>
              <span className="text-[16px] font-bold">{formatKoreanDate(n.event_date)}</span>
            </div>
          ) : null}
          <p className="m-0 mt-3 text-[16px] leading-[26px] break-words whitespace-pre-line text-ink2">{n.body || "자세한 내용은 선생님께 물어보세요."}</p>
        </div>
      </main>
      <KidTabBar active="/worship" />
    </>
  );
}
