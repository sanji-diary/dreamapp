"use client";

import { useRef, useState, type ReactNode } from "react";

export interface StepperProps {
  name: string;
  /** Names the − and + buttons: "물방울 줄이기". */
  label: string;
  value?: number;
  defaultValue?: number;
  onChange?: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shown after the number: 개, P. */
  unit?: ReactNode;
}

/**
 * The box of the kit's NumberStepper (form-kit.tsx adds the label, hint and error around it):
 * a number with − and + at its sides. The number can also be typed; what is kept stays inside
 * min and max, and the box shows the kept number again when it is left.
 * The kept number posts as `name`. With `onChange` the form keeps it (`value`); without, the box does.
 */
export function StepperBox({ id, name, label, value, defaultValue = 0, onChange, min = 0, max = 100, step = 1, unit, invalid = false, describedBy }: StepperProps & { id: string; invalid?: boolean; describedBy?: string }) {
  const [own, setOwn] = useState(defaultValue);
  const [text, setText] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);
  const n = onChange ? (value ?? 0) : own;
  const set = (v: number) => {
    const next = Math.max(min, Math.min(max, Math.round(v)));
    if (onChange) onChange(next);
    else setOwn(next);
  };
  const button =
    "grid h-full w-11 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 text-[20px] leading-none font-semibold text-ink2 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-staff disabled:cursor-default disabled:text-[#c4cad1]";
  const shown = text ?? String(n);
  return (
    <div
      className={`flex h-[46px] items-center overflow-hidden rounded-xl border-[1.5px] bg-white has-[input:focus-visible]:border-staff has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-[-1.5px] has-[input:focus-visible]:outline-staff ${invalid ? "border-danger" : "border-[#d1d6db]"}`}
    >
      <button type="button" aria-label={`${label} 줄이기`} disabled={n <= min} onClick={() => set(n - step)} className={button}>
        −
      </button>
      {/* What is posted is always the kept number, never a half-typed or out-of-range one. */}
      <input type="hidden" name={name} value={n} />
      {/* The input is only as wide as its digits; a tap anywhere between the two buttons goes to it. */}
      <span onClick={() => box.current?.focus()} className="flex h-full min-w-0 grow cursor-text items-center justify-center text-[16px] font-semibold text-ink lg:text-[15px]">
        <input
          ref={box}
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
            setText(t);
            if (t !== "") set(Number(t));
          }}
          onBlur={() => setText(null)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          // As wide as the digits it holds, so that the unit sits right after them.
          style={{ width: `${Math.max(1, shown.length)}ch` }}
          className="box-content min-w-0 border-0 bg-transparent p-0 text-right font-[inherit] text-[length:inherit] text-inherit outline-none"
        />
        {unit ? <span aria-hidden="true">{unit}</span> : null}
      </span>
      <button type="button" aria-label={`${label} 늘리기`} disabled={n >= max} onClick={() => set(n + step)} className={button}>
        +
      </button>
    </div>
  );
}
