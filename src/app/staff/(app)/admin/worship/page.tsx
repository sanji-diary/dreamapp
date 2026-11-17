import { AdminHeader } from "@/components/staff/admin-kit";
import { ContentTabs } from "@/components/staff/AdminMenu";
import { FormSection, SaveBar, SubmitButton, TextInput } from "@/components/staff/form-kit";
import { FlashNote, Page, Tag, barButtonClass } from "@/components/staff/kit";
import { AutoForm, ConfirmButton } from "@/components/staff/widgets";
import { WorshipItems } from "@/components/staff/WorshipItems";
import { requireAdmin } from "@/lib/auth";
import { worshipSaveAction } from "@/lib/staff/actions-admin";
import { getWorship } from "@/lib/staff/admin-misc";
import { isDate } from "@/lib/staff/util";
import { formatKoreanDate, weekStart } from "@/lib/time";

export const metadata = { title: "예배 순서 · 꿈의숲키우기" };

export default async function WorshipAdminPage({ searchParams }: PageProps<"/staff/admin/worship">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  // Worship is kept per Sunday; any picked date snaps to the Sunday of its week.
  const date = weekStart(isDate(sp.date) ? sp.date : undefined);
  const data = await getWorship(staff, date);
  if (!data) return null;
  const w = data.worship;
  return (
    <Page>
      <AdminHeader title="소식·예배" />
      <ContentTabs active="worship" />
      <FlashNote ok={sp.ok} error={sp.error} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="m-0 text-[17px] font-bold tracking-[-0.025em]">{formatKoreanDate(date)} 예배</h2>
          <Tag tone={data.exists ? "navy" : "warn"}>{data.exists ? "저장돼 있어요" : "아직 적지 않았어요"}</Tag>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoForm className="flex min-w-0">
            <label htmlFor="w-date" className="sr-only">
              주일 고르기
            </label>
            <input id="w-date" type="date" name="date" defaultValue={date} className="h-11 min-w-0 cursor-pointer rounded-full border-0 bg-fill px-3.5 text-[14px] font-semibold text-ink2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy lg:h-[38px]" />
          </AutoForm>
          {data.hasPrevious ? (
            <form action={worshipSaveAction} className="flex">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="op" value="copy" />
              {data.exists ? (
                <ConfirmButton message="지금 적힌 내용을 지난 예배 내용으로 바꿀까요?" className={barButtonClass("ghost")}>
                  지난주 복사
                </ConfirmButton>
              ) : (
                <button type="submit" className={barButtonClass("ghost")}>
                  지난주 복사
                </button>
              )}
            </form>
          ) : null}
        </div>
        <p className="m-0 text-[12.5px] leading-[18px] text-mute">예배 순서는 주일마다 따로 적어요. 다른 날짜를 골라도 그 주 주일로 맞춰져요.</p>
      </div>
      <form key={`${date}:${JSON.stringify(w)}`} action={worshipSaveAction} className="flex grow flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
        <input type="hidden" name="date" value={date} />
        <FormSection title="예배 안내">
          <TextInput label="시간과 장소" name="time_place" id="w-time" maxLength={60} defaultValue={w.time_place} placeholder="오전 11시 · 소년부실" />
          <TextInput label="말씀 제목" name="sermon_title" id="w-title" maxLength={60} defaultValue={w.sermon_title} />
          <TextInput label="본문" name="scripture" id="w-scripture" maxLength={60} defaultValue={w.scripture} placeholder="시편 100편 1-5절" />
          <TextInput label="말씀 전하는 분" name="preacher" id="w-preacher" maxLength={30} defaultValue={w.preacher} />
          <TextInput label="이번 주 암송 말씀" name="memory_verse" id="w-verse" maxLength={60} defaultValue={w.memory_verse} />
        </FormSection>
        <FormSection title="순서">
          <WorshipItems initial={w.items} />
        </FormSection>
        <SaveBar className="lg:col-span-2">
          <SubmitButton>예배 순서 저장하기</SubmitButton>
        </SaveBar>
      </form>
    </Page>
  );
}
