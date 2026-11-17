import { notFound } from "next/navigation";
import { SaveBar, SubmitButton, errorFor } from "@/components/staff/form-kit";
import { Chip, Chips, FlashNote, Page, PageHeader, barButtonClass } from "@/components/staff/kit";
import { VerseEditor } from "@/components/staff/plan/VerseEditor";
import { ConfirmButton } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { weekVersesClearAction, weekVersesSaveAction } from "@/lib/staff/actions-admin";
import { getMission } from "@/lib/staff/admin-missions";
import { getWeekVerses, verseWeeks } from "@/lib/staff/admin-plan";
import { isDate, toInt } from "@/lib/staff/util";
import { todayKst, weekStart } from "@/lib/time";

export const metadata = { title: "주별 말씀 · 꿈의숲키우기" };

/**
 * The verses of "이번 주 말씀 쓰기", one week at a time: this week and the next seven,
 * each chip saying whether that week has its verses yet.
 */
export default async function WeekVersesPage({ params, searchParams }: PageProps<"/staff/admin/missions/[id]/verses">) {
  const staff = await requireAdmin();
  const id = toInt((await params).id);
  const sp = await searchParams;
  const today = todayKst();
  const thisWeek = weekStart(today);
  const m = id === null ? null : await getMission(staff, id);
  if (!m || m.kind !== "verse" || m.mode !== "fixed") notFound();
  const week = isDate(sp.w) && weekStart(sp.w) >= thisWeek ? weekStart(sp.w) : thisWeek;
  const [weeks, current] = await Promise.all([verseWeeks(staff, m.id, { today }), getWeekVerses(staff, m.id, week, { today })]);
  if (!weeks || !current) notFound();
  const base = `/staff/admin/missions/${m.id}/verses`;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const has = current.verses.length > 0;

  return (
    <Page narrow>
      <PageHeader back={`/staff/admin/missions${week === thisWeek ? "" : `?w=${week}`}#fixed`} backLabel="미션으로 돌아가기" title="주별 말씀" />
      <FlashNote ok={sp.ok} error={sp.error} />
      <p className="m-0 -mt-1 text-[14px] leading-[21px] text-sub">‘{m.title}’에서 아이가 따라 쓸 말씀이에요. 다음 주 것도 미리 넣어 둘 수 있어요.</p>
      <Chips label="주 고르기">
        {weeks.map((w) => (
          <Chip key={w.week} href={w.week === thisWeek ? base : `${base}?w=${w.week}`} on={w.week === week}>
            {w.label}
            {w.current ? " · 이번 주" : ""}
            {w.count > 0 ? " · 말씀 있음" : " · 비어 있음"}
          </Chip>
        ))}
      </Chips>

      {/* key: a new week starts the editor afresh with that week's verses. */}
      <form key={week} action={weekVersesSaveAction} className="flex grow flex-col gap-3.5">
        <input type="hidden" name="id" value={m.id} />
        <input type="hidden" name="w" value={week} />
        <div className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-fill p-4 max-[339px]:p-3">
          <b className="text-[15px] tracking-[-0.02em]">
            {current.label}
            {current.current ? " (이번 주)" : ""} 말씀
          </b>
          <VerseEditor idPrefix="wv" initialRef={current.ref} initialVerses={current.verses} error={errorFor(error, /말씀|절/)} />
        </div>
        <SaveBar>
          <SubmitButton>이 주 말씀 저장</SubmitButton>
        </SaveBar>
      </form>
      {has ? (
        <form action={weekVersesClearAction} className="flex">
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="w" value={week} />
          <ConfirmButton message={`${current.label} 말씀을 지울까요?\n말씀이 없으면 그 주에는 아이에게 이 미션이 보이지 않아요.`} className={barButtonClass("ghost")}>
            이 주 말씀 지우기
          </ConfirmButton>
        </form>
      ) : null}
    </Page>
  );
}
