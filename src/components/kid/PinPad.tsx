"use client";

import { useEffect } from "react";

/** The four dots and the number keypad from the approved login mock-up. `dark` is the full dark PIN screen of the join wizard. */

export function PinDots({ count, shake = false, dark = false }: { count: number; shake?: boolean; dark?: boolean }) {
  const on = dark ? "#FFFFFF" : "#0B1FA6";
  const off = dark ? "rgba(255,255,255,0.22)" : "#E5E8EB";
  return (
    <div role="status" aria-label={`숫자 ${count}개 입력됨`} className="flex gap-4" style={{ animation: shake ? "kidShake 0.4s ease-in-out" : undefined }}>
      <style>{"@keyframes kidShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}"}</style>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[18px] w-[18px] rounded-full" style={{ background: i < count ? on : off }} />
      ))}
    </div>
  );
}

const KEY = "h-16 cursor-pointer border-0 bg-white text-[26px] font-semibold text-ink active:bg-fill disabled:text-faint rounded-xl";
const KEY_DARK = "h-16 cursor-pointer border-0 bg-transparent text-[26px] font-semibold text-white active:bg-white/10 disabled:text-white/40 rounded-xl";

export function PinKeys({ onDigit, onDelete, disabled = false, dark = false }: { onDigit: (d: string) => void; onDelete: () => void; disabled?: boolean; dark?: boolean }) {
  // A hardware keyboard works too (desktop, tablets with keyboards).
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) onDigit(e.key);
      else if (e.key === "Backspace") onDelete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, onDigit, onDelete]);

  const key = dark ? KEY_DARK : KEY;
  return (
    <div className="mx-auto grid w-full max-w-[420px] grid-cols-3 px-5">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" disabled={disabled} onClick={() => onDigit(d)} className={key}>
          {d}
        </button>
      ))}
      <div />
      <button type="button" disabled={disabled} onClick={() => onDigit("0")} className={key}>
        0
      </button>
      <button type="button" disabled={disabled} onClick={onDelete} aria-label="지우기" className={`${key} flex items-center justify-center`}>
        <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 6h13v16H10l-7-8z" />
          <path d="M13.5 11l6 6M19.5 11l-6 6" />
        </svg>
      </button>
    </div>
  );
}
