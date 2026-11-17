import { notFound } from "next/navigation";
import { Flash, H2, SubHeader, textareaClass } from "@/components/staff/ui";
import { Tag, primaryButtonClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { replyWorryAction } from "@/lib/staff/actions";
import { AUDIENCE_LABEL, openWorry } from "@/lib/staff/review";
import { shortDate, toInt } from "@/lib/staff/util";

export const metadata = { title: "고민 · 꿈의숲키우기" };

export default async function WorryPage({ params, searchParams }: PageProps<"/staff/worries/[id]">) {
  const staff = await requireStaff();
  const id = toInt((await params).id);
  const sp = await searchParams;
  // A worry this teacher was not chosen for looks the same as one that does not exist.
  const w = id === null ? null : await openWorry(staff, id);
  if (!w) notFound();
  return (
    <>
      <SubHeader back="/staff/worries" backLabel="고민함으로 돌아가기" title={`${w.child_name}의 고민`} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="flex flex-col px-4 pb-6">
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <Tag tone="tint">{AUDIENCE_LABEL[w.audience]}</Tag>
          {w.class_name ? <Tag>{w.class_name}</Tag> : null}
          <span className="text-[13px] text-mute">{shortDate(w.written_on)}</span>
        </div>
        <p className="mt-3 mb-0 rounded-xl bg-fill px-3.5 py-3 text-[16px] leading-[25px] whitespace-pre-line text-ink">{w.content}</p>
        <p className="mt-3 mb-0 rounded-[10px] bg-warn-tint px-3 py-2.5 text-[13px] leading-[19px] font-semibold text-warn">아이의 안전이 걱정되는 내용이면 교역자에게 알려 주세요.</p>

        <H2>답장</H2>
        {w.replies.map((r, i) => (
          <div key={r.id} className={`flex flex-col gap-1 py-3 ${i === w.replies.length - 1 ? "" : "border-b border-line"}`}>
            <span className="text-[13px] text-mute">
              {r.staff_name ? `${r.staff_name} 선생님` : "알 수 없음"}
              {r.mine ? " (나)" : ""} · {shortDate(r.written_on)}
            </span>
            <p className="m-0 text-[15px] leading-[23px] whitespace-pre-line text-ink2">{r.content}</p>
          </div>
        ))}
        {w.replies.length === 0 ? <p className="m-0 pb-2 text-[14px] text-mute">아직 답장이 없어요.</p> : null}

        <form action={replyWorryAction} className="mt-2 flex flex-col gap-2.5">
          <input type="hidden" name="id" value={w.id} />
          <label htmlFor="reply" className="sr-only">
            답장 쓰기
          </label>
          <textarea id="reply" name="content" required maxLength={2000} placeholder="아이에게 따뜻한 한마디를 적어 주세요" className={textareaClass} />
          <button type="submit" className={`${primaryButtonClass} cursor-pointer`}>
            답장 보내기
          </button>
        </form>
        <p className="mt-3 mb-0 text-[12px] leading-[18px] text-mute">이 글은 아이가 고른 사람만 볼 수 있어요. 다른 사람에게 보여 주거나 옮겨 적지 말아 주세요.</p>
      </div>
    </>
  );
}
