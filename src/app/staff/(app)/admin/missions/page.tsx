import Link from "next/link";
import type { ReactNode } from "react";
import { AdminHeader, AdminPage, BarButton, RowLink, rowClass, rowItemClass, splitClass, tableClass, tdClass, thClass } from "@/components/staff/admin-kit";
import { Checkbox, SwitchSubmit, selectBoxClass } from "@/components/staff/form-kit";
import { PoolPicker } from "@/components/staff/plan/PoolPicker";
import { BarLink, Box, Card, Chevron, Chip, Chips, ClayIcon, EmptyNote, FlashNote, InfoField, Notice, RoundLink, SectionHead, Tag, barButtonClass } from "@/components/staff/kit";
import { ConfirmButton } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseQuiz } from "@/lib/quiz";
import { listClasses } from "@/lib/staff/access";
import { missionCopyWeekAction, missionOpAction, planCreateFixedAction, planPerWeekAction, planRotationAction, planRotationResetAction } from "@/lib/staff/actions-admin";
import { DEFAULT_FIXED_MISSIONS, getWeekVerses, ROTATING_MAX, weekPlan, type PoolMission, type WeekVerses } from "@/lib/staff/admin-plan";
import { listFixedMissions, listMissions, missionStats, missionWeeksFrom, weekCopyPlan, weekMissions, weeklyDropCheck, weeklyDrops, type DropCheck, type MissionStat } from "@/lib/staff/admin-missions";
import { isDate, shortDate, toInt } from "@/lib/staff/util";
import { addDays, formatKoreanDate, todayKst, weekLabel, weekStart } from "@/lib/time";
import { KIND_NAMES, type Mission } from "@/lib/types";

export const metadata = { title: "미션 · 꿈의숲키우기" };

const BASE = "/staff/admin/missions";

/**
 * 미션. For one week (the chips), three parts:
 *  - 고정 미션: on every week (src/lib/plan.ts); with none yet, a box that makes the usual four.
 *  - 순환 미션: the week's pick from the pool, automatic or chosen by hand, and the pool itself.
 *  - 기간 미션: missions with their own dates, as before; copying a week copies only these.
 * "지난 미션" lists dated missions that are over and missions that were switched off.
 * A mission opens in the box at the right (from 768px) or under its row (phones).
 */

/** What the list shows: one week (its Sunday) or the old missions ("past"), and the mission that is open. */
interface View {
  w: string;
  id: number | null;
  thisWeek: string;
}

function href(v: View, patch: Partial<Pick<View, "w" | "id">> = {}, part?: string): string {
  const n = { ...v, ...patch };
  const p = new URLSearchParams();
  if (n.w !== n.thisWeek) p.set("w", n.w);
  if (n.id !== null) p.set("id", String(n.id));
  const s = p.toString();
  return `${s ? `${BASE}?${s}` : BASE}${part ? `#${part}` : ""}`;
}

/** 확인 방법, with what the mock adds to it: "퀴즈 5문제", "스스로 체크 · 주 3번". */
function howText(m: Mission): string {
  const n = m.kind === "quiz" ? (parseQuiz(m.quiz)?.length ?? 0) : 0;
  const kind = n > 0 ? `퀴즈 ${n}문제` : KIND_NAMES[m.kind];
  if (m.repeat === "daily") return m.weekly_limit === null ? `${kind} · 매일` : `${kind} · 주 ${m.weekly_limit}번`;
  return m.repeat === "once" ? `${kind} · 한 번만` : kind;
}

/** The drops column: "2", "1 × 7", or "포인트만" for a mission without drops. */
const dropsText = (m: Mission) => (weeklyDrops(m) === 0 ? "포인트만" : m.repeat === "daily" ? `${m.drops} × ${m.weekly_limit ?? 7}` : String(m.drops));

/** "물방울 2 · 20P", or "포인트만 · 2P". */
const rewardText = (m: Mission) => (weeklyDrops(m) === 0 ? `포인트만 · ${m.points}P` : `물방울 ${dropsText(m)} · ${m.points}P`);

/** When it comes: "매주 나와요" / "순환 미션이에요" for the plan, otherwise "11월 3주차" or the dates. */
function periodText(m: Mission): string {
  if (m.mode === "fixed") return "매주 나와요";
  if (m.mode === "pool") return "순환 미션이에요";
  const ws = weekStart(m.starts_on);
  if (m.starts_on === ws && m.ends_on === addDays(ws, 6)) return weekLabel(ws);
  if (m.starts_on === m.ends_on) return formatKoreanDate(m.starts_on);
  return `${shortDate(m.starts_on)} ~ ${shortDate(m.ends_on)}`;
}

function MissionTags({ m, long = false, past = false }: { m: Mission; long?: boolean; past?: boolean }) {
  // In "지난 미션" the kind of plan is worth saying; inside its own part of the week it is not.
  const plan = past && m.mode !== "dated";
  if (!m.is_challenge && m.active && !plan) return null;
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-[2px]">
      {plan ? <Tag tone="navy">{m.mode === "fixed" ? "고정" : "순환"}</Tag> : null}
      {m.is_challenge ? <Tag tone="warn">{long ? "도전 미션" : "도전"}</Tag> : null}
      {!m.active ? <Tag onWhite={long}>그만 받음</Tag> : null}
    </span>
  );
}

/** One mission in full, with everything that can be done with it. On wide screens it is the box at the right; on phones it opens under its row. */
function Detail({ m, stat, target, v, today }: { m: Mission; stat: MissionStat | undefined; target: string; v: View; today: string }) {
  const ended = m.mode === "dated" && m.ends_on < today;
  const pending = stat?.pending ?? 0;
  const versesWeek = v.w === "past" || v.w < v.thisWeek ? v.thisWeek : v.w;
  const hidden = (
    <>
      <input type="hidden" name="id" value={m.id} />
      <input type="hidden" name="w" value={v.w} />
    </>
  );
  return (
    <Box className="max-[339px]:p-3.5">
      <div className="flex items-center gap-3">
        <ClayIcon name={m.icon} onWhite />
        <div className="flex min-w-0 grow flex-col items-start gap-1">
          <b className="text-[17px] leading-[1.3] tracking-[-0.02em]">{m.title}</b>
          <span className="flex flex-wrap gap-1">
            {m.mode === "fixed" ? <Tag tone="navy">고정 미션</Tag> : m.mode === "pool" ? <Tag tone="navy">순환 미션</Tag> : null}
            {m.is_challenge ? <Tag tone="warn">도전 미션</Tag> : null}
            {!m.active ? <Tag onWhite>그만 받음</Tag> : null}
          </span>
        </div>
      </div>
      {m.description ? <p className="m-0 text-[13px] leading-[19px] text-sub">{m.description}</p> : null}
      <div>
        <InfoField onGray label="확인 방법">
          {howText(m)}
        </InfoField>
        <InfoField onGray label="물방울 · 포인트">
          {weeklyDrops(m) === 0 ? `포인트만 · ${m.points}P` : `${dropsText(m)}개 · ${m.points}P`}
        </InfoField>
        <InfoField onGray label={m.mode === "dated" ? "기간" : "언제"}>
          {periodText(m)}
        </InfoField>
        <InfoField onGray label="대상">
          {target}
        </InfoField>
        {m.mode === "dated" ? (
          <form action={missionOpAction} className="flex items-center justify-between gap-2.5 border-b border-track text-[14px]">
            {hidden}
            <span className="shrink-0 text-mute">도전 미션</span>
            <span className="-mr-1.5 flex">
              <SwitchSubmit small on={m.is_challenge} label={`${m.title} 도전 미션`} name="op" value={m.is_challenge ? "challenge_off" : "challenge_on"} />
            </span>
          </form>
        ) : null}
        <InfoField onGray label={v.w === "past" ? "지금까지 완료" : "완료한 아이"}>
          {stat?.done ?? 0}명
        </InfoField>
        <InfoField onGray label="확인 기다리는 것">
          {pending > 0 ? (
            <Link href="/staff/approvals" className="text-staff">
              {pending}건
            </Link>
          ) : (
            "0건"
          )}
        </InfoField>
      </div>
      <div className="mt-1 flex flex-col gap-2">
        <div className="flex gap-2">
          {m.active ? (
            ended ? null : (
              <form action={missionOpAction} className="flex min-w-0 flex-1">
                {hidden}
                <BarButton tone="white" name="op" value="deactivate" label={`${m.title} 그만 받기`} className="min-w-0 flex-1">
                  그만 받기
                </BarButton>
              </form>
            )
          ) : (
            <form action={missionOpAction} className="flex min-w-0 flex-1">
              {hidden}
              <BarButton tone="white" name="op" value="activate" label={`${m.title} 다시 받기`} className="min-w-0 flex-1">
                다시 받기
              </BarButton>
            </form>
          )}
          <BarLink href={`${BASE}/${m.id}`} tone="solid" className="min-w-0 flex-1">
            고치기
          </BarLink>
        </div>
        {m.mode === "dated" || m.qr_code || (m.mode === "fixed" && m.kind === "verse") ? (
          <div className="flex gap-2">
            {m.mode === "dated" ? (
              <form action={missionOpAction} className="flex min-w-0 flex-1">
                {hidden}
                <BarButton tone="white" name="op" value="duplicate" label={`${m.title} 다음 주로 복사`} className="min-w-0 flex-1">
                  다음 주로 복사
                </BarButton>
              </form>
            ) : null}
            {m.mode === "fixed" && m.kind === "verse" ? (
              <BarLink href={`${BASE}/${m.id}/verses${versesWeek === v.thisWeek ? "" : `?w=${versesWeek}`}`} tone="white" className="min-w-0 flex-1">
                주별 말씀
              </BarLink>
            ) : null}
            {m.qr_code ? (
              <BarLink href={`${BASE}/${m.id}/qr`} tone="white" className="min-w-0 flex-1">
                QR 인쇄
              </BarLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </Box>
  );
}

/** The week's drops against the weekly cap, class by class where missions are aimed at a grade or a class. */
function DropNotice({ check, when }: { check: DropCheck; when: string }) {
  const totals = [...new Set(check.classes.map((c) => c.total))];
  if (!check.over && !check.under) return <Notice tone="navy">{when} 미션을 다 하면 물방울 {check.cap}개로, 한 주 한도와 딱 맞아요.</Notice>;
  if (totals.length === 1) {
    return (
      <Notice tone="warn" role="status">
        {when} 미션을 다 하면 물방울 {totals[0]}개예요. 한 주 한도는 {check.cap}개예요. {totals[0] > check.cap ? "넘는 만큼은 아이가 받지 못해요." : "한도보다 적게 모을 수 있어요."}
      </Notice>
    );
  }
  return (
    <div role="status" className="rounded-xl bg-warn-tint px-3.5 py-3 text-[14px] leading-5 font-bold text-warn">
      <p className="m-0">
        {when} 미션 물방울 합계가 한 주 한도({check.cap}개)와 달라요.
      </p>
      <ul className="m-0 pl-4 font-semibold">
        {check.classes
          .filter((c) => c.total !== check.cap)
          .map((c) => (
            <li key={c.name}>
              {c.name}: {c.total}개 ({c.total > check.cap ? "넘는 만큼은 받지 못해요" : "한도보다 적어요"})
            </li>
          ))}
      </ul>
    </div>
  );
}

/**
 * A list of missions: rows below lg (the open one shows its details right under it on a phone),
 * the mock's table from lg. `note` adds a line under a mission (this week's verses, its dates).
 */
function MissionList({
  list,
  open,
  v,
  part,
  stats,
  past,
  target,
  today,
  note,
  empty,
}: {
  list: Mission[];
  open: Mission | null;
  v: View;
  part: string;
  stats: Map<number, MissionStat>;
  past: boolean;
  target: (m: Mission) => string;
  today: string;
  note?: (m: Mission) => ReactNode;
  empty: string;
}) {
  if (list.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <>
      <ul className="m-0 flex list-none flex-col p-0 lg:hidden">
        {list.map((m) => {
          const on = open?.id === m.id;
          const extra = note?.(m);
          return (
            <li key={m.id} className={rowItemClass}>
              <RowLink
                href={href(v, { id: on ? null : m.id }, part)}
                selected={on}
                left={<ClayIcon name={m.icon} size="s" />}
                title={
                  <>
                    {m.title}
                    <MissionTags m={m} past={past} />
                  </>
                }
                sub={
                  <>
                    <span className="block">
                      {howText(m)} · {rewardText(m)}
                    </span>
                    <span className="block">{past ? `${periodText(m)} · ${target(m)}` : `${target(m)} · 완료 ${stats.get(m.id)?.done ?? 0}명`}</span>
                    {extra ? <span className="block">{extra}</span> : null}
                  </>
                }
                right={
                  <span className={on ? "max-md:rotate-90" : ""}>
                    <Chevron />
                  </span>
                }
              />
              {on ? (
                <div className="pb-3.5 md:hidden">
                  <Detail m={m} stat={stats.get(m.id)} target={target(m)} v={v} today={today} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="hidden lg:block">
        <Card>
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass()}>
                  미션
                </th>
                <th scope="col" className={thClass()}>
                  확인 방법
                </th>
                <th scope="col" className={thClass({ center: true })}>
                  물방울
                </th>
                <th scope="col" className={thClass({ center: true })}>
                  포인트
                </th>
                <th scope="col" className={thClass({ center: true })}>
                  완료
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const on = open?.id === m.id;
                const td = (center = false) => tdClass({ selected: on, center, nowrap: center });
                const extra = note?.(m);
                return (
                  <tr key={m.id} className={rowClass}>
                    <td className={td()}>
                      <div className="flex items-center gap-2.5">
                        <ClayIcon name={m.icon} size="xs" onWhite={on} />
                        <span className="flex min-w-0 flex-col">
                          <span>
                            <Link href={href(v, { id: on ? null : m.id }, part)} scroll={false} aria-current={on ? "true" : undefined} className="font-bold text-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
                              {m.title}
                            </Link>
                            <MissionTags m={m} long={on} past={past} />
                          </span>
                          {past ? <span className="text-[12px] text-mute">{periodText(m)}</span> : null}
                          {extra ? <span className="text-[12px] text-mute">{extra}</span> : null}
                        </span>
                      </div>
                    </td>
                    <td className={td()}>{howText(m)}</td>
                    <td className={`${td(true)} ${weeklyDrops(m) === 0 ? "text-mute" : ""}`}>{dropsText(m)}</td>
                    <td className={`${td(true)} font-bold text-blue`}>{m.points}P</td>
                    <td className={td(true)}>{stats.get(m.id)?.done ?? 0}명</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

/** "이번 주 말씀 쓰기" in the list: the week's verses, or a warning that there are none. */
function verseNote(v: WeekVerses | null | undefined): ReactNode {
  const n = v?.verses.length ?? 0;
  if (n === 0) return <span className="font-semibold text-warn">이 주 말씀이 아직 없어요</span>;
  return `${v?.ref ?? "말씀"} · ${n}절`;
}

/** When a rotating mission was last on: "마지막 11월 2주차", or that it never was. */
function lastUsedText(m: PoolMission, thisWeek: string): string {
  return m.last_used ? `마지막 ${weekLabel(m.last_used)}${m.last_used === thisWeek ? "(이번 주)" : ""}` : "아직 안 나왔어요";
}

/** One rotating mission in the pool of a week that can no longer be changed. */
function poolLabel(m: PoolMission, thisWeek: string): ReactNode {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="break-keep">{m.title}</span>
      <span className="text-[12.5px] font-medium text-mute">
        {rewardText(m)} · {lastUsedText(m, thisWeek)}
      </span>
    </span>
  );
}

export default async function MissionsAdminPage({ searchParams }: PageProps<"/staff/admin/missions">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const today = todayKst();
  const thisWeek = weekStart(today);
  const past = sp.w === "past";
  const week = !past && isDate(sp.w) ? weekStart(sp.w) : thisWeek;
  const v: View = { w: past ? "past" : week, id: toInt(sp.id), thisWeek };

  const [list, later, classes, check, copyPlan, plan, fixedAll] = await Promise.all([
    past ? listMissions(staff).then((l) => l?.past ?? null) : weekMissions(staff, week, today),
    missionWeeksFrom(staff, addDays(thisWeek, -7)),
    listClasses(db, true),
    past ? null : weeklyDropCheck(staff, week),
    // Only this week and later weeks can be filled with copies.
    !past && week >= thisWeek ? weekCopyPlan(staff, week) : null,
    past ? null : weekPlan(staff, week, { today }),
    listFixedMissions(staff),
  ]);
  if (!list || !later || !fixedAll) return null;

  const dated = past ? list : list.filter((m) => m.mode === "dated");
  const rotating = plan?.rotating ?? [];
  const pool = plan?.pool ?? [];
  // Every mission that can be open: the week's three parts, and the whole pool (a resting one opens from the picker).
  const all = past ? list : [...fixedAll, ...pool.filter((m) => !rotating.some((r) => r.id === m.id)), ...rotating, ...dated];
  const stats = (await missionStats(staff, [...new Set(all.map((m) => m.id))], past ? null : week)) ?? new Map<number, MissionStat>();
  const verseMissions = past ? [] : fixedAll.filter((m) => m.active && m.kind === "verse");
  const verses = new Map(await Promise.all(verseMissions.map(async (m) => [m.id, await getWeekVerses(staff, m.id, week, { today })] as const)));
  const missingVerses = week >= thisWeek && !past ? verseMissions.find((m) => (verses.get(m.id)?.verses.length ?? 0) === 0) : undefined;

  // Last week, this week and next week are always offered, then every later week that has a dated mission, and the week being looked at.
  const weeks = [...new Set([addDays(thisWeek, -7), thisWeek, addDays(thisWeek, 7), ...later, ...(past ? [] : [week])])].sort();
  const chipText = (w: string) => `${weekLabel(w)}${w === thisWeek ? " · 이번 주" : w > thisWeek ? " · 준비 중" : ""}`;
  const when = week === thisWeek ? "이번 주" : weekLabel(week);
  const target = (m: Mission) => (m.target_class_id !== null ? (classes.find((c) => c.id === m.target_class_id)?.name ?? "반") : m.target_grade !== null ? `${m.target_grade}학년` : "소년부 전체");
  const open = v.id !== null ? (all.find((m) => m.id === v.id) ?? null) : null;
  const newHref = past || week === thisWeek ? `${BASE}/new` : `${BASE}/new?w=${week}`;

  // Copying dated missions from the week before: the admin ticks which ones. One-day and other
  // short missions (an event of that week) start unticked.
  const copyFrom = copyPlan && copyPlan.copy.length > 0 ? copyPlan.from : null;
  const copyLabel = copyFrom === null ? "" : copyFrom === addDays(thisWeek, -7) ? "지난주 기간 미션 복사" : copyFrom === thisWeek ? "이번 주 기간 미션 복사" : `${weekLabel(copyFrom)} 기간 미션 복사`;
  const copyForm =
    copyPlan && copyFrom !== null ? (
      <details className="group rounded-[20px] bg-fill">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-[20px] px-4 text-[14px] font-bold text-ink2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff [&::-webkit-details-marker]:hidden">
          <span className="grow">
            {copyLabel} ({copyPlan.copy.length}개)
          </span>
          <span className="transition-transform group-open:rotate-90">
            <Chevron />
          </span>
        </summary>
        <form action={missionCopyWeekAction} className="flex flex-col gap-2.5 px-4 pb-4 max-[339px]:px-3">
          <input type="hidden" name="to" value={week} />
          <input type="hidden" name="pick" value="1" />
          <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
            <legend className="mb-1 p-0 text-[13px] leading-[19px] text-sub">{weekLabel(week)}에도 낼 미션에 표시해 주세요. 고정 미션과 순환 미션은 복사하지 않아도 매주 나와요.</legend>
            <ul className="m-0 list-none p-0">
              {copyPlan.copy.map((m) => {
                const wholeWeek = m.starts_on === copyFrom && m.ends_on === addDays(copyFrom, 6);
                return (
                  <li key={m.id} className="border-b border-track py-1 last:border-b-0">
                    <Checkbox
                      name="mission_ids"
                      value={m.id}
                      defaultChecked={wholeWeek}
                      label={
                        <span className="flex min-w-0 flex-col">
                          <span className="break-keep">{m.title}</span>
                          <span className="text-[12.5px] font-medium text-mute">
                            {rewardText(m)}
                            {wholeWeek ? "" : ` · ${periodText(m)}에만 있던 미션`}
                          </span>
                        </span>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {copyPlan.already.length > 0 ? <p className="m-0 text-[12.5px] leading-[18px] text-mute">이미 복사된 {copyPlan.already.length}개는 여기에 나오지 않아요.</p> : null}
          <div className="flex">
            <BarButton tone="solid">표시한 미션 복사하기</BarButton>
          </div>
        </form>
      </details>
    ) : null;

  // For the pool picker: what a child can get this week without the rotating missions.
  const countedElsewhere = [...fixedAll.filter((m) => m.active), ...dated.filter((m) => m.active)];
  const otherDrops = countedElsewhere.reduce((sum, m) => sum + weeklyDrops(m), 0);
  const targeted = [...countedElsewhere, ...pool].some((m) => m.target_class_id !== null || m.target_grade !== null);

  const listProps = { open, v, stats, past, target, today };
  const rotationNote = !plan
    ? ""
    : plan.manual
      ? "직접 고른 미션이에요."
      : plan.stored
        ? "오래 안 나온 미션부터 자동으로 골랐어요."
        : week > thisWeek
          ? "이렇게 나올 예정이에요. 그 주가 되면 자동으로 정해져요."
          : "이 주에는 정해진 순환 미션이 없었어요.";
  const rotationTag = !plan ? "" : plan.manual ? "직접 고름" : plan.stored ? "자동" : week > thisWeek ? "미리보기" : "없음";

  const parts = plan ? (
    <>
      {/* ---------- 고정 미션 ---------- */}
      <section id="fixed" aria-labelledby="fixed-title" className="flex min-w-0 scroll-mt-4 flex-col gap-2">
        <SectionHead note="매주 나와요" right={fixedAll.length > 0 ? <BarLink href={`${BASE}/new?mode=fixed`}>+ 추가</BarLink> : null}>
          <span id="fixed-title">고정 미션</span>
        </SectionHead>
        {fixedAll.length === 0 ? (
          <Box>
            <p className="m-0 text-[14px] leading-[21px] font-semibold text-ink2">아직 고정 미션이 없어요. 매주 나오는 미션 네 가지를 한 번에 만들 수 있어요.</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] leading-[19px] text-sub">
              {DEFAULT_FIXED_MISSIONS.map((m) => (
                <li key={m.title}>
                  <b className="text-ink2">{m.title}</b> · {m.drops > 0 ? `물방울 ${m.drops}개 · ${m.points}P` : `매일 · 포인트만 ${m.points}P`}
                </li>
              ))}
            </ul>
            <p className="m-0 text-[12.5px] leading-[18px] text-mute">만든 뒤에 하나씩 고칠 수 있어요. ‘이번 주 말씀 쓰기’는 말씀을 넣어야 아이에게 보여요.</p>
            <form action={planCreateFixedAction} className="flex">
              <input type="hidden" name="w" value={week} />
              <BarButton tone="solid">고정 미션 4개 만들기</BarButton>
            </form>
          </Box>
        ) : (
          <MissionList {...listProps} list={fixedAll} part="fixed" note={(m) => (m.active && m.kind === "verse" ? verseNote(verses.get(m.id)) : null)} empty="" />
        )}
      </section>

      {/* ---------- 순환 미션 ---------- */}
      <section id="rotation" aria-labelledby="rotation-title" className="flex min-w-0 scroll-mt-4 flex-col gap-2">
        <SectionHead note={`한 주 ${plan.perWeek}개`} right={<BarLink href={`${BASE}/new?mode=pool`}>+ 보관함에 추가</BarLink>}>
          <span id="rotation-title">순환 미션</span>
        </SectionHead>
        <p className="m-0 flex flex-wrap items-center gap-1.5 text-[13px] leading-[19px] text-sub">
          <Tag tone={plan.manual ? "navy" : "gray"}>{rotationTag}</Tag>
          {rotationNote}
        </p>
        <MissionList {...listProps} list={rotating} part="rotation" empty={pool.length === 0 ? "보관함이 비어 있어요. ‘+ 보관함에 추가’로 순환 미션을 넣어 주세요." : "이 주에는 순환 미션이 없어요."} />
        {plan.editable && plan.manual ? (
          <form action={planRotationResetAction} className="flex">
            <input type="hidden" name="w" value={week} />
            <ConfirmButton message={`${plan.label} 순환 미션을 자동으로 되돌릴까요?\n오래 안 나온 미션부터 다시 골라요.`} className={barButtonClass("ghost")}>
              자동으로 되돌리기
            </ConfirmButton>
          </form>
        ) : null}
        {/* A resting rotating mission has no row of its own: on a phone its details open here. */}
        {open && open.mode === "pool" && !rotating.some((r) => r.id === open.id) ? (
          <div className="md:hidden">
            <Detail m={open} stat={stats.get(open.id)} target={target(open)} v={v} today={today} />
          </div>
        ) : null}
        {pool.length > 0 ? (
          <details className="group rounded-[20px] bg-fill">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-[20px] px-4 text-[14px] font-bold text-ink2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff [&::-webkit-details-marker]:hidden">
              <span className="grow">{plan.editable ? `보관함에서 고르기 (${pool.length}개)` : `보관함 보기 (${pool.length}개)`}</span>
              <span className="transition-transform group-open:rotate-90">
                <Chevron />
              </span>
            </summary>
            <div className="flex flex-col gap-3 px-4 pb-4 max-[339px]:px-3">
              {plan.editable ? (
                <form action={planRotationAction} className="flex flex-col gap-2.5">
                  <input type="hidden" name="w" value={week} />
                  <PoolPicker
                    legend={`${when}에 낼 미션에 표시하고 아래 버튼을 눌러 주세요.`}
                    choices={pool
                      .filter((m) => m.active)
                      .map((m) => ({ id: m.id, title: m.title, sub: `${rewardText(m)} · ${lastUsedText(m, thisWeek)}`, drops: weeklyDrops(m), href: href(v, { id: m.id }, "rotation") }))}
                    chosen={rotating.map((m) => m.id)}
                    other={otherDrops}
                    cap={check?.cap ?? 12}
                    targeted={targeted}
                  />
                  <div className="flex">
                    <BarButton tone="solid">{when} 미션으로 정하기</BarButton>
                  </div>
                </form>
              ) : (
                <ul className="m-0 list-none p-0">
                  {pool
                    .filter((m) => m.active)
                    .map((m) => (
                      <li key={m.id} className="border-b border-track py-2 text-[14px] font-semibold text-ink2 last:border-b-0">
                        {poolLabel(m, thisWeek)}
                      </li>
                    ))}
                </ul>
              )}
              {pool.some((m) => !m.active) ? (
                <p className="m-0 text-[12.5px] leading-[18px] text-mute">
                  그만 받는 미션은 나오지 않아요:{" "}
                  {pool
                    .filter((m) => !m.active)
                    .map((m, i) => (
                      <span key={m.id}>
                        {i > 0 ? ", " : ""}
                        <Link href={href(v, { id: m.id }, "rotation")} className="text-staff">
                          {m.title}
                        </Link>
                      </span>
                    ))}
                </p>
              ) : null}
              <form action={planPerWeekAction} className="flex flex-wrap items-end gap-2 border-t border-track pt-3">
                <input type="hidden" name="w" value={week} />
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[13px] leading-[1.4] font-semibold text-ink2">한 주에 자동으로 나오는 개수</span>
                  <select name="per_week" defaultValue={plan.perWeek} className={`${selectBoxClass()} w-[120px]`}>
                    {Array.from({ length: ROTATING_MAX + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}개
                      </option>
                    ))}
                  </select>
                </label>
                <BarButton tone="white">
                  개수 바꾸기
                </BarButton>
                <p className="m-0 w-full text-[12.5px] leading-[18px] text-mute">이미 정해진 주는 그대로예요. 다음에 정하는 주부터 바뀌어요.</p>
              </form>
            </div>
          </details>
        ) : null}
      </section>

      {/* ---------- 기간 미션 ---------- */}
      <section id="dated" aria-labelledby="dated-title" className="flex min-w-0 scroll-mt-4 flex-col gap-2">
        <SectionHead note="정한 날짜에만 나와요" right={<BarLink href={newHref}>+ 추가</BarLink>}>
          <span id="dated-title">기간 미션</span>
        </SectionHead>
        {copyForm}
        <MissionList {...listProps} list={dated} part="dated" note={(m) => (m.starts_on === weekStart(m.starts_on) && m.ends_on === addDays(m.starts_on, 6) ? null : periodText(m))} empty="이 주에는 기간 미션이 없어요." />
      </section>
    </>
  ) : null;

  return (
    <AdminPage>
      <AdminHeader
        title="미션 계획"
        phoneRight={<RoundLink href={newHref} label="미션 만들기" icon="plus" />}
        wideRight={
          <BarLink href={newHref} tone="solid">
            + 미션 만들기
          </BarLink>
        }
      />
      <FlashNote ok={sp.ok} error={sp.error} />
      <Chips label="주 고르기">
        {weeks.map((w) => (
          <Chip key={w} href={href(v, { w, id: null })} on={!past && w === week}>
            {chipText(w)}
          </Chip>
        ))}
        <Chip href={href(v, { w: "past", id: null })} on={past}>
          지난 미션
        </Chip>
      </Chips>
      {missingVerses ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warn-tint px-3.5 py-3 text-[14px] leading-5 font-bold text-warn">
          <span className="min-w-0 grow basis-[220px]">{week === thisWeek ? "이번 주" : `${weekLabel(week)}`} 말씀이 아직 없어요. 넣기 전에는 아이들에게 말씀 쓰기가 보이지 않아요.</span>
          <BarLink href={`${BASE}/${missingVerses.id}/verses${week === thisWeek ? "" : `?w=${week}`}`} tone="white">
            말씀 넣기
          </BarLink>
        </div>
      ) : null}
      {check && all.length > 0 ? <DropNotice check={check} when={when} /> : null}
      {past ? <p className="m-0 -my-1 text-[13px] text-mute">기간이 끝났거나 그만 받는 미션이에요. 기간 미션은 다음 주로 복사해서 다시 쓸 수 있어요.</p> : null}

      <div className={splitClass}>
        <div className="flex min-w-0 flex-col gap-6">{past ? <MissionList {...listProps} list={dated} part="list" empty="지난 미션이 없어요." /> : parts}</div>

        {/* From 768px: the open mission in the box at the right. */}
        <div className="hidden md:block">
          {open ? (
            <div className="sticky top-4">
              <Detail m={open} stat={stats.get(open.id)} target={target(open)} v={v} today={today} />
            </div>
          ) : (
            <Box>
              <p className="m-0 py-6 text-center text-[13px] leading-[1.5] whitespace-pre-line text-mute">{"미션을 누르면\n여기에 자세한 내용이 열려요."}</p>
            </Box>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
