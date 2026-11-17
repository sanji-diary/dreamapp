import { AdminHeader, AdminPage, ConfirmPill, writeSplitClass } from "@/components/staff/admin-kit";
import { ContentTabs } from "@/components/staff/AdminMenu";
import { Checkbox, FieldGroup, FormSection, SubmitButton, SwitchRow, TextArea, errorFor } from "@/components/staff/form-kit";
import { EmptyNote, FlashNote, PillButton, PillLink, SectionHead, Tag } from "@/components/staff/kit";
import { PhotoInput, PhotoZoom } from "@/components/staff/widgets";
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
    <AdminPage>
      <AdminHeader title="소식·예배" />
      <ContentTabs active="posts" />
      <FlashNote ok={sp.ok} error={sp.error} />
      <div className={writeSplitClass}>
        {/* Writing comes first on phones and sits in the box at the right on wide screens. */}
        <FormSection
          box
          className="md:col-start-2 md:row-start-1"
          title={editing ? "소식 고치기" : "새 소식"}
          right={
            editing ? (
              <PillLink href="/staff/admin/posts" tone="white">
                새로 쓰기
              </PillLink>
            ) : undefined
          }
        >
          <form key={editing?.id ?? "new"} action={postAction} className="flex flex-col gap-3">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <TextArea label="내용" name="body" id="p-body" required maxLength={2000} defaultValue={editing?.body ?? ""} error={errorFor(sp.error, /내용/)} />
            <FieldGroup legend="사진 (선택)" hint="사진 동의를 받은 아이만 나오게 해 주세요." error={errorFor(sp.error, /사진|이미지/)}>
              <div className="rounded-2xl bg-white p-3">
                <PhotoInput current={editing?.image_url} round={false} max={1200} />
              </div>
            </FieldGroup>
            {editing?.image_url ? <Checkbox name="remove_image" label="사진 빼기" /> : null}
            <SwitchRow onGray label="댓글 받기" hint="아이들이 이 소식에 댓글을 달 수 있어요" name="comments_open" defaultChecked={editing ? editing.comments_open : true} />
            <SubmitButton>{editing ? "고친 내용 저장" : "소식 올리기"}</SubmitButton>
          </form>
        </FormSection>

        <section className="flex min-w-0 flex-col md:col-start-1 md:row-start-1">
          <SectionHead note={`${posts.length}개`}>올린 소식</SectionHead>
          {posts.map((p) => (
            <article key={p.id} className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0">
              <div className="flex items-start gap-3">
                {p.image_url ? <PhotoZoom src={p.image_url} alt="소식 사진" size={56} /> : null}
                <p className="m-0 line-clamp-4 min-w-0 grow text-[14px] leading-[21px] whitespace-pre-line text-ink2">{p.body}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5">
                <span className="min-w-0 grow text-[13px] text-mute">
                  {shortDate(p.created_on)} · 좋아요 {p.likes} · 댓글 {p.comments.length}
                </span>
                {p.comments_open ? null : <Tag>댓글 닫힘</Tag>}
                {editing?.id === p.id ? <Tag tone="navy">고치는 중</Tag> : null}
                <PillLink href={`/staff/admin/posts?edit=${p.id}`} tone="gray" label={`${shortDate(p.created_on)} 소식 고치기`}>
                  고치기
                </PillLink>
                <form action={postAction} className="flex">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="op" value="delete" />
                  <ConfirmPill message="이 소식을 지울까요? 댓글도 함께 지워져요." label={`${shortDate(p.created_on)} 소식 지우기`}>
                    지우기
                  </ConfirmPill>
                </form>
              </div>
              {p.comments.length > 0 ? (
                <ul className="m-0 flex list-none flex-col rounded-2xl bg-fill px-3.5 py-1">
                  {p.comments.map((c) => (
                    <li key={c.id} className="flex min-h-11 items-center gap-2 border-b border-track last:border-b-0">
                      <span className={`min-w-0 grow py-1.5 text-[13px] leading-[19px] ${c.hidden ? "text-faint line-through" : "text-ink2"}`}>
                        <b>{c.author}</b> {c.body}
                      </span>
                      {c.hidden ? (
                        <span className="shrink-0 text-[12px] text-mute">지움</span>
                      ) : (
                        <form action={commentAction} className="flex">
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="back" value="posts" />
                          <PillButton tone="white" name="decision" value="hide" label={`${c.author} 댓글 지우기`}>
                            지우기
                          </PillButton>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
          {posts.length === 0 ? <EmptyNote>아직 올린 소식이 없어요.</EmptyNote> : null}
        </section>
      </div>
    </AdminPage>
  );
}
