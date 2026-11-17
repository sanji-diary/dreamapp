import { Chip, Chips, EmptyNote, FlashNote, Page, SectionHead } from "@/components/staff/kit";
import { CommentCard, MissionCard } from "@/components/staff/todo/cards";
import { TodoHeader } from "@/components/staff/todo/TodoHeader";
import { BulkApprove } from "@/components/staff/todo/widgets";
import { requireStaff } from "@/lib/auth";
import { approveScope, canSeeWorryBox, hasScope } from "@/lib/staff/access";
import { pendingCompletions, reportedComments, unreadWorryCount } from "@/lib/staff/review";
import { approvalFilter, approvalsHref, type ApprovalFilter } from "@/lib/staff/todo";

export const metadata = { title: "할 일 · 꿈의숲키우기" };

const grid = "m-0 grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-2 lg:grid-cols-3";

/**
 * 할 일: missions children sent in (for teachers who may check them) and reported comments (any teacher).
 *
 * Below `lg` the two are tabs of one screen, `?tab=comments` being the second; 고민 is the third
 * segment and lives at /staff/worries. From `lg` this is the sidebar's "미션 확인": the cards three
 * across with a checkbox each and "고른 N건 한꺼번에 확인", the filter chips (`?f=`), and the reported
 * comments underneath when there are any.
 */
export default async function ApprovalsPage({ searchParams }: PageProps<"/staff/approvals">) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const scope = approveScope(staff);
  const canReview = hasScope(scope);
  const [pending, reports, unread] = await Promise.all([pendingCompletions(staff), reportedComments(staff), canSeeWorryBox(staff) ? unreadWorryCount(staff) : null]);
  const tab = canReview && sp.tab !== "comments" ? "missions" : "comments";
  const counts = { missions: canReview ? pending.length : null, worries: unread, comments: reports.length };
  const hasTabs = canReview || unread !== null;

  // Filter chips, each only where it tells things apart: 사진 / 글 when both kinds are waiting,
  // 우리 반만 for a teacher who has a class of their own and also checks other classes.
  const photos = pending.filter((p) => p.photo_url);
  const texts = pending.filter((p) => !p.photo_url);
  const mine = pending.filter((p) => p.class_id !== null && staff.class_ids.includes(p.class_id));
  const byKind = photos.length > 0 && texts.length > 0;
  const byClass = staff.class_ids.length > 0 && (scope === null || scope.some((id) => !staff.class_ids.includes(id)));
  const asked = approvalFilter(sp.f);
  const f: ApprovalFilter = ((asked === "photo" || asked === "text") && !byKind) || (asked === "mine" && !byClass) ? "all" : asked;
  const shown = f === "photo" ? photos : f === "text" ? texts : f === "mine" ? mine : pending;
  const showClass = scope === null || scope.length > 1;
  const now = new Date();

  return (
    <Page wide>
      <TodoHeader
        active={tab}
        counts={counts}
        wideTitle={canReview ? "미션 확인" : "신고된 댓글"}
        wideCount={canReview ? `기다리는 것 ${pending.length}건` : `${reports.length}건`}
        // A new key whenever the cards change: the count of ticked boxes starts from what is on the page.
        right={canReview && shown.length > 0 ? <BulkApprove key={shown.map((p) => p.id).join(",")} filter={f} /> : undefined}
      />
      <FlashNote ok={sp.ok} error={sp.error} />

      {canReview ? (
        <section aria-label="미션 확인" className={`flex-col gap-3.5 ${tab === "missions" ? "flex" : "hidden lg:flex"}`}>
          {byKind || byClass ? (
            // Phones have no chips in the design; they show only while a filter is on, so that it can be taken off.
            <div className={f === "all" ? "hidden lg:block" : ""}>
              <Chips label="골라 보기">
                <Chip href={approvalsHref()} on={f === "all"}>
                  전체 {pending.length}
                </Chip>
                {byKind ? (
                  <>
                    <Chip href={approvalsHref("photo")} on={f === "photo"}>
                      사진 {photos.length}
                    </Chip>
                    <Chip href={approvalsHref("text")} on={f === "text"}>
                      글 {texts.length}
                    </Chip>
                  </>
                ) : null}
                {byClass ? (
                  <Chip href={approvalsHref("mine")} on={f === "mine"}>
                    우리 반만 {mine.length}
                  </Chip>
                ) : null}
              </Chips>
            </div>
          ) : null}
          {shown.length > 0 ? (
            <ul className={grid}>
              {shown.map((p) => (
                <MissionCard key={p.id} p={p} showClass={showClass} filter={f} now={now} />
              ))}
            </ul>
          ) : (
            <EmptyNote>{pending.length > 0 ? "여기에 맞는 미션이 없어요." : "확인을 기다리는 미션이 없어요. 아이가 사진을 올리면 여기에 보여요."}</EmptyNote>
          )}
        </section>
      ) : null}

      <section aria-label="신고된 댓글" className={`flex-col gap-3.5 ${tab === "comments" ? "flex" : reports.length > 0 ? "hidden lg:flex" : "hidden"}`}>
        {/* The heading stands where nothing else names this part: under the mission cards on wide screens, and on a phone without the switch. */}
        <div className={canReview ? "hidden lg:block" : hasTabs ? "hidden" : "lg:hidden"}>
          <SectionHead>신고된 댓글 {reports.length}건</SectionHead>
        </div>
        {reports.length > 0 ? (
          <ul className={grid}>
            {reports.map((r) => (
              <CommentCard key={r.comment_id} r={r} />
            ))}
          </ul>
        ) : (
          <EmptyNote>신고된 댓글이 없어요. 아이가 숲 소식 댓글을 신고하면 여기에 보여요.</EmptyNote>
        )}
      </section>
    </Page>
  );
}
