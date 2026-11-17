import { ContentTabs } from "@/components/staff/AdminMenu";
import { Flash, H2, SubHeader, TextField } from "@/components/staff/ui";
import { WorshipItems } from "@/components/staff/WorshipItems";
import { AutoForm, ConfirmButton } from "@/components/staff/widgets";
import { primaryButtonClass } from "@/components/ui";
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
    <>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="예배 순서" />
      <ContentTabs active="worship" />
      <Flash ok={sp.ok} error={sp.error} />
      <div className="flex flex-col gap-2 px-4 pt-1">
        <p className="m-0 text-[14px] leading-5 text-mute">
          {formatKoreanDate(date)} 예배 · {data.exists ? "저장돼 있어요" : "아직 적지 않았어요"}
        </p>
        <AutoForm className="flex items-center gap-2">
          <label htmlFor="w-date" className="sr-only">
            주일 고르기
          </label>
          <input id="w-date" type="date" name="date" defaultValue={date} className="h-11 min-w-0 grow rounded-[22px] border-0 bg-fill px-3.5 text-[14px] font-bold text-ink outline-none focus-visible:outline-2 focus-visible:outline-navy" />
        </AutoForm>
        {data.hasPrevious ? (
          <form action={worshipSaveAction}>
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="op" value="copy" />
            {data.exists ? (
              <ConfirmButton message="지금 적힌 내용을 지난 예배 내용으로 바꿀까요?" className="flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] border-0 bg-fill text-[14px] font-bold text-ink2">
                지난주 복사
              </ConfirmButton>
            ) : (
              <button type="submit" className="flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] border-0 bg-fill text-[14px] font-bold text-ink2">
                지난주 복사
              </button>
            )}
          </form>
        ) : null}
      </div>
      <form key={`${date}:${JSON.stringify(w)}`} action={worshipSaveAction} className="flex flex-col gap-3 px-4 pt-3 pb-6">
        <input type="hidden" name="date" value={date} />
        <TextField label="시간과 장소" name="time_place" maxLength={60} defaultValue={w.time_place} placeholder="오전 11시 · 소년부실" />
        <TextField label="말씀 제목" name="sermon_title" maxLength={60} defaultValue={w.sermon_title} />
        <TextField label="본문" name="scripture" maxLength={60} defaultValue={w.scripture} placeholder="시편 100편 1-5절" />
        <TextField label="말씀 전하는 분" name="preacher" maxLength={30} defaultValue={w.preacher} />
        <TextField label="이번 주 암송 말씀" name="memory_verse" maxLength={60} defaultValue={w.memory_verse} />
        <H2>순서</H2>
        <WorshipItems initial={w.items} />
        <button type="submit" className={`${primaryButtonClass} mt-2 cursor-pointer`}>
          예배 순서 저장하기
        </button>
      </form>
    </>
  );
}
