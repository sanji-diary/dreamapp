import Link from "next/link";
import { FlashNote, LineIcon, Page, PageHeader, PillButton, barButtonClass } from "@/components/staff/kit";
import { PostEditor } from "@/components/staff/PostEditor";
import { requireAdmin } from "@/lib/auth";
import { commentAction } from "@/lib/staff/actions";
import { postAction } from "@/lib/staff/actions-admin";
import type { PostRow } from "@/lib/staff/admin-misc";
import { shortDate } from "@/lib/staff/util";

/**
 * Writing a new 숲 소식 post or changing one (design-reference/admin2/Write.dc.html): a back link to
 * the list, the title, and the 올리기 button at the top; the editor below. A post that is being
 * changed also lists its comments, each with a button to hide it.
 */
export async function PostWritePage({ post, error, ok }: { post: PostRow | null; error: string | null; ok?: string | null }) {
  const staff = await requireAdmin();
  return (
    <Page>
      <form action={postAction} className="flex flex-col gap-3.5 lg:gap-[18px]">
        {post ? <input type="hidden" name="id" value={post.id} /> : null}
        <div className="flex flex-col gap-1">
          <Link href="/staff/admin/posts" className="inline-flex min-h-11 w-fit items-center gap-1 text-[14px] font-semibold text-sub no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff lg:min-h-8">
            <LineIcon name="back" size={16} />
            소식 글 목록
          </Link>
          <PageHeader
            title={post ? "소식 고치기" : "새 소식 쓰기"}
            sub={post ? `${shortDate(post.created_on)}에 올린 글이에요` : "아이들의 숲 소식에 올라가요"}
            right={
              <span className="flex shrink-0 items-center gap-2.5">
                <Link href="/staff/admin/posts" className={barButtonClass("ghost")}>
                  취소
                </Link>
                <button type="submit" className={barButtonClass("solid")}>
                  {post ? "고친 내용 저장" : "올리기"}
                </button>
              </span>
            }
          />
        </div>
        <FlashNote ok={ok ?? undefined} />
        <PostEditor body={post?.body ?? ""} image={post?.image_url ?? null} commentsOpen={post ? post.comments_open : true} author={staff.name} error={error} />
      </form>

      {post && post.comments.length > 0 ? (
        <section aria-labelledby="cm-h" className="flex flex-col gap-2 rounded-[20px] bg-fill p-4 lg:rounded-2xl lg:border lg:border-staff-line lg:bg-white lg:px-[22px] lg:py-5 lg:shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <h2 id="cm-h" className="m-0 text-[17px] font-bold tracking-[-0.02em] lg:text-[18px]">
            댓글 <span className="text-[14px] font-medium text-mute">{post.comments.length}개</span>
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {post.comments.map((c) => (
              <li key={c.id} className="flex min-h-12 items-center gap-2 border-b border-track last:border-b-0 lg:border-[#f1f3f6]">
                <span className={`min-w-0 grow py-2 text-[14px] leading-[20px] ${c.hidden ? "text-faint line-through" : "text-ink2"}`}>
                  <b>{c.author}</b> {c.body}
                </span>
                {c.hidden ? (
                  <span className="shrink-0 text-[12.5px] text-mute">지움</span>
                ) : (
                  <form action={commentAction} className="flex">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="back" value={`post:${post.id}`} />
                    <PillButton tone="white" name="decision" value="hide" label={`${c.author} 댓글 지우기`}>
                      지우기
                    </PillButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Page>
  );
}
