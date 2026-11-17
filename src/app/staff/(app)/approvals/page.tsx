import Link from "next/link";
import { Empty, Face, Flash, SmallButton, SmallLink, TabHeader } from "@/components/staff/ui";
import { PhotoZoom } from "@/components/staff/widgets";
import { Circle, Icon, SectionTitle } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { approveScope, canSeeWorryBox, hasScope } from "@/lib/staff/access";
import { commentAction, reviewAction } from "@/lib/staff/actions";
import { pendingCompletions, reportedComments, unreadWorryCount } from "@/lib/staff/review";
import { shortDate } from "@/lib/staff/util";

export const metadata = { title: "확인 · 꿈의숲키우기" };

export default async function ApprovalsPage({ searchParams }: PageProps<"/staff/approvals">) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const canReview = hasScope(approveScope(staff));
  const [pending, reports, unread] = await Promise.all([pendingCompletions(staff), reportedComments(staff), canSeeWorryBox(staff) ? unreadWorryCount(staff) : 0]);
  const total = pending.length + reports.length;

  return (
    <>
      <TabHeader title={total > 0 ? `확인할 것 ${total}건` : "확인할 것이 없어요"} sub={canReview ? "승인하면 아이에게 물방울이 가요" : "신고된 댓글을 살펴볼 수 있어요"} />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="flex grow flex-col px-4 pb-6">
        {canReview ? (
          <section className="flex flex-col">
            <SectionTitle>미션 제출 {pending.length}건</SectionTitle>
            <ul className="m-0 flex list-none flex-col p-0">
              {pending.map((p, i) => (
                <li key={p.id} className={`flex flex-col ${i === pending.length - 1 ? "" : "border-b border-line"}`}>
                  <div className="flex min-h-[72px] items-center gap-[13px] py-2">
                    {p.photo_url ? (
                      <PhotoZoom src={p.photo_url} alt={`${p.child_name} ${p.title} 사진`} />
                    ) : (
                      <Circle>
                        <Icon name={p.icon} />
                      </Circle>
                    )}
                    <div className="flex min-w-0 grow flex-col gap-px">
                      <Link href={`/staff/children/${p.child_id}`} className="truncate text-[17px] leading-[23px] font-bold tracking-[-0.4px] text-ink2 no-underline">
                        {p.child_name}
                      </Link>
                      <div className="truncate text-[13px] leading-[18px] tracking-[-0.2px] text-sub">
                        {p.title} · {p.photo_url ? "사진 1장" : p.kind === "teacher" ? "교사 확인" : "글"} · {shortDate(p.done_on)}
                      </div>
                    </div>
                    <form action={reviewAction} className="flex shrink-0 gap-[5px]">
                      <input type="hidden" name="id" value={p.id} />
                      <SmallButton tone="gray" name="decision" value="reject" label={`${p.child_name} ${p.title} 반려`}>
                        반려
                      </SmallButton>
                      <SmallButton name="decision" value="approve" label={`${p.child_name} ${p.title} 승인`}>
                        승인
                      </SmallButton>
                    </form>
                  </div>
                  {p.text_content ? <p className="m-0 pb-3 pl-[59px] text-[14px] leading-[21px] whitespace-pre-line text-ink2">{p.text_content}</p> : null}
                </li>
              ))}
            </ul>
            {pending.length === 0 ? <Empty>기다리는 제출이 없어요.</Empty> : null}
          </section>
        ) : null}

        <section className="flex flex-col">
          <SectionTitle>신고된 댓글 {reports.length}건</SectionTitle>
          <ul className="m-0 flex list-none flex-col p-0">
            {reports.map((r, i) => (
              <li key={r.comment_id} className={`flex flex-col py-2 ${i === reports.length - 1 ? "" : "border-b border-line"}`}>
                <div className="flex min-h-14 items-center gap-[13px]">
                  <Face name={r.author} id={r.author_id ?? 0} />
                  <div className="flex min-w-0 grow flex-col gap-px">
                    <div className="truncate text-[17px] leading-[23px] font-bold tracking-[-0.4px] text-ink2">{r.author}</div>
                    <div className="truncate text-[13px] leading-[18px] tracking-[-0.2px] text-sub">
                      신고 {r.reports}번 · {shortDate(r.last_reported)}
                    </div>
                  </div>
                  <form action={commentAction} className="flex shrink-0 gap-[5px]">
                    <input type="hidden" name="id" value={r.comment_id} />
                    <SmallButton tone="gray" name="decision" value="keep" label={`${r.author} 댓글 그대로 두기`}>
                      그대로
                    </SmallButton>
                    <SmallButton name="decision" value="hide" label={`${r.author} 댓글 삭제`}>
                      삭제
                    </SmallButton>
                  </form>
                </div>
                <p className="m-0 rounded-[10px] bg-fill px-3 py-2.5 text-[14px] leading-[21px] whitespace-pre-line text-ink2">{r.body}</p>
                <p className="mt-1.5 mb-0 truncate text-[12px] leading-[18px] text-mute">소식: {r.post_body}</p>
              </li>
            ))}
          </ul>
          {reports.length === 0 ? <Empty>신고된 댓글이 없어요.</Empty> : null}
        </section>

        {canSeeWorryBox(staff) && unread > 0 ? (
          <section className="flex flex-col">
            <SectionTitle>고민함</SectionTitle>
            <div className="flex min-h-[72px] items-center gap-[13px]">
              <Circle>
                <Icon name="bubble" />
              </Circle>
              <div className="flex min-w-0 grow flex-col gap-px">
                <div className="text-[17px] leading-[23px] font-bold tracking-[-0.4px] text-ink2">새 고민 {unread}건</div>
                <div className="truncate text-[13px] leading-[18px] tracking-[-0.2px] text-sub">아이가 보여 주기로 했어요</div>
              </div>
              <SmallLink href="/staff/worries" width={60}>
                열기
              </SmallLink>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
