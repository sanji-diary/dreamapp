"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BackLink } from "@/components/ui";
import { EVENTS, FOREST_FRIENDS, FOREST_SIZE, iga, SEASON_NAMES, timeOfDay, type ForestEvent, type Season, type TimeOfDay } from "@/lib/forest";
import type { ForestScene, SceneState } from "./forest/scene";

interface Props {
  count: number;
  fresh: number;
  freshNames: string[];
  rain: boolean;
  season: Season;
  event: ForestEvent | null;
  /** Day, evening or night when the page was made; the screen keeps it up to date by the clock. */
  time: TimeOfDay;
}

const CHIP: Record<Season, [string, string]> = { spring: ["#fde8ef", "#a1264f"], summer: ["#e3f3e6", "#1d6b3a"], autumn: ["#fdeedd", "#9a4a0a"], winter: ["#e8eef6", "#33507a"] };
const SKY: Record<TimeOfDay, Record<Season, [string, string]>> = {
  day: { spring: ["#cfe6fb", "#f3f9fd"], summer: ["#b9dcf8", "#ecf6fd"], autumn: ["#dbe7f3", "#fbf0e2"], winter: ["#d6e1ec", "#f3f6fa"] },
  evening: { spring: ["#f7b98d", "#c9a8d9"], summer: ["#f7b98d", "#c9a8d9"], autumn: ["#f7b98d", "#c9a8d9"], winter: ["#f7b98d", "#c9a8d9"] },
  night: { spring: ["#1c2a52", "#3b4a7a"], summer: ["#1c2a52", "#3b4a7a"], autumn: ["#1c2a52", "#3b4a7a"], winter: ["#1c2a52", "#3b4a7a"] },
};

/**
 * "우리 숲": the whole department's forest round the church, in 3D. No numbers anywhere: only what is
 * new this week, a word about busy weeks (rain) and special days. The 3D part loads after the page,
 * so a slow phone still shows the words at once.
 */
export function ForestMap(props: Props) {
  const { count, fresh, freshNames, rain, season, event } = props;
  const viewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ForestScene | null>(null);
  const [time, setTime] = useState<TimeOfDay>(props.time);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [hint, setHint] = useState(true);
  const [toast, setToast] = useState("");

  const state = useMemo<SceneState>(() => ({ count, fresh, season, time, rain, event }), [count, fresh, season, time, rain, event]);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
    sceneRef.current?.update(state);
  }, [state]);

  // Evening comes while the screen is open: check the clock every minute.
  useEffect(() => {
    const id = setInterval(() => setTime(timeOfDay(new Date(), season)), 60_000);
    return () => clearInterval(id);
  }, [season]);

  const friend = freshNames.find((n) => FOREST_FRIENDS.has(n));
  useEffect(() => {
    const view = viewRef.current, canvas = canvasRef.current;
    if (!view || !canvas) return;
    let gone = false;
    let scene: ForestScene | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("./forest/scene").then(
      ({ createForestScene }) => {
        if (gone) return;
        try {
          scene = createForestScene(canvas, view, latest.current, { reducedMotion: reduced, onInteract: () => setHint(false) });
        } catch {
          setStatus("failed");
          return;
        }
        sceneRef.current = scene;
        setStatus("ready");
        const s = scene;
        timers.push(setTimeout(() => s.sparkleFresh(), 900));
        timers.push(setInterval(() => s.sparkleFresh(), 9000));
        timers.push(setTimeout(() => setHint(false), 6000));
        if (friend) {
          timers.push(setTimeout(() => setToast(`숲에 ${iga(friend)} 찾아왔어요!`), 1200));
          timers.push(setTimeout(() => setToast(""), 4400));
        }
      },
      () => {
        if (!gone) setStatus("failed");
      },
    );
    return () => {
      gone = true;
      timers.forEach((t) => clearTimeout(t));
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [friend]);

  const [top, bottom] = SKY[time][season];
  const night = time === "night", evening = time === "evening";
  const sunOn = count >= 51 && time === "day";
  const starsOn = count >= 54 ? (night ? 1 : evening ? 0.45 : 0) : night ? 0.25 : 0;
  const rainbowOn = count >= 52 && !night ? (evening ? 0.35 : 0.85) : 0;
  const chip = event ? EVENTS[event].name : SEASON_NAMES[season];
  const full = count >= FOREST_SIZE;
  const title = fresh > 0 ? "이번 주 숲에 새로 생겼어요" : full ? "우리 숲이 다 자랐어요" : "숲이 자라고 있어요";
  const label = `${chip} 숲. 교회를 둘러싼 우리 숲이에요.${freshNames.length ? ` 이번 주에 ${freshNames.join(", ")}이 생겼어요.` : ""} 손가락으로 돌려 볼 수 있어요.`;

  return (
    <main data-bleed className="relative flex h-dvh flex-col overflow-hidden bg-white">
      <header className="relative z-10 flex shrink-0 items-center gap-1 bg-white pt-[env(safe-area-inset-top)] pr-4 pl-1">
        <div className="flex h-14 grow items-center gap-1">
          <BackLink href="/home" label="첫 화면으로" />
          <h1 className="m-0 grow text-[19px] font-extrabold tracking-[-0.5px]">우리 숲</h1>
          <span className="flex h-[30px] shrink-0 items-center rounded-[15px] px-3 text-[13.5px] font-bold whitespace-nowrap" style={{ background: CHIP[season][0], color: CHIP[season][1] }}>
            {chip} 숲
          </span>
        </div>
      </header>

      <div ref={viewRef} className="relative min-h-0 grow overflow-hidden" style={{ background: `linear-gradient(180deg, ${top} 0%, ${bottom} 72%)` }}>
        <div aria-hidden="true" className="forest-stars pointer-events-none absolute inset-x-0 top-0 bottom-[40%] transition-opacity duration-1000" style={{ opacity: starsOn }} />
        <div aria-hidden="true" className="forest-rainbow pointer-events-none absolute top-[70px] left-1/2 -ml-[280px] h-[560px] w-[560px] rounded-full transition-opacity duration-1000" style={{ opacity: rainbowOn }} />
        <div aria-hidden="true" className="pointer-events-none absolute top-[34px] left-[30px] h-[58px] w-[58px] rounded-full bg-[radial-gradient(circle_at_40%_40%,#fff6c9,#ffd65a_60%,#ffc83a)] shadow-[0_0_40px_14px_rgba(255,214,90,0.45)] transition-opacity duration-700" style={{ opacity: sunOn ? 1 : 0 }} />
        <div aria-hidden="true" className="pointer-events-none absolute top-[40px] left-[34px] h-11 w-11 rounded-full bg-[radial-gradient(circle_at_38%_38%,#ffffff,#e8ecff_70%)] shadow-[0_0_30px_8px_rgba(220,228,255,0.35)] transition-opacity duration-700" style={{ opacity: night ? 1 : 0 }} />
        <canvas ref={canvasRef} role="img" aria-label={label} className="absolute inset-0 block h-full w-full touch-none outline-none" />
        {status !== "ready" ? (
          <p className="absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-[15px] leading-[22px] font-semibold whitespace-pre-line text-sub">
            {status === "loading" ? "숲을 불러오고 있어요" : "이 휴대폰에서는 숲 그림을 보여 줄 수 없어요.\n아래에서 이번 주 소식을 볼 수 있어요."}
          </p>
        ) : null}
        <div role="status" aria-live="polite" className={`pointer-events-none absolute bottom-[76px] left-1/2 z-10 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-2xl bg-white/95 px-3.5 py-2.5 text-[14px] font-bold whitespace-nowrap shadow-[0_6px_18px_rgba(25,31,40,0.14)] transition-[opacity,transform] duration-300 ${toast ? "opacity-100" : "translate-y-3 opacity-0"}`}>
          {toast}
        </div>
        {status === "ready" ? (
          <div aria-hidden="true" className={`pointer-events-none absolute bottom-[30px] left-1/2 -translate-x-1/2 rounded-2xl bg-[rgba(25,31,40,0.55)] px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap text-white transition-opacity duration-500 ${hint ? "opacity-100" : "opacity-0"}`}>
            손가락으로 숲을 돌려 보세요
          </div>
        ) : null}
      </div>

      <section className="relative z-10 -mt-5 shrink-0 rounded-t-3xl bg-white shadow-[0_-8px_20px_rgba(25,31,40,0.07)]">
        <div className="kid-col flex flex-col gap-2.5 px-5 pt-5 pb-[max(18px,env(safe-area-inset-bottom))]">
          <h2 className="m-0 flex items-center gap-1.5 text-[17px] font-extrabold tracking-[-0.3px] break-keep">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="#ffc94a" className="shrink-0">
              <path d="M12 2l2.2 7.2L21.5 12l-7.3 2.8L12 22l-2.2-7.2L2.5 12l7.3-2.8z" />
            </svg>
            {title}
          </h2>
          {freshNames.length ? (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {freshNames.map((n) => (
                <li key={n} className="flex h-8 items-center rounded-2xl bg-[#fff3cf] px-3 text-[14.5px] font-bold text-[#6b4a00]">
                  {n}
                </li>
              ))}
            </ul>
          ) : null}
          {event ? (
            <p className="m-0 flex items-start gap-2 text-[14px] leading-[21px] font-bold break-keep">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="#e0573f" className="mt-[3px] shrink-0">
                <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.2 1.7-2 3.1-3.2 5.3-3.2 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
              </svg>
              {EVENTS[event].note}
            </p>
          ) : null}
          {rain ? (
            <p className="m-0 flex items-start gap-2 text-[14px] leading-[21px] break-keep text-blue">
              <svg aria-hidden="true" width="16" height="18" viewBox="0 0 16 18" className="mt-0.5 shrink-0">
                <path d="M8 1C8 1 2 7.8 2 11.5A6 6 0 0 0 14 11.5C14 7.8 8 1 8 1z" fill="#6fb6ec" />
              </svg>
              지난주에 다 함께 미션을 많이 해서 숲에 물방울 비가 내렸어요
            </p>
          ) : null}
          <p className="m-0 text-[13.5px] leading-[21px] break-keep text-mute">
            {full ? "올해 우리 숲이 다 자랐어요. 이제는 계절과 행사에 따라 모습이 바뀌어요." : "우리 교회를 둘러싼 숲이 주일마다 조금씩 자라요. 다 함께 미션을 하면 숲이 더 풍성해져요."}
          </p>
        </div>
      </section>
    </main>
  );
}
