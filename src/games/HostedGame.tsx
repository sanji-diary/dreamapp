"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { claimGameAction } from "@/lib/kid/mission-actions";

const buttonClass = "h-[54px] w-full cursor-pointer rounded-[14px] border-0 bg-navy text-[17px] font-bold tracking-[-0.3px] text-white disabled:cursor-default disabled:bg-fill disabled:text-sub";
const quietButtonClass = "h-11 cursor-pointer rounded-xl border-0 bg-fill px-4 text-[15px] font-bold text-ink2";

interface Props {
  /** The game's own name ("한 마리 어디 갔어?"). The mission title stays in the shell above. */
  title: string;
  playersLine: string;
  goal: string;
  /** Two children play together: the screen explains how to meet in one room. */
  together: boolean;
  /** False when the child has already done the mission and plays once more (alone, or to help a friend). */
  open: boolean;
  launch: { launchId: string; gameUrl: string; gameOrigin: string; remoteId: string };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A mission game that runs on its own game server, shown in a frame over the whole screen.
 *
 * The frame only tells this screen "finished"; whether that is true is asked of the game server by
 * our server (claimGameAction). When the message never comes (the app is closed, the connection
 * drops), the next visit to the home screen or the mission list finds the finished game.
 */
export function HostedGame({ title, playersLine, goal, together, open, launch }: Props) {
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const handled = useRef(new Set<string>());
  const asked = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [note, setNote] = useState<"saving" | "thanks" | "late" | null>(null);

  // Coming back to this screen: a game finished earlier may still be waiting to be counted.
  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    claimGameAction(launch.launchId)
      .then((r) => {
        if (r.status === "awarded" && r.completionId !== null) router.replace(`/missions/done/${r.completionId}`);
      })
      .catch(() => {});
  }, [open, launch.launchId, router]);

  useEffect(() => {
    if (!playing) return;
    const onMessage = async (e: MessageEvent) => {
      // Only the game in our frame, only for this child's own launch.
      if (e.origin !== launch.gameOrigin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: unknown; version?: unknown; gameId?: unknown; launchId?: unknown; roundId?: unknown } | null;
      if (!d || d.type !== "dreamforest.minigame.completed" || d.version !== 1 || d.gameId !== launch.remoteId || d.launchId !== launch.launchId) return;
      if (typeof d.roundId !== "string" || d.roundId === "" || d.roundId.length > 100 || handled.current.has(d.roundId)) return;
      handled.current.add(d.roundId);
      const round = d.roundId;
      if (open) setNote("saving");
      // True once a try got no answer: that try may have been recorded all the same.
      let unanswered = false;
      for (let i = 0; i < 4; i++) {
        try {
          const r = await claimGameAction(launch.launchId, round);
          if (r.status === "awarded" && r.completionId !== null) {
            router.replace(`/missions/done/${r.completionId}`);
            return;
          }
          if (r.status === "already") {
            if (unanswered && r.completionId !== null) {
              router.replace(`/missions/done/${r.completionId}`);
              return;
            }
            // Finished with nothing left to give: thanks for helping. A round recorded long ago
            // (the game restored an old room and said it again) is passed over without a word.
            setNote(r.fresh ? "thanks" : null);
            return;
          }
          if (r.status === "not_yours") break;
        } catch {
          unanswered = true;
        }
        await wait(1500);
      }
      setNote(open ? "late" : null);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playing, open, launch, router]);

  if (!playing) {
    return (
      <>
        <div className="mx-5 mt-5 flex flex-col gap-2 rounded-2xl bg-fill px-4 py-4">
          <p className="m-0 text-[13px] font-bold text-navy">이번 주 미션게임</p>
          <p className="m-0 text-[19px] leading-[26px] font-extrabold tracking-[-0.4px] break-keep">{title}</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14.5px] leading-[21px] break-keep text-ink2">
            <li>{playersLine}</li>
            <li>{goal}</li>
            <li className="text-sub">못 끝내도 괜찮아요. 다시 하면 돼요.</li>
          </ul>
        </div>
        {together ? (
          <ol className="mx-5 mt-4 mb-0 flex list-none flex-col gap-2.5 p-0">
            {["친구도 자기 휴대폰에서 이 미션을 열어요.", "한 명이 '방 만들기'를 누르고, 방 코드를 친구에게 말해 줘요.", "다른 친구가 '코드로 입장'을 누르고 코드를 넣어요."].map((line, i) => (
              <li key={line} className="flex items-start gap-2.5 text-[14.5px] leading-[21px] break-keep text-ink2">
                <span aria-hidden="true" className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-navy-tint text-[12px] font-bold text-navy">
                  {i + 1}
                </span>
                <span className="min-w-0">{line}</span>
              </li>
            ))}
            <li className="pl-8 text-[13.5px] leading-5 break-keep text-sub">둘 다 이 미션에서 게임을 열어야 물방울을 받아요.</li>
          </ol>
        ) : null}
        <div className="grow" />
        <div className="px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => setPlaying(true)} className={buttonClass}>
            게임 시작하기
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#E5E8EB] bg-white pt-[env(safe-area-inset-top)] pr-3 pl-3">
        <div className="flex h-12 min-w-0 grow items-center gap-2">
          {leaving ? (
            <>
              <span className="min-w-0 grow truncate text-[14px] font-bold text-ink2">
                {/* The reason is left out on phones, where it would be cut off. */}
                {together ? <span className="max-[479px]:hidden">친구가 기다릴 수 있어요. </span> : null}
                나갈까요?
              </span>
              <button type="button" onClick={() => setLeaving(false)} className={`${quietButtonClass} shrink-0`}>
                계속 하기
              </button>
              <button type="button" onClick={() => router.push("/missions")} className={`${quietButtonClass} shrink-0`}>
                나가기
              </button>
            </>
          ) : (
            <>
              <span className="min-w-0 grow truncate text-[15px] font-bold tracking-[-0.3px]">미션게임 · {title}</span>
              <button type="button" onClick={() => setLeaving(true)} className={`${quietButtonClass} shrink-0`}>
                나가기
              </button>
            </>
          )}
        </div>
      </div>
      <iframe ref={frame} src={launch.gameUrl} title={title} allow="fullscreen; clipboard-write" className="block min-h-0 w-full grow border-0 bg-[#163a32]" />
      {note ? (
        <div role="status" className="step-in absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] mx-auto flex max-w-[420px] flex-col gap-2.5 rounded-2xl bg-white px-4 py-4 shadow-[0_8px_28px_rgba(25,31,40,0.28)]">
          <p className="m-0 text-[17px] leading-6 font-bold tracking-[-0.3px] break-keep">
            {note === "saving" ? "게임을 마쳤어요!" : note === "thanks" ? (together ? "친구를 도와줘서 고마워요!" : "한 번 더 해냈어요!") : "기록이 조금 늦어지고 있어요"}
          </p>
          <p className="m-0 text-[14.5px] leading-[21px] break-keep text-sub">
            {note === "saving" ? "기록하는 중이에요" : note === "thanks" ? "이미 완료한 미션이라 더 받는 것은 없어요. 한 번 더 해도 좋아요." : "걱정하지 마세요. 미션 목록에서 다시 확인할게요."}
          </p>
          {note === "thanks" ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setNote(null)} className={`${quietButtonClass} grow`}>
                계속 하기
              </button>
              <Link href="/missions" className={`${quietButtonClass} flex grow items-center justify-center no-underline`}>
                미션 목록으로
              </Link>
            </div>
          ) : note === "late" ? (
            <Link href="/missions" className={`${quietButtonClass} flex items-center justify-center no-underline`}>
              미션 목록으로
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
