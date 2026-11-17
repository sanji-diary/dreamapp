"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { GameProps } from "../registry";

/**
 * 짝 맞추기: 8 pairs on a 4 x 4 board. Turn two cards; a matching pair stays open.
 * There is no clock and nothing is lost by a wrong guess — only the number of tries is shown.
 */

const PICTURES = [
  { icon: "persimmon", name: "감" },
  { icon: "butterfly", name: "나비" },
  { icon: "bird", name: "새" },
  { icon: "bee", name: "꿀벌" },
  { icon: "leaf", name: "나뭇잎" },
  { icon: "cloud", name: "구름" },
  { icon: "drop", name: "물방울" },
  { icon: "house", name: "집" },
] as const;
const COLS = 4;
/** How long a wrong pair stays open, so there is time to remember it. */
const LOOK_MS = 1000;

type Card = (typeof PICTURES)[number];

function shuffled(): Card[] {
  const deck: Card[] = [...PICTURES, ...PICTURES];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Component-level CSS (globals.css is shared). The flip is a transition, so the site-wide
// prefers-reduced-motion rule turns it into an instant swap.
const CSS = `
.mg-card { perspective: 600px; }
.mg-inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 0.32s ease; }
.mg-up .mg-inner { transform: rotateY(180deg); }
.mg-face { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border-radius: 14px; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.mg-back { background: var(--color-navy); }
.mg-front { transform: rotateY(180deg); background: #fff; border: 1.5px solid #d1d6db; }
.mg-matched .mg-front { background: var(--color-navy-tint); border-color: var(--color-navy); }
.mg-card:focus-visible { outline: 3px solid var(--color-blue); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .mg-inner { transition: none; }
}
`;

export default function MemoryGame({ onWin }: GameProps) {
  // The deck is shuffled when the child presses start, so server and browser render the same first screen.
  const [deck, setDeck] = useState<Card[] | null>(null);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [tries, setTries] = useState(0);
  const [said, setSaid] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const won = useRef(false);
  const board = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!deck) {
    return (
      <div className="flex grow flex-col">
        <div className="mx-5 mt-5 flex items-center gap-3.5 rounded-2xl bg-fill px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src="/img/icon-butterfly.webp" style={{ width: 52, height: 52 }} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="m-0 text-[16px] font-bold text-ink2">같은 그림 두 장을 찾아요</p>
            <p className="m-0 text-[14px] leading-5 break-keep text-sub">카드를 두 장씩 뒤집어요. 여덟 쌍을 모두 찾으면 끝나요. 시간은 재지 않으니 천천히 해도 돼요.</p>
          </div>
        </div>
        <div className="grow" />
        <div className="px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => setDeck(shuffled())} className="h-[54px] w-full cursor-pointer rounded-[14px] border-0 bg-navy text-[17px] font-bold tracking-[-0.3px] text-white">
            시작하기
          </button>
        </div>
      </div>
    );
  }

  const flip = (i: number) => {
    const card = deck[i];
    if (won.current || matched.includes(card.icon) || open.includes(i)) return;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Two cards that did not match are still showing: turn them back and start a new pair.
    if (open.length !== 1) {
      setOpen([i]);
      setSaid(`${card.name} 카드를 뒤집었어요`);
      return;
    }
    const first = deck[open[0]];
    setTries((n) => n + 1);
    if (first.icon === card.icon) {
      const next = [...matched, card.icon];
      setMatched(next);
      setOpen([]);
      if (next.length === PICTURES.length) {
        won.current = true;
        setSaid("모든 짝을 찾았어요!");
        // Let the last card finish turning before the screen moves on.
        timer.current = setTimeout(onWin, 700);
      } else setSaid(`${card.name} 짝을 찾았어요! ${PICTURES.length - next.length}쌍 남았어요`);
      return;
    }
    setOpen([open[0], i]);
    setSaid(`${first.name}, ${card.name}. 다른 그림이에요`);
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpen([]);
    }, LOOK_MS);
  };

  // Arrow keys move between cards like a grid; Tab, Enter and Space work as on any button.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[e.key];
    if (step === undefined) return;
    const from = Number((e.target as HTMLElement).dataset.card);
    if (!Number.isInteger(from)) return;
    const to = from + step;
    const sameRow = Math.floor(to / COLS) === Math.floor(from / COLS);
    if (to < 0 || to >= deck.length || (Math.abs(step) === 1 && !sameRow)) return;
    e.preventDefault();
    board.current?.querySelector<HTMLElement>(`[data-card="${to}"]`)?.focus();
  };

  return (
    <div className="flex grow flex-col px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
      <style>{CSS}</style>
      <div className="flex items-center justify-between text-[14px] font-bold text-ink2">
        <span>
          찾은 짝 {matched.length} / {PICTURES.length}
        </span>
        <span>맞춰 본 횟수 {tries}번</span>
      </div>
      <div ref={board} role="group" aria-label="카드 16장" onKeyDown={onKeyDown} className="mt-3 grid grid-cols-4 gap-2">
        {deck.map((card, i) => {
          const isMatched = matched.includes(card.icon);
          const up = isMatched || open.includes(i);
          const where = `${Math.floor(i / COLS) + 1}번째 줄 ${(i % COLS) + 1}번째 카드`;
          return (
            <button
              key={i}
              type="button"
              data-card={i}
              aria-label={up ? `${where}, ${card.name}${isMatched ? ", 짝을 찾았어요" : ""}` : `${where}, 아직 뒤집지 않았어요`}
              aria-disabled={isMatched}
              onClick={() => flip(i)}
              className={`mg-card aspect-square w-full cursor-pointer rounded-[14px] border-0 bg-transparent p-0 ${up ? "mg-up" : ""} ${isMatched ? "mg-matched" : ""}`}
            >
              <span className="mg-inner block">
                <span className="mg-face mg-back">
                  <span className="block h-[34%] w-[34%] rounded-full bg-white/25" />
                </span>
                <span className="mg-face mg-front">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" src={`/img/icon-${card.icon}.webp`} className="h-[68%] w-[68%]" draggable={false} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="mt-4 mb-0 min-h-[22px] text-center text-[15px] font-semibold text-navy">
        {said}
      </p>
    </div>
  );
}
