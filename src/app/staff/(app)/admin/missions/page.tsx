import Link from "next/link";
import { AdminHeader, AdminPage, BarButton, RowLink, rowClass, rowItemClass, splitClass, tableClass, tdClass, thClass } from "@/components/staff/admin-kit";
import { SwitchSubmit } from "@/components/staff/form-kit";
import { BarLink, Box, Card, Chevron, Chip, Chips, ClayIcon, EmptyNote, FlashNote, InfoField, Notice, RoundLink, Tag, barButtonClass } from "@/components/staff/kit";
import { ConfirmButton } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseQuiz } from "@/lib/quiz";
import { listClasses } from "@/lib/staff/access";
import { missionCopyWeekAction, missionOpAction } from "@/lib/staff/actions-admin";
import { listMissions, missionStats, missionWeeksFrom, weekCopyPlan, weekMissions, weeklyDropCheck, type DropCheck, type MissionStat } from "@/lib/staff/admin-missions";
import { isDate, shortDate, toInt } from "@/lib/staff/util";
import { addDays, formatKoreanDate, todayKst, weekLabel, weekStart } from "@/lib/time";
import { KIND_NAMES, type Mission } from "@/lib/types";

export const metadata = { title: "미션 · 꿈의숲키우기" };

const BASE = "/staff/admin/missions";

/** What the list shows: one week (its Sunday) or the old missions ("past"), and the mission that is open. */
interface View {
  w: string;
  id: number | null;
  thisWeek: string;
}

function href(v: View, patch: Partial<Pick<View, "w" | "id">> = {}): string {
  const n = { ...v, ...patch };
  const p = new URLSearchParams();
  if (n.w !== n.thisWeek) p.set("w", n.w);
  if (n.id !== null) p.set("id", String(n.id));
  const s = p.toString();
  return s ? `${BASE}?${s}` : BASE;
}

/** 확인 방법, with what the mock adds to it: "퀴즈 5문제", "스스로 체크 · 주 3번". */
function howText(m: Mission): string {
  const n = m.kind === "quiz" ? (parseQuiz(m.quiz)?.length ?? 0) : 0;
  const kind = n > 0 ? `퀴즈 ${n}문제` : KIND_NAMES[m.kind];
  return m.repeat === "daily" ? `${kind} · 주 ${m.weekly_limit ?? 7}번` : m.repeat === "once" ? `${kind} · 한 번만` : kind;
}

const dropsText = (m: Mission) => (m.repeat === "daily" ? `${m.drops} × ${m.weekly_limit ?? 7}` : String(m.drops));

/** "11월 3주차" for a mission that runs exactly one week, otherwise its dates. */
function periodText(m: Mission): string {
  const ws = weekStart(m.starts_on);
  if (m.starts_on === ws && m.ends_on === addDays(ws, 6)) return weekLabel(ws);
  if (m.starts_on === m.ends_on) return formatKoreanDate(m.starts_on);
  return `${shortDate(m.starts_on)} ~ ${shortDate(m.ends_on)}`;
}

function MissionTags({ m, long = false }: { m: Mission; long?: boolean }) {
  if (!m.is_challenge && m.active) return null;
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-[2px]">
      {m.is_challenge ? <Tag tone="warn">{long ? "도전 미션" : "도전"}</Tag> : null}
      {!m.active ? <Tag onWhite={long}>그만 받음</Tag> : null}
    </span>
  );
}

/** One mission in full, with everything that can be done with it. On wide screens it is the box at the right; on phones it opens under its row. */
function Detail({ m, stat, target, v, today }: { m: Mission; stat: MissionStat | undefined; target: string; v: View; today: string }) {
  const ended = m.ends_on < today;
  const pending = stat?.pending ?? 0;
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
          {m.is_challenge || !m.active ? (
            <span className="flex flex-wrap gap-1">
              {m.is_challenge ? <Tag tone="warn">도전 미션</Tag> : null}
              {!m.active ? <Tag onWhite>그만 받음</Tag> : null}
            </span>
          ) : null}
        </div>
      </div>
      {m.description ? <p className="m-0 text-[13px] leading-[19px] text-sub">{m.description}</p> : null}
      <div>
        <InfoField onGray label="확인 방법">
          {howText(m)}
        </InfoField>
        <InfoField onGray label="물방울 · 포인트">
          {dropsText(m)}개 · {m.points}P
        </InfoField>
        <InfoField onGray label="기간">
          {periodText(m)}
        </InfoField>
        <InfoField onGray label="대상">
          {target}
        </InfoField>
        <form action={missionOpAction} className="flex items-center justify-between gap-2.5 border-b border-track text-[14px]">
          {hidden}
          <span className="shrink-0 text-mute">도전 미션</span>
          <span className="-mr-1.5 flex">
            <SwitchSubmit small on={m.is_challenge} label={`${m.title} 도전 미션`} name="op" value={m.is_challenge ? "challenge_off" : "challenge_on"} />
          </span>
        </form>
        <InfoField onGray label={v.w === "past" ? "지금까지 완료" : "완료한 아이"}>
          {stat?.done ?? 0}명
        </InfoField>
        <InfoField onGray label="확인 기다리는 것">
          {pending > 0 ? (
            <Link href="/staff/approvals" className="text-navy">
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
        <div className="flex gap-2">
          <form action={missionOpAction} className="flex min-w-0 flex-1">
            {hidden}
            <BarButton tone="white" name="op" value="duplicate" label={`${m.title} 다음 주로 복사`} className="min-w-0 flex-1">
              다음 주로 복사
            </BarButton>
          </form>
          {m.qr_code ? (
            <BarLink href={`${BASE}/${m.id}/qr`} tone="white" className="min-w-0 flex-1">
              QR 인쇄
            </BarLink>
          ) : null}
        </div>
      </div>
    </Box>
  );
}

/** This week's drops against the weekly cap, class by class where missions are aimed at a grade or a class. */
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

export default async function MissionsAdminPage({ searchParams }: PageProps<"/staff/admin/missions">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const today = todayKst();
  const thisWeek = weekStart(today);
  const past = sp.w === "past";
  const week = !past && isDate(sp.w) ? weekStart(sp.w) : thisWeek;
  const v: View = { w: past ? "past" : week, id: toInt(sp.id), thisWeek };

  const [list, later, classes, check, plan] = await Promise.all([
    past ? listMissions(staff).then((l) => l?.past ?? null) : weekMissions(staff, week),
    missionWeeksFrom(staff, addDays(thisWeek, -7)),
    listClasses(db, true),
    past ? null : weeklyDropCheck(staff, week),
    // Only this week and later weeks can be filled with copies.
    !past && week >= thisWeek ? weekCopyPlan(staff, week) : null,
  ]);
  if (!list || !later) return null;
  const stats = (await missionStats(staff, list.map((m) => m.id), past ? null : week)) ?? new Map<number, MissionStat>();

  // Last week, this week and next week are always offered, then every later week that has a mission, and the week being looked at.
  const weeks = [...new Set([addDays(thisWeek, -7), thisWeek, addDays(thisWeek, 7), ...later, ...(past ? [] : [week])])].sort();
  const chipText = (w: string) => `${weekLabel(w)}${w === thisWeek ? " · 이번 주" : w > thisWeek ? " · 준비 중" : ""}`;
  const when = week === thisWeek ? "이번 주" : weekLabel(week);
  const target = (m: Mission) => (m.target_class_id !== null ? (classes.find((c) => c.id === m.target_class_id)?.name ?? "반") : m.target_grade !== null ? `${m.target_grade}학년` : "소년부 전체");
  const open = v.id !== null ? (list.find((m) => m.id === v.id) ?? null) : null;
  const newHref = past || week === thisWeek ? `${BASE}/new` : `${BASE}/new?w=${week}`;
  const totals = check ? [...new Set(check.classes.map((c) => c.total))].sort((a, b) => a - b) : [];

  const copyFrom = plan && plan.copy.length > 0 ? plan.from : null;
  const copyLabel = copyFrom === null ? "" : copyFrom === addDays(thisWeek, -7) ? "지난주 미션 복사" : copyFrom === thisWeek ? "이번 주 미션 복사" : `${weekLabel(copyFrom)} 미션 복사`;
  const copyForm =
    plan && copyFrom !== null ? (
      <form action={missionCopyWeekAction} className="flex">
        <input type="hidden" name="to" value={week} />
        <ConfirmButton
          message={`${weekLabel(copyFrom)} 미션 ${plan.copy.length}개를 ${weekLabel(week)}로 복사할까요?${plan.already.length > 0 ? `\n이미 있는 ${plan.already.length}개는 그대로 둬요.` : ""}`}
          className={barButtonClass("ghost")}
        >
          {copyLabel}
        </ConfirmButton>
      </form>
    ) : null;

  return (
    <AdminPage>
      <AdminHeader
        title="미션"
        phoneRight={<RoundLink href={newHref} label="미션 만들기" icon="plus" />}
        wideRight={
          <>
            {copyForm}
            <BarLink href={newHref} tone="solid">
              + 미션 만들기
            </BarLink>
          </>
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
      {copyForm ? <div className="flex lg:hidden">{copyForm}</div> : null}
      {/* On wide screens the last row of the table says it when the total fits; the notice stays for a total that does not. */}
      {check && list.length > 0 ? (
        <div className={check.over || check.under ? "" : "lg:hidden"}>
          <DropNotice check={check} when={when} />
        </div>
      ) : null}
      {past ? <p className="m-0 -my-1 text-[13px] text-mute">기간이 끝났거나 그만 받는 미션이에요. 다음 주로 복사해서 다시 쓸 수 있어요.</p> : null}

      <div className={splitClass}>
        <div className="flex min-w-0 flex-col">
          {/* Below lg: mission-style rows. On a phone the open one shows its details right under it; from 768px they are in the box at the right. */}
          <ul className="m-0 flex list-none flex-col p-0 lg:hidden">
            {list.map((m) => {
              const on = open?.id === m.id;
              return (
                <li key={m.id} className={rowItemClass}>
                  <RowLink
                    href={href(v, { id: on ? null : m.id })}
                    selected={on}
                    left={<ClayIcon name={m.icon} size="s" />}
                    title={
                      <>
                        {m.title}
                        <MissionTags m={m} />
                      </>
                    }
                    sub={
                      <>
                        <span className="block">
                          {howText(m)} · 물방울 {dropsText(m)} · {m.points}P
                        </span>
                        <span className="block">{past ? `${periodText(m)} · ${target(m)}` : `${target(m)} · 완료 ${stats.get(m.id)?.done ?? 0}명`}</span>
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
          {list.length === 0 ? (
            <div className="lg:hidden">
              <EmptyNote>{past ? "지난 미션이 없어요." : "이 주에는 아직 미션이 없어요."}</EmptyNote>
            </div>
          ) : null}

          {/* From lg: the mock's table. */}
          <div className="hidden lg:block">
            <Card>
              {list.length > 0 ? (
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
                      return (
                        <tr key={m.id} className={rowClass}>
                          <td className={td()}>
                            <div className="flex items-center gap-2.5">
                              <ClayIcon name={m.icon} size="xs" onWhite={on} />
                              <span className="flex min-w-0 flex-col">
                                <span>
                                  <Link href={href(v, { id: on ? null : m.id })} scroll={false} aria-current={on ? "true" : undefined} className="font-bold text-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
                                    {m.title}
                                  </Link>
                                  <MissionTags m={m} long={on} />
                                </span>
                                {past ? <span className="text-[12px] text-mute">{periodText(m)}</span> : null}
                              </span>
                            </div>
                          </td>
                          <td className={td()}>{howText(m)}</td>
                          <td className={td(true)}>{dropsText(m)}</td>
                          <td className={`${td(true)} font-bold text-blue`}>{m.points}P</td>
                          <td className={td(true)}>{stats.get(m.id)?.done ?? 0}명</td>
                        </tr>
                      );
                    })}
                    {check ? (
                      <tr className={rowClass}>
                        <td className={`${tdClass()} text-mute`}>한 주에 모을 수 있는 물방울</td>
                        <td className={tdClass()}>
                          <span className="flex flex-wrap items-center gap-1.5 text-mute">
                            한 주 한도 {check.cap}개
                            <Tag tone={check.over ? "danger" : check.under ? "warn" : "navy"}>{check.over ? "한도를 넘어요" : check.under ? "한도보다 적어요" : "딱 맞아요"}</Tag>
                          </span>
                        </td>
                        <td className={tdClass({ center: true, nowrap: true })}>
                          <b>{totals.length > 1 ? `${totals[0]}~${totals[totals.length - 1]}` : (totals[0] ?? 0)}</b>
                        </td>
                        <td className={tdClass()} />
                        <td className={tdClass()} />
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              ) : (
                <EmptyNote>{past ? "지난 미션이 없어요." : "이 주에는 아직 미션이 없어요."}</EmptyNote>
              )}
            </Card>
          </div>
        </div>

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
