"use client";

import { useState, type ReactNode } from "react";

/** Small interactive pieces for the "운영" pages. */

/**
 * A GET form that reloads the page as soon as one of its pickers changes (a class, a Sunday).
 * `action` can end in a #place, so that the page comes back at the part the picker belongs to.
 */
export function AutoGet({ action, children, className }: { action?: string; children: ReactNode; className?: string }) {
  return (
    <form
      method="get"
      action={action}
      className={className}
      onChange={(e) => {
        const t = e.target;
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "date" && t.value)) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** A link to hand over (an invite link): the text in a box that selects itself when tapped, and a button that copies it. */
export function CopyLine({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        readOnly
        aria-label={label}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 min-w-0 grow rounded-xl border-[1.5px] border-[#d1d6db] bg-white px-3 text-[13px] text-ink2 focus:border-navy focus:outline-2 focus:outline-offset-[-1.5px] focus:outline-navy"
      />
      <button
        type="button"
        className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-navy px-[13px] text-[13.5px] font-bold whitespace-nowrap text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        <span aria-live="polite">{copied ? "복사했어요" : "복사"}</span>
      </button>
    </div>
  );
}

/**
 * Copies a text (an invite link) when pressed and says so for two seconds.
 * `className` styles the visible pill; the button around it keeps a 44px tap area on phones.
 */
export function CopyButton({ value, children, label, className = "" }: { value: string; children: ReactNode; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      aria-label={label}
      className="group inline-flex h-11 max-w-full cursor-pointer items-center border-0 bg-transparent p-0 outline-none lg:h-9"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      <span aria-live="polite" className={`group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy ${className}`}>
        {state === "copied" ? "링크를 복사했어요" : state === "failed" ? "복사하지 못했어요" : children}
      </span>
    </button>
  );
}
