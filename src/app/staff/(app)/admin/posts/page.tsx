import { ContentTabs } from "@/components/staff/AdminMenu";
import { Empty, Field, Flash, H2, SmallButton, SmallLink, SubHeader, Switch, textareaClass } from "@/components/staff/ui";
import { ConfirmButton, PhotoInput, PhotoZoom } from "@/components/staff/widgets";
import { primaryButtonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { commentAction } from "@/lib/staff/actions";
import { postAction } from "@/lib/staff/actions-admin";
import { listPosts } from "@/lib/staff/admin-misc";
import { shortDate, toInt } from "@/lib/staff/util";

export const metadata = { title: "숲 소식 · 꿈의숲키우기" };

export default async function PostsAdminPage({ searchParams }: PageProps<"/staff/admin/posts">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const posts = (await listPosts(staff)) ?? [];
  const editing = posts.find((p) => p.id === toInt(sp.edit)) ?? null;
  return (
    <>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="숲 소식" />
      <ContentTabs active="posts" />
      <Flash ok={sp.ok} error={sp.error} />
      <section className="flex flex-col px-4">
        <H2 right={editing ? <SmallLink href="/staff/admin/posts" tone="gray" width={60}>새로 쓰기</SmallLink> : null}>{editing ? "소식 고치기" : "새 소식"}</H2>
        <form key={editing?.id ?? "new"} action={postAction} className="flex flex-col gap-3">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <Field label="내용" htmlFor="p-body">
            <textarea id="p-body" name="body" required maxLength={2000} defaultValue={editing?.body ?? ""} className={textareaClass} />
          </Field>
          <Field label="사진 (선택)" hint="사진 동의를 받은 아이만 나오게 해 주세요.">
            <PhotoInput current={editing?.image_url} round={false} max={1200} />
          </Field>
          {editing?.image_url ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold text-ink2">
              <input type="checkbox" name="remove_image" className="h-5 w-5 accent-navy" />
              사진 빼기
            </label>
          ) : null}
          <div className="rounded-xl bg-fill px-3.5">
            <Switch label="댓글 받기" name="comments_open" defaultChecked={editing ? editing.comments_open : true} />
          </div>
          <button type="submit" className={`${primaryButtonClass} cursor-pointer`}>
            {editing ? "소식 저장하기" : "소식 올리기"}
          </button>
        </form>
      </section>
      <section className="flex flex-col px-4 pb-6">
        <H2>올린 소식 {posts.length}개</H2>
        {posts.map((p, i) => (
          <article key={p.id} className={`flex flex-col gap-1.5 py-3 ${i === posts.length - 1 ? "" : "border-b border-line"}`}>
            <div className="flex items-start gap-3">
              {p.image_url ? <PhotoZoom src={p.image_url} alt="소식 사진" size={56} /> : null}
              <p className="m-0 line-clamp-4 min-w-0 grow text-[14px] leading-[21px] whitespace-pre-line text-ink2">{p.body}</p>
            </div>
            <form action={postAction} className="flex items-center gap-[5px]">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="op" value="delete" />
              <span className="grow text-[13px] text-mute">
                {shortDate(p.created_on)} · 좋아요 {p.likes} · 댓글 {p.comments.length}
                {p.comments_open ? "" : " · 댓글 닫힘"}
              </span>
              <SmallLink href={`/staff/admin/posts?edit=${p.id}`} tone="gray">
                수정
              </SmallLink>
              <ConfirmButton message="이 소식을 지울까요? 댓글도 함께 지워져요.">
                <span className="flex h-[30px] min-w-[46px] items-center justify-center rounded-md bg-fill px-2 text-[12px] font-semibold text-sub">삭제</span>
              </ConfirmButton>
            </form>
            {p.comments.length > 0 ? (
              <ul className="m-0 flex list-none flex-col rounded-[10px] bg-fill px-3 py-1">
                {p.comments.map((c) => (
                  <li key={c.id} className="flex min-h-11 items-center gap-2">
                    <span className={`min-w-0 grow text-[13px] leading-[19px] ${c.hidden ? "text-faint line-through" : "text-ink2"}`}>
                      <b>{c.author}</b> {c.body}
                    </span>
                    {c.hidden ? (
                      <span className="shrink-0 text-[12px] text-mute">지움</span>
                    ) : (
                      <form action={commentAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="back" value="posts" />
                        <SmallButton tone="gray" name="decision" value="hide" label={`${c.author} 댓글 삭제`}>
                          삭제
                        </SmallButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
        {posts.length === 0 ? <Empty>아직 올린 소식이 없어요.</Empty> : null}
      </section>
    </>
  );
}
