"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Small interactive pieces for the teacher screens. */

/** A submit button that asks first. Used for actions that are hard to undo. */
export function ConfirmButton({
  children,
  message,
  name,
  value,
  className,
}: {
  children: ReactNode;
  message: string;
  name?: string;
  value?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className ?? "flex h-11 cursor-pointer items-center border-0 bg-transparent p-0"}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Read-only text with a copy button (invite links). */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly aria-label={label} value={value} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 grow rounded-[10px] border-[1.5px] border-[#D1D6DB] bg-white px-3 text-[13px] text-ink2 outline-none focus:border-staff" />
      <button
        type="button"
        className="flex h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0"
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
        <span className="flex h-[30px] min-w-[60px] items-center justify-center rounded-md bg-staff px-2 text-[12px] font-semibold text-white" aria-live="polite">
          {copied ? "복사됨" : "복사"}
        </span>
      </button>
    </div>
  );
}

async function shrink(file: File, max: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  if (!blob) throw new Error("no blob");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

/**
 * File input named "photo". The chosen picture is shrunk in the browser to a JPEG of at most
 * `max` pixels on its long side before the form is sent, so originals never leave the phone.
 */
export function PhotoInput({ current, label = "사진 고르기", max = 800, round = true }: { current?: string | null; label?: string; max?: number; round?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown = preview ?? current ?? null;
  return (
    <div className="flex items-center gap-3.5">
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={shown} className={`h-16 w-16 shrink-0 object-cover ${round ? "rounded-full" : "rounded-xl"}`} />
      ) : (
        <div aria-hidden="true" className={`h-16 w-16 shrink-0 bg-fill ${round ? "rounded-full" : "rounded-xl"}`} />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <label className="flex h-11 w-fit cursor-pointer items-center rounded-[10px] bg-fill px-3.5 text-[14px] font-bold text-ink2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-staff">
          {label}
          <input
            ref={input}
            type="file"
            name="photo"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const el = e.currentTarget;
              const f = el.files?.[0];
              setError(null);
              if (!f) return;
              try {
                const small = await shrink(f, max);
                const dt = new DataTransfer();
                dt.items.add(small);
                el.files = dt.files;
                setPreview(URL.createObjectURL(small));
              } catch {
                el.value = "";
                setPreview(null);
                setError("이 사진은 쓸 수 없어요. 다른 사진을 골라 주세요");
              }
            }}
          />
        </label>
        {error ? (
          <p role="alert" className="m-0 text-[12px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Thumbnail that opens the full picture in a dialog. */
export function PhotoZoom({ src, alt, size = 46 }: { src: string; alt: string; size?: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" aria-label={`${alt} 크게 보기`} onClick={() => dialog.current?.showModal()} className="shrink-0 cursor-pointer border-0 bg-transparent p-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={src} width={size} height={size} className="rounded-[10px] object-cover" style={{ width: size, height: size }} />
      </button>
      <dialog
        ref={dialog}
        aria-label={alt}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto max-h-[90dvh] w-[min(92vw,400px)] rounded-2xl border-0 p-0 backdrop:bg-black/60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt} src={src} className="block max-h-[76dvh] w-full object-contain" />
        <form method="dialog" className="p-3">
          <button className="h-11 w-full cursor-pointer rounded-[10px] border-0 bg-fill text-[15px] font-bold text-ink2">닫기</button>
        </form>
      </dialog>
    </>
  );
}

export function PrintButton({ children }: { children: ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} className="flex h-[52px] w-full cursor-pointer items-center justify-center rounded-xl border-0 bg-staff text-[16px] font-bold tracking-[-0.3px] text-white">
      {children}
    </button>
  );
}

/** Number with − and + buttons, posted as a hidden input. */
export function Stepper({ name, label, icon, value, onChange, step, min, max, unit }: { name: string; label: string; icon: string; value: number; onChange: (n: number) => void; step: number; min: number; max: number; unit: string }) {
  const bump = (d: number) => onChange(Math.max(min, Math.min(max, value + d)));
  return (
    <div className="flex h-16 flex-1 items-center gap-1.5 rounded-xl bg-fill pr-2 pl-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={`/img/icon-${icon}.webp`} width={30} height={30} className="h-[30px] w-[30px]" />
      <div className="flex grow flex-col">
        <span className="text-[12px] text-sub">{label}</span>
        <span className="text-[17px] font-bold" aria-live="polite">
          {value}
          {unit}
        </span>
      </div>
      <input type="hidden" name={name} value={value} />
      <button type="button" aria-label={`${label} 줄이기`} onClick={() => bump(-step)} className="h-11 w-8 cursor-pointer border-0 bg-transparent text-[22px] font-semibold text-ink2">
        −
      </button>
      <button type="button" aria-label={`${label} 늘리기`} onClick={() => bump(step)} className="h-11 w-8 cursor-pointer border-0 bg-transparent text-[22px] font-semibold text-ink2">
        +
      </button>
    </div>
  );
}

/** A GET form that reloads the page as soon as one of its pickers changes. */
export function AutoForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        const t = e.target;
        // Text boxes wait for Enter; pickers submit straight away.
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "date" && t.value)) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
