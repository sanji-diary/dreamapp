"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, KidTabBar } from "@/components/ui";
import { waterAction, type WaterActionResult } from "@/lib/kid/actions";
import { formatPoints } from "@/lib/kid/korean";
import { euro } from "@/lib/time";
import { LEVEL_NAMES } from "@/lib/types";
import { TreeScene, useSceneFit, type SceneKind } from "./TreeScene";

const LINES = [
  "씨앗을 심었어요\n물을 주면 싹이 나요",
  "새싹이 돋았어요!\n쑥쑥 자라는 중이에요",
  "어린나무가 되었어요\n가지가 생겼어요",
  "이제 큰나무예요\n곧 꽃이 필 거예요",
  "꽃이 피었어요!\n물을 주면 열매가 열려요",
  "열매가 열렸어요!\n다 익을 때까지 조금만 더",
];

interface Props {
  kidLabel: string;
  points: number;
  level: number;
  given: number;
  drops: number;
  needs: number[];
  missionsLeft: number;
  /** Welcome-back drops given today and not watered with yet (0 otherwise): greeted in the headline. */
  welcomeDrops: number;
  /** Play the seed drop: the child just got a new seed. */
  intro: boolean;
}

/**
 * The two tiles in the card. On a narrow screen (a folded phone) the picture gives way first and the
 * second line may wrap, so the words are never squeezed into one letter per line.
 */
const TILE = "flex h-[76px] items-center justify-between gap-1 rounded-2xl bg-[#F2F4F6] pr-2.5 pl-4";
const TILE_TEXT = "flex min-w-min shrink flex-col gap-0.5";
const TILE_ICON = "min-w-0 shrink-[100] object-contain";

export function TreeHome(props: Props) {
  const { needs } = props;
  const [st, setSt] = useState({ level: props.level, given: props.given, drops: props.drops });
  const [kind, setKind] = useState<SceneKind>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<"" | "water" | "level">("");
  const [intro, setIntro] = useState(props.intro);
  const [watered, setWatered] = useState(false);
  const [error, setError] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fit = useSceneFit(containerRef, cardRef);

  useEffect(() => {
    // The "new seed" flag is for one viewing only; a reload should not replay it.
    if (props.intro) window.history.replaceState(null, "", "/home");
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, [props.intro]);

  const need = needs[st.level - 1] ?? 10;
  const pct = Math.round(Math.min(1, st.given / need) * 100);
  const left = Math.max(0, need - st.given);
  const ripe = st.level >= 6 && st.given >= need && kind !== "charge";
  const charge = kind === "charge";
  const reveal = kind === "reveal";
  const wet = kind === "water" || charge;
  const name = LEVEL_NAMES[st.level - 1];

  function water() {
    if (busy || st.drops <= 0 || (st.level >= 6 && st.given >= need)) return;
    const before = st;
    const levelUp = st.given + 1 >= need && st.level < 6;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animating = true;
    let result: WaterActionResult | "failed" | null = null;
    // The server is the source of truth: once both the animation and the answer are in, show its numbers.
    const settle = () => {
      if (animating || result === null) return;
      if (result === "failed") {
        setSt(before);
        setMsg("");
        setError("물을 주지 못했어요. 잠시 뒤에 다시 해 주세요.");
      } else {
        setSt({ level: result.level, given: result.given, drops: result.drops });
        if (result.ok) setWatered(true);
        else setMsg("");
      }
      setKind("");
      setBusy(false);
    };
    const end = () => {
      animating = false;
      if (result === null) return; // keep the "watering" card until the server answers
      settle();
    };
    setIntro(false);
    setError("");
    setBusy(true);
    if (levelUp) {
      setSt({ ...st, given: need, drops: st.drops - 1 });
      setKind("charge");
      timers.current.push(
        setTimeout(() => {
          setSt((s) => ({ ...s, level: before.level + 1, given: 0 }));
          setKind("reveal");
          setMsg("level");
        }, reduced ? 300 : 1600),
        setTimeout(end, reduced ? 900 : 2900),
      );
    } else {
      setSt({ ...st, given: st.given + 1, drops: st.drops - 1 });
      setKind("water");
      setMsg("water");
      timers.current.push(setTimeout(end, reduced ? 500 : 1800));
    }
    waterAction()
      .then((r) => {
        result = r;
      })
      .catch(() => {
        result = "failed";
      })
      .finally(settle);
  }

  // The greeting stays until the child waters (then the usual lines take over) or the day ends (the server stops sending it).
  const welcome = props.welcomeDrops > 0 && msg === "" && !watered ? `다시 만나서 반가워요!\n물방울 ${props.welcomeDrops}개를 받았어요` : "";
  const headline = ripe ? "열매가 다 익었어요!\n이제 수확할 수 있어요" : msg === "level" ? "레벨업!\n몰라보게 자라났어요" : msg === "water" ? "물 주기 완료!\n왠지 튼튼해 보여요" : welcome || LINES[st.level - 1];
  const nextText = ripe ? "다 자랐어요. 열매를 수확해 보세요" : st.level >= 6 ? `다 익을 때까지 물방울 ${left}개` : `${LEVEL_NAMES[st.level]}까지 물방울 ${left}개`;
  const toast = reveal ? `${euro(name)} 레벨업!` : "물방울 1개를 줬어요";
  const missionsLabel = props.missionsLeft > 0 ? `이번 주 미션 ${props.missionsLeft}개 보기` : "이번 주 미션 보기";

  return (
    <div ref={containerRef} className="relative flex h-dvh flex-col overflow-hidden bg-ground">
      <TreeScene level={st.level} kind={kind} intro={intro} toast={toast} fit={fit} />
      <div className="pointer-events-none relative flex min-h-0 grow flex-col">
        <div className="kid-col flex items-center justify-between px-5 pt-[max(14px,env(safe-area-inset-top))]">
          <div className="text-[14px] font-semibold text-sub">{props.kidLabel}</div>
          <div className="flex h-[34px] items-center gap-1 rounded-[17px] bg-white pr-[13px] pl-2 text-[15px] font-bold tracking-[-0.2px]">
            <Icon name="persimmon" size={24} />
            <span aria-label={`내 포인트 ${formatPoints(props.points)}`}>{formatPoints(props.points)}</span>
          </div>
        </div>
        <div className="kid-col flex items-start justify-between gap-3 px-5 pt-[18px] transition-opacity duration-300" style={{ opacity: wet || reveal ? 0 : 1 }}>
          {/* Words stay whole on a folded phone, where the headline shares the row with the mission button. */}
          <h1 className="m-0 text-[25px] leading-[34px] font-bold tracking-[-0.6px] break-keep whitespace-pre-line">{headline}</h1>
          <Link
            href="/missions"
            aria-label={missionsLabel}
            className="pointer-events-auto relative flex h-[70px] w-[70px] shrink-0 flex-col items-center justify-center rounded-full bg-white text-ink no-underline shadow-[0_6px_16px_rgba(25,31,40,0.10)]"
          >
            <Icon name="stamp" size={36} />
            <span className="text-[12px] font-bold">미션</span>
            {props.missionsLeft > 0 ? (
              <span className="absolute -top-[3px] -right-[3px] flex h-[22px] min-w-[22px] items-center justify-center rounded-[11px] bg-[#D22030] px-1.5 text-[12px] font-bold text-white">{props.missionsLeft}</span>
            ) : null}
          </Link>
        </div>
        <div className="grow" />
        <div ref={cardRef} className="pointer-events-auto mx-auto mb-3 flex w-[calc(100%-32px)] max-w-[528px] flex-col gap-3 rounded-3xl bg-white px-[18px] pt-5 pb-[18px] shadow-[0_8px_24px_rgba(25,31,40,0.08)]">
          <div className="flex items-baseline justify-between">
            <div className="text-[17px] font-bold tracking-[-0.3px]">
              레벨 {st.level} {name}
            </div>
            <div className="text-[17px] font-bold text-blue">{pct}%</div>
          </div>
          <div role="progressbar" aria-label="나무 성장" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 overflow-hidden rounded-[5px] bg-[#E5E8EB]">
            <div className="h-2.5 rounded-[5px] bg-bar transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="-mt-1 text-[13px] leading-[18px] font-medium tracking-[-0.2px] text-sub">{nextText}</div>
          {error ? (
            <p role="alert" className="m-0 -mt-1 text-[13px] leading-[18px] font-semibold text-danger">
              {error}
            </p>
          ) : null}
          {busy ? (
            <div role="status" className="mt-1 flex h-[76px] items-center justify-center gap-2 text-[16px] font-bold tracking-[-0.3px] text-ink2">
              {charge || reveal ? "쑥쑥 자라는 중…" : "물 주는 중…"}
              <Icon name="cloud" size={40} />
            </div>
          ) : (
            <div className="mt-1 grid grid-cols-2 gap-2.5">
              {ripe ? (
                <Link href="/harvest" className="col-span-2 flex h-[76px] items-center justify-between rounded-2xl bg-navy pr-3.5 pl-5 whitespace-nowrap text-white no-underline">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[16px] font-bold tracking-[-0.3px]">열매 수확하기</span>
                    <span className="text-[13px] font-medium text-[#E8F3FF]">다 익었어요</span>
                  </span>
                  <Icon name="persimmon" size={46} />
                </Link>
              ) : (
                <>
                  {st.drops > 0 ? (
                    <button type="button" onClick={water} className={`${TILE} cursor-pointer border-0 text-left text-ink`}>
                      <span className={TILE_TEXT}>
                        <span className="text-[16px] font-bold tracking-[-0.3px] whitespace-nowrap">물 주기</span>
                        <span className="text-[13px] leading-[17px] font-medium break-keep text-sub">물방울 {st.drops}개</span>
                      </span>
                      <Icon name="drop" size={46} className={TILE_ICON} />
                    </button>
                  ) : (
                    <div className={`${TILE} text-mute`}>
                      <span className={TILE_TEXT}>
                        <span className="text-[16px] font-bold tracking-[-0.3px] whitespace-nowrap">물 주기</span>
                        <span className="text-[13px] leading-[17px] font-medium break-keep">미션하면 받아요</span>
                      </span>
                      <Icon name="drop" size={36} className={`${TILE_ICON} opacity-50 grayscale`} />
                    </div>
                  )}
                  <Link href="/missions" className={`${TILE} text-ink no-underline`}>
                    <span className={TILE_TEXT}>
                      <span className="text-[16px] font-bold tracking-[-0.3px] whitespace-nowrap">미션 하기</span>
                      <span className="text-[13px] leading-[17px] font-medium break-keep text-sub">{props.missionsLeft > 0 ? `${props.missionsLeft}개 남음` : "모두 했어요"}</span>
                    </span>
                    <Icon name="bible" size={48} className={TILE_ICON} />
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
        <div className="pointer-events-auto">
          <KidTabBar active="/home" />
        </div>
      </div>
    </div>
  );
}
