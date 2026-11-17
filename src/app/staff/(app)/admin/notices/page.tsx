import { ContentTabs } from "@/components/staff/AdminMenu";
import { Empty, Field, Flash, H2, SmallLink, SubHeader, Switch, TextField, textareaClass } from "@/components/staff/ui";
import { ConfirmButton } from "@/components/staff/widgets";
import { Tag, primaryButtonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { noticeAction } from "@/lib/staff/actions-admin";
import { listNotices } from "@/lib/staff/admin-misc";
import { shortDate, toInt } from "@/lib/staff/util";

export const metadata = { title: "공지 · 꿈의숲키우기" };

export default async function NoticesAdminPage({ searchParams }: PageProps<"/staff/admin/notices">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const notices = (await listNotices(staff)) ?? [];
  const editing = notices.find((n) => n.id === toInt(sp.edit)) ?? null;
  return (
    <>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="공지" />
      <ContentTabs active="notices" />
      <Flash ok={sp.ok} error={sp.error} />
      <section className="flex flex-col px-4">
        <H2 right={editing ? <SmallLink href="/staff/admin/notices" tone="gray" width={60}>새로 쓰기</SmallLink> : null}>{editing ? "공지 고치기" : "새 공지"}</H2>
        <form key={editing?.id ?? "new"} action={noticeAction} className="flex flex-col gap-3">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <TextField label="제목" name="title" required maxLength={60} defaultValue={editing?.title} />
          <Field label="내용" htmlFor="n-body">
            <textarea id="n-body" name="body" maxLength={4000} defaultValue={editing?.body ?? ""} className={textareaClass} />
          </Field>
          <TextField label="행사 날짜 (없으면 비워 두세요)" name="event_date" type="date" defaultValue={editing?.event_date} />
          <div className="flex flex-col rounded-xl bg-fill px-3.5">
            <Switch label="중요 공지" name="important" defaultChecked={editing?.important} hint="아이 화면 맨 위에 보여요" />
            <Switch label="교사만 보기" name="staff_only" defaultChecked={editing?.staff_only} hint="아이들에게는 보이지 않아요" />
          </div>
          <button type="submit" className={`${primaryButtonClass} cursor-pointer`}>
            {editing ? "공지 저장하기" : "공지 올리기"}
          </button>
        </form>
      </section>
      <section className="flex flex-col px-4 pb-6">
        <H2>올린 공지 {notices.length}개</H2>
        {notices.map((n, i) => (
          <div key={n.id} className={`flex flex-col gap-1 py-3 ${i === notices.length - 1 ? "" : "border-b border-line"}`}>
            <div className="flex items-center gap-1.5">
              {n.important ? <Tag tone="warn">중요</Tag> : null}
              {n.staff_only ? <Tag tone="tint">교사용</Tag> : null}
              <span className="min-w-0 grow truncate text-[15px] font-bold text-ink2">{n.title}</span>
            </div>
            {n.body ? <p className="m-0 line-clamp-3 text-[14px] leading-[21px] whitespace-pre-line text-ink2">{n.body}</p> : null}
            <form action={noticeAction} className="flex items-center gap-[5px]">
              <input type="hidden" name="id" value={n.id} />
              <input type="hidden" name="op" value="delete" />
              <span className="grow text-[13px] text-mute">
                {n.event_date ? `${shortDate(n.event_date)} 행사 · ` : ""}
                {shortDate(n.created_on)} 올림
              </span>
              <SmallLink href={`/staff/admin/notices?edit=${n.id}`} tone="gray">
                수정
              </SmallLink>
              <ConfirmButton message={`'${n.title}' 공지를 지울까요?`}>
                <span className="flex h-[30px] min-w-[46px] items-center justify-center rounded-md bg-fill px-2 text-[12px] font-semibold text-sub">삭제</span>
              </ConfirmButton>
            </form>
          </div>
        ))}
        {notices.length === 0 ? <Empty>아직 올린 공지가 없어요.</Empty> : null}
      </section>
    </>
  );
}
