import { AdminHeader, AdminPage, ConfirmPill, writeSplitClass } from "@/components/staff/admin-kit";
import { ContentTabs } from "@/components/staff/AdminMenu";
import { FormSection, SubmitButton, SwitchGroup, SwitchRow, TextArea, TextInput, errorFor } from "@/components/staff/form-kit";
import { EmptyNote, FlashNote, PillLink, SectionHead, Tag } from "@/components/staff/kit";
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
    <AdminPage>
      <AdminHeader title="소식·예배" />
      <ContentTabs active="notices" />
      <FlashNote ok={sp.ok} error={sp.error} />
      <div className={writeSplitClass}>
        <FormSection
          box
          className="md:col-start-2 md:row-start-1"
          title={editing ? "공지 고치기" : "새 공지"}
          right={
            editing ? (
              <PillLink href="/staff/admin/notices" tone="white">
                새로 쓰기
              </PillLink>
            ) : undefined
          }
        >
          <form key={editing?.id ?? "new"} action={noticeAction} className="flex flex-col gap-3">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <TextInput label="제목" name="title" id="n-title" required maxLength={60} defaultValue={editing?.title} error={errorFor(sp.error, /제목/)} />
            <TextArea label="내용" name="body" id="n-body" maxLength={4000} defaultValue={editing?.body ?? ""} />
            <TextInput label="행사 날짜" name="event_date" id="n-date" type="date" defaultValue={editing?.event_date} hint="행사가 없으면 비워 두세요." error={errorFor(sp.error, /날짜/)} />
            <SwitchGroup onGray>
              <SwitchRow grouped label="중요 공지" name="important" defaultChecked={editing?.important} hint="아이 화면 맨 위에 보여요" />
              <SwitchRow grouped label="교사만 보기" name="staff_only" defaultChecked={editing?.staff_only} hint="아이들에게는 보이지 않아요" />
            </SwitchGroup>
            <SubmitButton>{editing ? "고친 내용 저장" : "공지 올리기"}</SubmitButton>
          </form>
        </FormSection>

        <section className="flex min-w-0 flex-col md:col-start-1 md:row-start-1">
          <SectionHead note={`${notices.length}개`}>올린 공지</SectionHead>
          {notices.map((n) => (
            <div key={n.id} className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {n.important ? <Tag tone="warn">중요</Tag> : null}
                {n.staff_only ? <Tag tone="navy">교사용</Tag> : null}
                {editing?.id === n.id ? <Tag tone="blue">고치는 중</Tag> : null}
                <b className="min-w-0 text-[15px]">{n.title}</b>
              </div>
              {n.body ? <p className="m-0 line-clamp-3 text-[14px] leading-[21px] whitespace-pre-line text-ink2">{n.body}</p> : null}
              <div className="flex flex-wrap items-center gap-x-1.5">
                <span className="min-w-0 grow text-[13px] text-mute">
                  {n.event_date ? `${shortDate(n.event_date)} 행사 · ` : ""}
                  {shortDate(n.created_on)} 올림
                </span>
                <PillLink href={`/staff/admin/notices?edit=${n.id}`} tone="gray" label={`${n.title} 공지 고치기`}>
                  고치기
                </PillLink>
                <form action={noticeAction} className="flex">
                  <input type="hidden" name="id" value={n.id} />
                  <input type="hidden" name="op" value="delete" />
                  <ConfirmPill message={`'${n.title}' 공지를 지울까요?`} label={`${n.title} 공지 지우기`}>
                    지우기
                  </ConfirmPill>
                </form>
              </div>
            </div>
          ))}
          {notices.length === 0 ? <EmptyNote>아직 올린 공지가 없어요.</EmptyNote> : null}
        </section>
      </div>
    </AdminPage>
  );
}
