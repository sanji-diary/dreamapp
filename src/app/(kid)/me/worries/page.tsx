import Link from "next/link";
import { DeleteWorryButton } from "@/components/kid/DeleteWorryButton";
import { BackLink, H1, KidTabBar, Sub, primaryButtonClass } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { dateOf } from "@/lib/kid/queries";
import { markRepliesRead, myWorries } from "@/lib/kid/worries";
import { formatKoreanDate } from "@/lib/time";

export const metadata = { title: "고민 답장 · 꿈의숲키우기" };

const AUDIENCE = { teacher: "담임 선생님만 읽어요", pastor: "전도사님만 읽어요", both: "선생님과 전도사님이 읽어요" } as const;

/** The child's own worries and the replies to them. Nobody else's worries are ever listed here. */
export default async function MyWorriesPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const kid = await requireKid();
  const [worries, sp] = await Promise.all([myWorries(kid.id), searchParams]);
  // Opening this screen counts as reading the replies; this render still shows which ones were new.
  if (worries.some((w) => w.replies.some((r) => r.unread))) await markRepliesRead(kid.id);

  return (
    <>
      <main className="flex grow flex-col bg-white pb-4">
        <div className="pt-[max(8px,env(safe-area-inset-top))] pl-2">
          <BackLink href="/me" label="나로 돌아가기" />
        </div>
        <div className="flex flex-col gap-1.5 px-4 pt-2">
          <H1>내 고민과 답장</H1>
          <Sub>내가 쓴 이야기는 나와 내가 고른 사람만 볼 수 있어요.</Sub>
        </div>
        {sp.sent === "1" ? (
          <p role="status" className="mx-4 mt-3 mb-0 rounded-xl bg-navy-tint px-4 py-3 text-[14px] font-semibold text-navy">
            이야기를 잘 보냈어요. 답장이 오면 여기에서 볼 수 있어요.
          </p>
        ) : null}
        {worries.length === 0 ? <p className="mt-12 px-6 text-center text-[15px] leading-[22px] text-sub">아직 적은 이야기가 없어요.</p> : null}
        <ul className="m-0 mt-3 flex list-none flex-col gap-3 px-4 py-0">
          {worries.map((w) => (
            <li key={w.id} className="rounded-2xl border border-line px-4 pt-3 pb-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-[13px] text-sub">
                  {formatKoreanDate(dateOf(w.created_at))} · {AUDIENCE[w.audience]}
                </span>
                <DeleteWorryButton worryId={w.id} />
              </div>
              <p className="m-0 text-[16px] leading-6 break-words whitespace-pre-line text-ink2">{w.content}</p>
              {w.replies.length === 0 ? (
                <p className="m-0 mt-3 text-[13px] text-mute">아직 답장이 없어요</p>
              ) : (
                <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                  {w.replies.map((r) => (
                    <li key={r.id} className="rounded-xl bg-navy-tint px-3.5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-navy">{r.author}</span>
                        {r.unread ? <span className="flex h-5 items-center rounded-[5px] bg-[#D22030] px-1.5 text-[11px] font-bold text-white">새 답장</span> : null}
                        <span className="text-[12px] text-sub">{formatKoreanDate(dateOf(r.created_at))}</span>
                      </div>
                      <p className="m-0 mt-1 text-[15px] leading-[22px] break-words whitespace-pre-line text-ink2">{r.content}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        <div className="grow" />
        <div className="px-4 pt-5">
          <Link href="/me/worries/new" className={`${primaryButtonClass} no-underline`}>
            새 이야기 적기
          </Link>
        </div>
      </main>
      <KidTabBar active="/me" />
    </>
  );
}
