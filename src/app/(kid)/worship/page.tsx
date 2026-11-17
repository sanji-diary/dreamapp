import Link from "next/link";
import { Chevron, H1, Icon, KidTabBar, Sub } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { currentWorship, kidNotices } from "@/lib/kid/queries";
import { formatKoreanDate } from "@/lib/time";

export const metadata = { title: "예배 · 꿈의숲키우기" };

function shortDate(date: string): string {
  // '12월 20일 주일'
  return formatKoreanDate(date);
}

export default async function WorshipPage() {
  await requireKid();
  const [current, notices] = await Promise.all([currentWorship(), kidNotices()]);
  const w = current?.worship;
  return (
    <>
      <main className="flex grow flex-col bg-white pb-4">
        <div className="flex flex-col gap-1.5 px-4 pt-[max(16px,env(safe-area-inset-top))]">
          <H1>{current && !current.thisWeek ? "지난 예배" : "이번 주 예배"}</H1>
          <Sub>{w ? `${formatKoreanDate(w.date)} ${w.time_place}`.trim() : "이번 주 예배 순서가 아직 올라오지 않았어요"}</Sub>
        </div>
        {w ? (
          <>
            <div className="mx-4 mt-4 flex items-center gap-3.5 rounded-2xl bg-navy-tint p-[18px]">
              <Icon name="bible" size={56} className="shrink-0" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-bold text-navy">오늘의 말씀</span>
                <span className="text-[19px] leading-[26px] font-bold tracking-[-0.4px] break-words">{w.sermon_title || "말씀"}</span>
                <span className="text-[14px] text-sub">{[w.scripture, w.preacher].filter(Boolean).join(" · ")}</span>
                {w.memory_verse ? <span className="text-[13px] font-semibold text-ink2">이번 주 암송: {w.memory_verse}</span> : null}
              </div>
            </div>
            {w.items.length > 0 ? (
              <div className="flex flex-col px-4 pt-3.5">
                <h2 className="m-0 mb-0.5 text-[15px] font-bold text-mute">예배 순서</h2>
                <ol className="m-0 list-none p-0">
                  {w.items.map((it, i) => (
                    <li key={i} className={`flex min-h-14 items-center gap-3 py-1 ${i === w.items.length - 1 ? "" : "border-b border-line"}`}>
                      <div aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-[14px] font-bold text-ink2">
                        {i + 1}
                      </div>
                      <span className="w-[76px] shrink-0 text-[16px] font-bold tracking-[-0.3px] text-ink2">{it.title}</span>
                      <span className="min-w-0 grow truncate text-[14px] text-sub">{it.detail ?? ""}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-col px-4 pt-3">
          <h2 className="m-0 mb-0.5 text-[15px] font-bold text-mute">공지</h2>
          {notices.length === 0 ? <p className="m-0 py-4 text-[14px] text-sub">새 공지가 없어요</p> : null}
          {notices.map((n, i) => (
            <Link key={n.id} href={`/worship/notice/${n.id}`} className={`flex h-[52px] items-center gap-2.5 no-underline ${i === notices.length - 1 ? "" : "border-b border-line"}`}>
              {n.important ? <span className="flex h-6 shrink-0 items-center rounded-md bg-danger-tint px-2 text-[12px] font-bold text-[#8E2A22]">중요</span> : null}
              <span className="min-w-0 grow truncate text-[15px] font-semibold text-ink2">
                {n.title}
                {n.event_date ? ` ${shortDate(n.event_date)}` : ""}
              </span>
              <Chevron />
            </Link>
          ))}
        </div>
      </main>
      <KidTabBar active="/worship" />
    </>
  );
}
