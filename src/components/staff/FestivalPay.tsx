"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { primaryButtonClass } from "@/components/ui";
import { festivalChildAction, festivalPayAction, festivalScanAction, festivalUndoAction } from "@/lib/staff/actions-festival";
import type { FestivalChild, FestivalKid } from "@/lib/staff/festival";
import { MAX_TALENT_AMOUNT, UNDO_MINUTES } from "@/lib/talent-math";
import { Face } from "./ui";

/* ---------- QR card scanning (only where the browser can do it by itself) ---------- */

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface DetectorCtor {
  new (options?: { formats?: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

function detectorCtor(): DetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null;
}

/** Chrome on Android has BarcodeDetector. iOS Safari does not, so there the scan button is not shown. */
function canScan(): boolean {
  return detectorCtor() !== null && typeof navigator.mediaDevices?.getUserMedia === "function";
}
const noSubscribe = () => () => {};

function CardScanner({ onRead, onClose }: { onRead: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    (async () => {
      try {
        const Ctor = detectorCtor();
        if (!Ctor) throw new Error("unsupported");
        const formats = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : ["qr_code"];
        if (!formats.includes("qr_code")) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const v = video.current;
        if (stopped || !v) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        v.srcObject = stream;
        await v.play();
        const detector = new Ctor({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = v.readyState >= 2 ? await detector.detect(v) : [];
            if (codes.length > 0 && !stopped) {
              stopped = true;
              onRead(codes[0].rawValue);
              return;
            }
          } catch {
            // A frame that cannot be read is skipped.
          }
          timer = window.setTimeout(tick, 200);
        };
        void tick();
      } catch (e) {
        if (stopped) return;
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setError(denied ? "카메라를 쓸 수 없어요. 브라우저에서 카메라를 허용하거나 이름으로 찾아 주세요." : "이 기기에서는 카드를 찍을 수 없어요. 이름으로 찾아 주세요.");
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onRead]);

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-ink p-3">
      {error ? (
        <p role="alert" className="m-0 px-1 py-6 text-center text-[14px] leading-[21px] font-semibold text-white">
          {error}
        </p>
      ) : (
        <>
          <video ref={video} playsInline muted aria-label="카메라 화면" className="aspect-square w-full rounded-xl bg-black object-cover" />
          <p className="m-0 text-center text-[13px] text-white">아이의 QR 카드를 화면 가운데에 맞춰 주세요</p>
        </>
      )}
      <button type="button" onClick={onClose} className="h-11 w-full cursor-pointer rounded-[10px] border-0 bg-white text-[15px] font-bold text-ink2">
        카메라 닫기
      </button>
    </div>
  );
}

/* ---------- payment ---------- */

type Step = { name: "find" } | { name: "pay"; child: FestivalChild } | { name: "done"; childName: string; amount: number; balance: number };
type Last = { childName: string; amount: number; secondsLeft: number };
type Message = { text: string; error: boolean };

const OFFLINE = "연결이 불안정해요. 잠시 뒤에 다시 해 주세요";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;
const QUICK = [1, 2, 5, 10];
const keyClass =
  "flex h-[52px] cursor-pointer items-center justify-center rounded-xl border-0 bg-fill text-[22px] font-bold text-ink2 active:bg-[#E0E5EC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

/**
 * Stall payment: find the child (search, class, or QR card), enter the amount, pay.
 * This screen only shows what the server sent; balances are re-read and re-checked on the
 * server for every payment, so a stale number here can never overdraw.
 */
export function FestivalPay({ eventName, kids, classes, last: initialLast }: { eventName: string; kids: FestivalKid[]; classes: { id: number; name: string }[]; last: Last | null }) {
  const [step, setStep] = useState<Step>({ name: "find" });
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [last, setLast] = useState<Last | null>(initialLast);
  const [scanning, setScanning] = useState(false);
  const scanOk = useSyncExternalStore(noSubscribe, canScan, () => false);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // The cancel button disappears when the five minutes are over (the server checks the time as well).
  useEffect(() => {
    if (!last) return;
    const t = window.setTimeout(() => setLast(null), last.secondsLeft * 1000);
    return () => window.clearTimeout(t);
  }, [last]);

  // Move focus to the top of each new step so screen readers announce it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step.name]);

  const openChild = useCallback(async (load: () => Promise<{ ok: true; child: FestivalChild } | { ok: false; error: string }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await load();
      if (r.ok) {
        setAmount(0);
        setStep({ name: "pay", child: r.child });
      } else setMessage({ text: r.error, error: true });
    } catch {
      setMessage({ text: OFFLINE, error: true });
    } finally {
      setBusy(false);
    }
  }, []);

  const onRead = useCallback(
    (text: string) => {
      setScanning(false);
      void openChild(() => festivalScanAction(text));
    },
    [openChild],
  );

  async function pay(child: FestivalChild) {
    if (busy || amount < 1) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await festivalPayAction(child.id, amount, note);
      if (r.ok) {
        setLast({ childName: r.childName, amount: r.amount, secondsLeft: UNDO_MINUTES * 60 });
        setStep({ name: "done", childName: r.childName, amount: r.amount, balance: r.balance });
      } else {
        setMessage({ text: r.error, error: true });
        // Show the balance as the server has it now.
        const fresh = await festivalChildAction(child.id);
        if (fresh.ok) setStep({ name: "pay", child: fresh.child });
      }
    } catch {
      setMessage({ text: "연결이 불안정해요. 결제가 되었는지 아이의 남은 달란트를 다시 확인해 주세요", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await festivalUndoAction();
      setLast(null);
      setStep({ name: "find" });
      setMessage(r.ok ? { text: `${r.childName} ${r.amount}달란트 결제를 취소했어요. 남은 달란트는 ${r.balance}개예요`, error: false } : { text: r.error, error: true });
    } catch {
      setMessage({ text: OFFLINE, error: true });
    } finally {
      setBusy(false);
    }
  }

  function press(key: (typeof KEYS)[number]) {
    setMessage(null);
    if (key === "clear") setAmount(0);
    else if (key === "back") setAmount((a) => Math.floor(a / 10));
    else setAmount((a) => (a * 10 + Number(key) > MAX_TALENT_AMOUNT ? a : a * 10 + Number(key)));
  }

  const flash = message ? (
    <p role={message.error ? "alert" : "status"} className={`m-0 rounded-[10px] px-3 py-[11px] text-[14px] leading-5 font-bold ${message.error ? "bg-danger-tint text-[#8E2A22]" : "bg-navy-tint text-navy"}`}>
      {message.text}
    </p>
  ) : null;

  const undoButton = last ? (
    <button
      type="button"
      onClick={undo}
      disabled={busy}
      className="flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-3 rounded-xl border-[1.5px] border-danger bg-white px-4 text-left text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
    >
      <span className="text-[15px] font-bold">방금 결제 취소</span>
      <span className="min-w-0 truncate text-[13px] font-semibold">
        {last.childName} · {last.amount}달란트
      </span>
    </button>
  ) : null;

  if (step.name === "pay") {
    const { child } = step;
    const short = amount > child.balance;
    return (
      <div className="flex grow flex-col gap-3 px-4 pt-3 pb-4">
        <div className="-ml-2 flex items-center">
          <button type="button" onClick={() => setStep({ name: "find" })} aria-label="다른 아이 찾기" className="flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent text-ink">
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 ref={heading} tabIndex={-1} className="m-0 text-[19px] font-bold tracking-[-0.4px] outline-none">
            달란트 결제
          </h1>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl bg-fill p-4">
          <Face name={child.name} id={child.id} photo={child.photo_url} size={64} />
          <div className="flex min-w-0 grow flex-col">
            <span className="truncate text-[22px] leading-7 font-bold tracking-[-0.5px]">{child.name}</span>
            <span className="truncate text-[14px] text-sub">{child.class_name ?? "반 없음"}</span>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-[13px] text-sub">남은 달란트</span>
            <span className="text-[34px] leading-10 font-bold tracking-[-0.8px]">{child.balance}개</span>
          </div>
        </div>

        <div className="flex items-end justify-between px-1" aria-live="polite">
          <div className="flex flex-col">
            <span className="text-[13px] text-sub">결제할 달란트</span>
            <span className={`text-[40px] leading-[46px] font-bold tracking-[-1px] ${short ? "text-danger" : amount === 0 ? "text-faint" : "text-ink"}`}>{amount}개</span>
          </div>
          <span className={`pb-1.5 text-[14px] font-semibold ${short ? "text-danger" : "text-sub"}`}>{short ? "달란트가 모자라요" : amount > 0 ? `결제하면 ${child.balance - amount}개 남아요` : "얼마를 결제할까요?"}</span>
        </div>
        {flash}

        <div className="grid grid-cols-4 gap-2" role="group" aria-label="빠른 금액">
          {QUICK.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n}달란트 더하기`}
              onClick={() => {
                setMessage(null);
                setAmount((a) => Math.min(MAX_TALENT_AMOUNT, a + n));
              }}
              className="flex h-11 cursor-pointer items-center justify-center rounded-xl border-0 bg-navy-tint text-[16px] font-bold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
            >
              +{n}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="숫자판">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => press(k)} aria-label={k === "clear" ? "모두 지우기" : k === "back" ? "한 글자 지우기" : undefined} className={`${keyClass} ${k === "clear" || k === "back" ? "text-[15px]" : ""}`}>
              {k === "clear" ? "지우기" : k === "back" ? "←" : k}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fp-note" className="text-[14px] font-semibold text-ink2">
            코너나 물건 (선택)
          </label>
          <input
            id="fp-note"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            maxLength={40}
            placeholder="예: 떡볶이 코너"
            enterKeyHint="done"
            className="h-12 w-full rounded-xl border-[1.5px] border-[#D1D6DB] bg-white px-3.5 text-[16px] text-ink outline-none focus:border-navy"
          />
        </div>
        <button type="button" onClick={() => pay(child)} disabled={busy || amount < 1 || short} className={`${primaryButtonClass} shrink-0 cursor-pointer disabled:cursor-default`}>
          {busy ? "결제하는 중…" : amount > 0 ? `${amount}달란트 결제` : "결제"}
        </button>
      </div>
    );
  }

  if (step.name === "done") {
    return (
      <div className="flex grow flex-col px-4 pt-10 pb-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <div aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-navy text-white">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 ref={heading} tabIndex={-1} className="m-0 mt-2 text-[22px] leading-[30px] font-bold tracking-[-0.5px] outline-none">
            {step.amount}달란트 결제했어요
          </h1>
          <p className="m-0 text-[15px] text-sub">{step.childName}</p>
        </div>
        <div className="mt-6 flex flex-col items-center gap-1 rounded-2xl bg-fill py-6">
          <span className="text-[14px] text-sub">남은 달란트</span>
          <span className="text-[44px] leading-[52px] font-bold tracking-[-1px]">{step.balance}개</span>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setQ("");
              setStep({ name: "find" });
            }}
            className={`${primaryButtonClass} cursor-pointer`}
          >
            다음 아이
          </button>
          {undoButton}
          {last ? <p className="m-0 text-center text-[12px] leading-[18px] text-mute">잘못 결제했다면 {UNDO_MINUTES}분 안에 취소할 수 있어요.</p> : null}
        </div>
      </div>
    );
  }

  const word = q.trim();
  const shown = kids.filter((k) => (classId === null || k.class_id === classId) && (word === "" || k.name.includes(word)));
  const chip = (on: boolean) => `flex h-[34px] items-center rounded-lg px-3 text-[14px] font-semibold whitespace-nowrap ${on ? "bg-navy text-white" : "bg-fill text-sub"}`;

  return (
    <div className="flex grow flex-col">
      <header className="flex flex-col gap-1.5 px-4 pt-6">
        <h1 ref={heading} tabIndex={-1} className="m-0 text-[22px] leading-[30px] font-bold tracking-[-0.5px] outline-none">
          달란트 결제
        </h1>
        <p className="m-0 text-[14px] leading-5 text-mute">{eventName} · 아이를 찾아 주세요</p>
      </header>

      <div className="flex flex-col gap-2 px-4 pt-3">
        {flash}
        {undoButton}
        <label htmlFor="fp-q" className="sr-only">
          이름으로 찾기
        </label>
        <input
          id="fp-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          placeholder="이름으로 찾기"
          autoComplete="off"
          enterKeyHint="search"
          className="h-14 w-full rounded-2xl border-[1.5px] border-[#D1D6DB] bg-white px-4 text-[20px] font-semibold text-ink outline-none focus:border-navy"
        />
        {scanOk && !scanning ? (
          <button type="button" onClick={() => setScanning(true)} className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-navy-tint text-[15px] font-bold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 13h3v3" />
            </svg>
            QR 카드 찍기
          </button>
        ) : null}
        {scanning ? <CardScanner onRead={onRead} onClose={() => setScanning(false)} /> : null}
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="반 고르기">
          <button type="button" aria-pressed={classId === null} onClick={() => setClassId(null)} className="flex h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0">
            <span className={chip(classId === null)}>전체</span>
          </button>
          {classes.map((c) => (
            <button key={c.id} type="button" aria-pressed={classId === c.id} onClick={() => setClassId(c.id)} className="flex h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0">
              <span className={chip(classId === c.id)}>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="m-0 flex list-none flex-col px-4 py-0" aria-label="아이 목록">
        {shown.map((k, i) => (
          <li key={k.id} className={i === shown.length - 1 ? "" : "border-b border-line"}>
            <button
              type="button"
              disabled={busy}
              onClick={() => openChild(() => festivalChildAction(k.id))}
              className="flex min-h-[64px] w-full cursor-pointer items-center gap-[13px] border-0 bg-transparent px-0 py-2 text-left focus-visible:outline-2 focus-visible:outline-navy"
            >
              <Face name={k.name} id={k.id} photo={k.photo_url} />
              <span className="flex min-w-0 grow flex-col">
                <span className="truncate text-[17px] leading-[23px] font-bold tracking-[-0.4px] text-ink2">{k.name}</span>
                <span className="truncate text-[13px] leading-[18px] text-sub">{k.class_name ?? "반 없음"}</span>
              </span>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#8B95A1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M8 5l5 5-5 5" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <p className="m-0 py-8 text-center text-[14px] leading-[21px] text-mute">찾는 아이가 없어요.</p> : null}
    </div>
  );
}
