import Link from "next/link";
import { BackLink, Circle, H1, Icon, KidTabBar, Pill, Row, Sub } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { dropBalance, getSettings, missionsForChild, weekDropsEarned, type MissionForChild } from "@/lib/game";
import { weekAwards } from "@/lib/kid/queries";
import { weekStart } from "@/lib/time";

export const metadata = { title: "미션 · 꿈의숲키우기" };

const ORDER = { available: 0, pending: 1, done: 2 } as const;

function subLine(m: MissionForChild, received: number): string {
  if (m.state === "pending") return "선생님이 확인하고 있어요";
  const left = Math.max(0, (m.weekly_limit ?? 7) - m.done_this_week);
  if (m.state === "done") {
    if (m.repeat === "daily") return left > 0 ? `오늘은 했어요 · 이번 주 ${left}번 남음` : "이번 주에 할 만큼 다 했어요";
    const got = received > 0 ? `물방울 ${received}개 받음` : "완료";
    return m.description ? `${m.description} · ${got}` : got;
  }
  if (m.repeat === "daily") return `하루 한 번 · 이번 주 ${left}번 남음`;
  return m.description;
}

export default async function MissionsPage() {
  const kid = await requireKid();
  const ws = weekStart();
  const [missions, drops, settings, earned, awards] = await Promise.all([missionsForChild(db, kid.id), dropBalance(db, kid.id), getSettings(), weekDropsEarned(db, kid.id, ws), weekAwards(kid.id, ws)]);
  const list = [...missions].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const room = Math.max(0, settings.weeklyDropCap - earned);
  const open = missions.filter((m) => m.state === "available");
  // Each mission is capped on its own, so the total is capped again by what is left this week.
  const canGet = Math.min(room, open.reduce((n, m) => n + m.drops_now, 0));
  const capped = room === 0;

  let title = `미션하고 물방울 ${canGet}개 받기`;
  let sub = `이번 주에 받을 수 있는 물방울은 모두 ${settings.weeklyDropCap}개예요. 지금까지 ${earned}개 받았어요.`;
  if (capped) {
    title = "이번 주 물방울을 모두 받았어요";
    sub = `한 주에 ${settings.weeklyDropCap}개까지 받을 수 있어요. 남은 미션을 하면 포인트는 계속 쌓이고, 물방울은 다음 주일부터 다시 받아요.`;
  } else if (open.length === 0) {
    title = "이번 주 미션을 모두 했어요";
  }

  return (
    <>
      <main className="flex grow flex-col bg-white">
        <div className="flex items-center justify-between pt-[max(8px,env(safe-area-inset-top))] pr-4 pl-2">
          <BackLink href="/home" label="내 나무로 돌아가기" />
          <div className="flex h-[34px] items-center gap-1 rounded-[17px] bg-fill pr-[13px] pl-2 text-[14px] font-bold tracking-[-0.2px]">
            <Icon name="drop" size={22} />내 물방울 {drops}개
          </div>
        </div>
        <div className="flex grow flex-col px-4 pt-4 pb-4">
          <H1>{title}</H1>
          <Sub className="mt-2 mb-3.5">{sub}</Sub>
          {list.length === 0 ? <p className="mt-10 text-center text-[15px] text-sub">이번 주 미션이 아직 없어요</p> : null}
          {list.map((m, i) => {
            const label = m.state === "pending" ? "확인 중" : m.state === "done" ? "완료" : m.drops_now > 0 ? `물방울 ${m.drops_now}개` : "포인트만";
            const pill = <Pill tone={m.state === "available" ? "navy" : "gray"}>{label}</Pill>;
            return (
              <Row
                key={m.id}
                last={i === list.length - 1}
                left={
                  <Circle>
                    <Icon name={m.icon} size={36} />
                  </Circle>
                }
                title={m.title}
                extra={
                  <>
                    {m.points > 0 ? <span className="shrink-0 text-[13px] font-bold text-blue">{m.points}P</span> : null}
                    {m.is_challenge ? <span className="inline-flex h-5 shrink-0 items-center self-center rounded-[5px] bg-warn-tint px-1.5 text-[11px] font-bold text-warn">이번 주 도전</span> : null}
                  </>
                }
                sub={subLine(m, awards.get(m.id) ?? 0)}
                right={
                  m.state === "available" ? (
                    <Link href={`/missions/${m.id}`} aria-label={`${m.title} 하러 가기, ${label}`} className="flex h-11 shrink-0 items-center no-underline">
                      {pill}
                    </Link>
                  ) : (
                    <div className="flex h-11 shrink-0 items-center">{pill}</div>
                  )
                }
              />
            );
          })}
        </div>
      </main>
      <KidTabBar active="/missions" />
    </>
  );
}
