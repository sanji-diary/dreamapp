import Link from "next/link";
import { AdminHeader } from "@/components/staff/admin-kit";
import { SaveBar, SubmitButton, TextInput } from "@/components/staff/form-kit";
import { FlashNote, LineIcon, Page, Tag, barButtonClass } from "@/components/staff/kit";
import { AutoForm, ConfirmButton } from "@/components/staff/widgets";
import { WorshipItems } from "@/components/staff/WorshipItems";
import { requireAdmin } from "@/lib/auth";
import { worshipSaveAction } from "@/lib/staff/actions-admin";
import { getWorship } from "@/lib/staff/admin-misc";
import { isDate } from "@/lib/staff/util";
import { addDays, formatKoreanDate, weekStart } from "@/lib/time";

export const metadata = { title: "예배 순서 · 꿈의숲키우기" };

const cardClass = "flex min-w-0 flex-col rounded-[20px] bg-fill p-4 lg:rounded-2xl lg:border lg:border-staff-line lg:bg-white lg:px-[22px] lg:py-5 lg:shadow-[0_1px_2px_rgba(17,24,39,0.04)]";

/** 예배 순서 (design-reference/admin2/Worship.dc.html): pick a Sunday, then the service details on the left and the order on the right. */
export default async function WorshipAdminPage({ searchParams }: PageProps<"/staff/admin/worship">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  // Worship is kept per Sunday; any picked date snaps to the Sunday of its week.
  const date = weekStart(isDate(sp.date) ? sp.date : undefined);
  const thisWeek = weekStart();
  const data = await getWorship(staff, date);
  if (!data) return null;
  const w = data.worship;
  const when = date === thisWeek ? { text: "이번 주일", tone: "navy" as const } : date < thisWeek ? { text: "지난 주일", tone: "gray" as const } : { text: "다음 주일", tone: "warn" as const };
  const weekLink = (d: string) => (d === thisWeek ? "/staff/admin/worship" : `/staff/admin/worship?date=${d}`);
  const navButton = "grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-ink2 no-underline hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff lg:h-10 lg:w-10";

  const copy = data.hasPrevious ? (
    <form action={worshipSaveAction} className="flex">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="op" value="copy" />
      {data.exists ? (
        <ConfirmButton message="지금 적힌 내용을 지난 예배 내용으로 바꿀까요?" className={barButtonClass("ghost")}>
          지난 주일 것 가져오기
        </ConfirmButton>
      ) : (
        <button type="submit" className={barButtonClass("ghost")}>
          지난 주일 것 가져오기
        </button>
      )}
    </form>
  ) : null;

  return (
    <Page>
      <AdminHeader
        title="예배 순서"
        wideRight={
          <>
            {copy}
            <button type="submit" form="worship-form" className={barButtonClass("solid")}>
              저장하기
            </button>
          </>
        }
      />
      <p className="m-0 -mt-1.5 hidden text-[14px] text-sub lg:block">여기 적은 대로 아이들 앱의 예배 화면에 보여요.</p>
      <FlashNote ok={sp.ok} error={sp.error} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] bg-fill px-2 py-2 lg:rounded-2xl lg:border lg:border-staff-line lg:bg-white lg:py-2.5 lg:pr-4 lg:pl-2.5 lg:shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        <div className="flex items-center">
          <Link href={weekLink(addDays(date, -7))} aria-label="지난 주일" className={navButton}>
            <LineIcon name="back" size={18} stroke={2.2} />
          </Link>
          <h2 className="m-0 min-w-[150px] text-center text-[17px] font-bold tracking-[-0.02em]">{formatKoreanDate(date)}</h2>
          <Link href={weekLink(addDays(date, 7))} aria-label="다음 주일" className={navButton}>
            <LineIcon name="next" size={18} stroke={2.2} />
          </Link>
        </div>
        <span className="flex items-center gap-1.5">
          <Tag tone={when.tone}>{when.text}</Tag>
          <Tag tone={data.exists ? "navy" : "warn"}>{data.exists ? "저장돼 있어요" : "아직 적지 않았어요"}</Tag>
        </span>
        <span className="grow" />
        <AutoForm className="flex min-w-0 items-center gap-2 px-2 lg:px-0">
          <label htmlFor="w-date" className="text-[13.5px] font-semibold text-sub">
            날짜로 가기
          </label>
          <input id="w-date" type="date" name="date" defaultValue={date} className="h-11 min-w-0 cursor-pointer rounded-[10px] border-0 bg-white px-3 text-[14px] font-semibold text-ink2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff lg:h-10 lg:ring-1 lg:ring-[#e1e4ea] lg:ring-inset" />
        </AutoForm>
      </div>
      <div className="flex flex-wrap gap-2 lg:hidden">{copy}</div>

      <form id="worship-form" key={`${date}:${JSON.stringify(w)}`} action={worshipSaveAction} className="flex grow flex-col gap-3.5 lg:flex-row lg:items-start lg:gap-5">
        <input type="hidden" name="date" value={date} />
        <section aria-labelledby="info-h" className={`${cardClass} gap-3.5 lg:grow-[2] lg:basis-0`}>
          <h2 id="info-h" className="m-0 text-[17px] font-bold tracking-[-0.02em] lg:text-[18px]">
            예배 안내
          </h2>
          <TextInput label="시간과 장소" name="time_place" id="w-time" maxLength={60} defaultValue={w.time_place} placeholder="오전 11시 · 소년부실" />
          <TextInput label="말씀 제목" name="sermon_title" id="w-title" maxLength={60} defaultValue={w.sermon_title} />
          <TextInput label="본문" name="scripture" id="w-scripture" maxLength={60} defaultValue={w.scripture} placeholder="시편 100편 1-5절" />
          <TextInput label="말씀 전하는 분" name="preacher" id="w-preacher" maxLength={30} defaultValue={w.preacher} />
          <TextInput label="이번 주 암송 말씀" name="memory_verse" id="w-verse" maxLength={60} defaultValue={w.memory_verse} />
        </section>
        <section aria-labelledby="order-h" className={`${cardClass} lg:grow-[3] lg:basis-0 lg:px-0 lg:pb-4`}>
          <div className="flex flex-wrap items-baseline gap-x-2.5 lg:px-[22px]">
            <h2 id="order-h" className="m-0 text-[17px] font-bold tracking-[-0.02em] lg:text-[18px]">
              순서
            </h2>
            <span className="text-[13.5px] text-mute">화살표로 순서를 바꿔요</span>
          </div>
          <WorshipItems initial={w.items} />
        </section>
        <SaveBar className="lg:hidden">
          <SubmitButton>예배 순서 저장하기</SubmitButton>
        </SaveBar>
      </form>
      <p className="m-0 text-[12.5px] leading-[18px] text-mute">예배 순서는 주일마다 따로 적어요. 다른 날짜를 골라도 그 주 주일로 맞춰져요.</p>
    </Page>
  );
}
