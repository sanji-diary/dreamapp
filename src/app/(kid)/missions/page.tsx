import Link from "next/link";
import { GameCatchUp } from "@/components/kid/GameCatchUp";
import { BackLink, Circle, H1, Icon, KidTabBar, Pill, Row, Sub } from "@/components/ui";
import { findGame } from "@/games/registry";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { dropBalance, getSettings, missionsForChild, weekDropsEarned } from "@/lib/game";
import { hasUnsettledGame } from "@/lib/kid/hosted-game";
import { listHeadline, missionSubLine, pillLabel, pillShowsPoints } from "@/lib/kid/mission-text";
import { weekAwards } from "@/lib/kid/queries";
import { weekStart } from "@/lib/time";

export const metadata = { title: "미션 · 꿈의숲키우기" };

const ORDER = { available: 0, pending: 1, done: 2 } as const;

export default async function MissionsPage() {
  const kid = await requireKid();
  const ws = weekStart();
  const [missions, drops, settings, earned, awards, catchUp] = await Promise.all([missionsForChild(db, kid.id), dropBalance(db, kid.id), getSettings(), weekDropsEarned(db, kid.id, ws), weekAwards(kid.id, ws), hasUnsettledGame(kid.id)]);
  // The library hands the missions over in plan order (fixed, rotating, dated); the stable sort keeps that inside each group.
  const list = [...missions].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const { title, sub } = listHeadline(missions, settings.weeklyDropCap, earned);

  return (
    <>
      {catchUp ? <GameCatchUp /> : null}
      <main className="flex grow flex-col bg-white">
        <div className="flex items-center justify-between pt-[max(8px,env(safe-area-inset-top))] pr-4 pl-2">
          <BackLink href="/home" label="내 나무로 돌아가기" />
          <div className="flex h-[34px] items-center gap-1 rounded-[17px] bg-fill pr-[13px] pl-2 text-[14px] font-bold tracking-[-0.2px]">
            <Icon name="drop" size={22} />내 물방울 {drops}개
          </div>
        </div>
        <div className="flex grow flex-col px-4 pt-4 pb-4">
          <H1 className="break-keep [overflow-wrap:anywhere]">{title}</H1>
          <Sub className="mt-2 mb-3.5 break-keep [overflow-wrap:anywhere]">{sub}</Sub>
          {list.length === 0 ? <p className="mt-10 text-center text-[15px] text-sub">이번 주 미션이 아직 없어요</p> : null}
          {list.map((m, i) => {
            const label = pillLabel(m);
            const pill = <Pill tone={m.state === "available" ? "navy" : "gray"}>{label}</Pill>;
            const line = missionSubLine(m, awards.get(m.id) ?? 0);
            // A game can be opened again after it is done: once more for fun, or to help a friend. Nothing more is given.
            const game = m.kind === "game" && m.state === "done" ? findGame(m.game_id) : null;
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
                    {m.points > 0 && !pillShowsPoints(m) ? <span className="shrink-0 text-[13px] font-bold text-blue">{m.points}P</span> : null}
                    {m.kind === "game" ? <span className="inline-flex h-5 shrink-0 items-center self-center rounded-[5px] bg-navy-tint px-1.5 text-[11px] font-bold text-navy">미션게임</span> : null}
                    {m.is_challenge ? <span className="inline-flex h-5 shrink-0 items-center self-center rounded-[5px] bg-warn-tint px-1.5 text-[11px] font-bold text-warn">이번 주 도전</span> : null}
                  </>
                }
                sub={m.returned ? <span className="font-semibold text-warn">{line}</span> : line}
                right={
                  m.state === "available" ? (
                    <Link href={`/missions/${m.id}`} aria-label={`${m.title} 하러 가기, ${label}`} className="flex h-11 shrink-0 items-center no-underline">
                      {pill}
                    </Link>
                  ) : game ? (
                    <Link href={`/missions/${m.id}`} aria-label={`${m.title} 완료, ${game.players > 1 ? "친구 도와주러 가기" : "한 번 더 하러 가기"}`} className="flex h-11 shrink-0 items-center no-underline">
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
