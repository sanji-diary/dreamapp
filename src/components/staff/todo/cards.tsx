import Link from "next/link";
import { TeacherAvatar, TreeAvatar } from "@/components/staff/kit";
import { commentAction, reviewAction } from "@/lib/staff/actions";
import { shortClassName } from "@/lib/staff/home";
import type { PendingItem, ReportedComment } from "@/lib/staff/review";
import { BULK_FORM_ID, agoText, type ApprovalFilter } from "@/lib/staff/todo";
import { shortDate } from "@/lib/staff/util";
import { ChoiceButtons, PhotoTile } from "./widgets";

/** The gray tiles of "할 일": one mission a child sent in, one reported comment. */

const tile = "flex min-w-0 flex-col gap-3 rounded-[20px] bg-fill p-3.5";
const quote = "m-0 rounded-[14px] bg-white px-3.5 py-3 text-[14px] leading-[1.5] whitespace-pre-line";

/**
 * A submission waiting for a teacher: who, which mission, when, then the photo or the words, and
 * 다시 해 주세요 / 확인했어요. From `lg` it also has a checkbox for "한꺼번에 확인".
 * `showClass` adds the class beside the name for teachers who check more than one class.
 */
export function MissionCard({ p, showClass, filter, now }: { p: PendingItem; showClass: boolean; filter: ApprovalFilter; now: Date }) {
  const ago = agoText(p.created_at, now);
  const what = `${p.child_name} ${p.title}`;
  return (
    <li className={tile}>
      <div className="flex items-center gap-2.5">
        <label className="-mr-1 hidden h-9 w-6 shrink-0 cursor-pointer place-items-center lg:grid">
          <input type="checkbox" name="ids" value={p.id} form={BULK_FORM_ID} aria-label={`${what} 고르기`} className="h-[17px] w-[17px] cursor-pointer accent-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy" />
        </label>
        <TreeAvatar level={p.level} photo={p.child_photo} size="s" onWhite />
        <div className="flex min-w-0 grow flex-col">
          <b className="text-[15px]">
            {/* The name opens the child's page; its tap area (::after) is 44px tall though the word is small. */}
            <Link href={`/staff/children/${p.child_id}`} className="relative text-inherit no-underline after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
              {p.child_name}
            </Link>
            {showClass && p.class_name ? <span className="ml-1 font-medium text-mute">{shortClassName(p.class_name)}</span> : null}
          </b>
          <span className="text-[13px] text-mute">
            {p.title} · 물방울 {p.drops}개{/* On a folded cover screen the time joins this line instead of standing at the right. */}
            <span className="min-[340px]:hidden"> · {ago}</span>
          </span>
        </div>
        <span className="shrink-0 self-start pt-0.5 text-[13px] text-mute max-[339px]:hidden">{ago}</span>
      </div>
      {p.photo_url ? <PhotoTile src={p.photo_url} alt={`${what} 사진`} /> : null}
      {p.text_content ? <p className={`${quote} ${p.photo_url ? "" : "sm:h-[168px] sm:overflow-y-auto"}`}>{p.text_content}</p> : null}
      {!p.photo_url && !p.text_content ? <p className={`${quote} text-mute sm:h-[168px]`}>사진이나 글 없이 보낸 미션이에요. 아이가 했는지 확인해 주세요.</p> : null}
      <form action={reviewAction} className="mt-auto">
        <input type="hidden" name="id" value={p.id} />
        {filter !== "all" ? <input type="hidden" name="f" value={filter} /> : null}
        <ChoiceButtons no={{ value: "reject", label: "다시 해 주세요", aria: `${what} 다시 해 달라고 돌려보내기` }} yes={{ value: "approve", label: "확인했어요", aria: `${what} 확인` }} />
      </form>
    </li>
  );
}

/** A comment on 숲 소식 that a child reported: who wrote it, the words, the post it is under, and 그대로 두기 / 댓글 지우기. */
export function CommentCard({ r }: { r: ReportedComment }) {
  return (
    <li className={tile}>
      <div className="flex items-center gap-2.5">
        {r.author_id !== null ? <TreeAvatar level={r.author_level} photo={r.author_photo} size="s" onWhite /> : <TeacherAvatar name={r.author} onWhite />}
        <div className="flex min-w-0 grow flex-col">
          <b className="text-[15px]">{r.author}</b>
          <span className="text-[13px] text-mute">
            신고 {r.reports}번 · {shortDate(r.last_reported)}
          </span>
        </div>
      </div>
      <p className={quote}>{r.body}</p>
      <p className="m-0 -mt-1 line-clamp-2 px-0.5 text-[12px] leading-[18px] text-mute">소식: {r.post_body}</p>
      <form action={commentAction} className="mt-auto">
        <input type="hidden" name="id" value={r.comment_id} />
        <ChoiceButtons no={{ value: "keep", label: "그대로 두기", aria: `${r.author} 댓글 그대로 두기` }} yes={{ value: "hide", label: "댓글 지우기", aria: `${r.author} 댓글 지우기` }} />
      </form>
    </li>
  );
}
