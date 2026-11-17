"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const ROW = 56;
const VISIBLE = 5; // odd, so one row sits exactly in the middle
const PAD = ((VISIBLE - 1) / 2) * ROW;

/**
 * A scrolling year picker: the year resting in the middle band is the chosen one.
 * Works by touch (scroll and snap), by tapping a year, and by the arrow keys.
 */
export function YearWheel({ years, value, onChange, label }: { years: number[]; value: number; onChange: (year: number) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const indexOf = useCallback((year: number) => Math.max(0, years.indexOf(year)), [years]);

  // Start with the chosen year in the middle, without animating.
  useLayoutEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = indexOf(valueRef.current) * ROW;
  }, [indexOf]);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const scrollToIndex = useCallback((i: number) => {
    const el = box.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: i * ROW, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const i = Math.min(years.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
    if (years[i] !== valueRef.current) {
      valueRef.current = years[i];
      onChange(years[i]);
    }
    // Browsers without scroll snapping still come to rest on a row.
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (Math.abs(el.scrollTop - i * ROW) > 1) scrollToIndex(i);
    }, 140);
  };

  const move = (by: number) => {
    const i = Math.min(years.length - 1, Math.max(0, indexOf(valueRef.current) + by));
    valueRef.current = years[i];
    onChange(years[i]);
    scrollToIndex(i);
  };

  return (
    <div className="relative mx-auto w-full max-w-[280px]" style={{ height: ROW * VISIBLE }}>
      {/* The band that marks the chosen row. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 rounded-2xl bg-navy-tint" style={{ top: PAD, height: ROW }} />
      <div
        ref={box}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`year-${value}`}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          }
        }}
        className="year-wheel relative h-full overflow-y-scroll overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-navy"
        style={{
          scrollSnapType: "y mandatory",
          paddingBlock: PAD,
          maskImage: "linear-gradient(to bottom, transparent 0, #000 28%, #000 72%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 28%, #000 72%, transparent 100%)",
        }}
      >
        {years.map((y, i) => {
          const on = y === value;
          return (
            <div
              key={y}
              id={`year-${y}`}
              role="option"
              aria-selected={on}
              onClick={() => {
                valueRef.current = y;
                onChange(y);
                scrollToIndex(i);
              }}
              className={`flex cursor-pointer items-center justify-center tracking-[-0.4px] select-none ${on ? "text-[26px] font-bold text-navy" : "text-[21px] font-semibold text-[#8B95A1]"}`}
              style={{ height: ROW, scrollSnapAlign: "center" }}
            >
              {y}년
            </div>
          );
        })}
      </div>
    </div>
  );
}
