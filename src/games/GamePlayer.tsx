"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ComponentType } from "react";
import { gameTokenAction, winGameAction } from "@/lib/kid/mission-actions";
import MemoryGame from "./memory/MemoryGame";
import type { GameProps } from "./registry";

/** Game id -> component. Keep in step with GAMES in registry.ts. */
const COMPONENTS: Record<string, ComponentType<GameProps>> = {
  memory: MemoryGame,
};

const buttonClass = "h-[54px] w-full cursor-pointer rounded-[14px] border-0 bg-navy text-[17px] font-bold tracking-[-0.3px] text-white disabled:cursor-default disabled:bg-fill disabled:text-sub";

/**
 * Runs one mini game for a mission. The game only reports a win; this component sends the win
 * with the start token to the server, which decides whether it counts (see lib/kid/game-proof.ts).
 */
export function GamePlayer({ missionId, gameId, token: firstToken }: { missionId: number; gameId: string; token: string }) {
  const Game = COMPONENTS[gameId];
  const token = useRef<string | null>(firstToken);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"play" | "saving" | "failed">("play");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (!Game) return null;

  const onWin = async () => {
    setPhase("saving");
    try {
      // On success the server redirects to the "mission done" screen and this never returns.
      const r = await winGameAction(missionId, token.current ?? "");
      if (r && !r.ok) {
        token.current = r.token;
        setMessage(r.message);
        setPhase("failed");
      }
    } catch {
      setMessage("연결이 잠시 끊겼어요. 한 번 더 해 볼까요?");
      setPhase("failed");
    }
  };

  const again = async () => {
    setBusy(true);
    try {
      token.current = await gameTokenAction(missionId);
    } catch {
      token.current = null;
    }
    setBusy(false);
    if (!token.current) {
      // The mission is no longer open (already done, or taken down): the list shows the truth.
      router.push("/missions");
      return;
    }
    setRound((n) => n + 1);
    setPhase("play");
  };

  if (phase === "play") return <Game key={round} onWin={onWin} />;
  return (
    <div className="flex grow flex-col">
      <div className="step-in flex grow flex-col items-center justify-center gap-2 px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src="/img/icon-badge.webp" style={{ width: 72, height: 72 }} />
        <p role="status" className="m-0 text-[22px] leading-[30px] font-bold tracking-[-0.5px]">
          {phase === "saving" ? "게임을 마쳤어요!" : "한 번만 더 해 볼까요?"}
        </p>
        <p role={phase === "failed" ? "alert" : undefined} className="m-0 text-[15px] leading-[22px] text-sub">
          {phase === "saving" ? "기록하는 중이에요" : message}
        </p>
      </div>
      {phase === "failed" ? (
        <div className="px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
          <button type="button" disabled={busy} onClick={again} className={buttonClass}>
            {busy ? "준비하는 중…" : "한 번 더 하기"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
