"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { festivalChildAction, festivalPayAction, festivalScanAction, festivalUndoAction } from "@/lib/staff/actions-festival";
import type { FestivalChild, FestivalKid } from "@/lib/staff/festival";
import { MAX_TALENT_AMOUNT, UNDO_MINUTES } from "@/lib/talent-math";
import { inputBoxClass } from "./form-kit";
import { Chevron, EmptyNote, LineIcon, Notice, Page, RoundLink, Tag, TreeAvatar, ctaClass, pillClass, type LineIconName } from "./kit";

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
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-ink p-3">
      {error ? (
        <p role="alert" className="m-0 px-1 py-6 text-center text-[14px] leading-[21px] font-semibold text-white">
          {error}
        </p>
      ) : (
        <>
          <video ref={video} playsInline muted aria-label="카메라 화면" className="aspect-square w-full rounded-[14px] bg-black object-cover" />
          <p className="m-0 text-center text-[13px] text-white">아이의 QR 카드를 화면 가운데에 맞춰 주세요</p>
        </>
      )}
      <button type="button" onClick={onClose} className="h-11 w-full cursor-pointer rounded-xl border-0 bg-white text-[15px] font-bold text-ink2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        카메라 닫기
      </button>
    </div>
  );
}

/* ---------- the stall this phone is paying at ---------- */

// The name of the stall ("떡볶이 코너") is kept on this phone, so a teacher types it once for the day.
// It goes with every payment as its note, exactly as the optional note did before.
const STALL_KEY = "dream-festival-stall";
const STALL_EVENT = "dream-festival-stall";
let stallMemory: string | null = null;

function stallSubscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(STALL_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(STALL_EVENT, cb);
  };
}
function stallRead(): string {
  if (stallMemory !== null) return stallMemory;
  try {
    return window.localStorage.getItem(STALL_KEY) ?? "";
  } catch {
    return "";
  }
}
function stallWrite(name: string) {
  stallMemory = name;
  try {
    window.localStorage.setItem(STALL_KEY, name);
  } catch {
    // Private mode: the name is kept for this visit only.
  }
  window.dispatchEvent(new Event(STALL_EVENT));
}

function StallLine({ stall }: { stall: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (editing) {
    return (
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          stallWrite(text.trim().slice(0, 40));
          setEditing(false);
        }}
      >
        <div className="flex min-w-0 grow flex-col gap-1.5">
          <label htmlFor="fp-stall" className="text-[13px] leading-[1.4] font-semibold text-ink2">
            코너 이름 (비워 둬도 돼요)
          </label>
          <input id="fp-stall" value={text} onChange={(e) => setText(e.currentTarget.value)} maxLength={40} placeholder="예: 떡볶이 코너" enterKeyHint="done" autoFocus className={inputBoxClass()} />
        </div>
        <button type="submit" className="group flex h-[46px] shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 outline-none">
          <span className={`${pillClass("navy")} group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-staff`}>정하기</span>
        </button>
      </form>
    );
  }
  const change = (
    <button
      type="button"
      onClick={() => {
        setText(stall);
        setEditing(true);
      }}
      className="-my-2 flex h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent px-1 text-[13px] font-bold text-staff underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-staff"
    >
      {stall ? "바꾸기" : "코너 이름 정하기"}
    </button>
  );
  return (
    <div className="flex min-h-7 flex-wrap items-center gap-x-2">
      {stall ? (
        <>
          <Tag tone="navy">{stall}</Tag>
          <span className="text-[13px] text-mute">에서 받는 중이에요</span>
        </>
      ) : (
        <span className="text-[13px] text-mute">어느 코너에서 받는지 적어 둘 수 있어요</span>
      )}
      {change}
    </div>
  );
}

/* ---------- payment ---------- */

type Step = { name: "find" } | { name: "pay"; child: FestivalChild } | { name: "done"; childName: string; amount: number; balance: number };
type Last = { childName: string; amount: number; secondsLeft: number };
type Message = { text: string; error: boolean };

const OFFLINE = "연결이 불안정해요. 잠시 뒤에 다시 해 주세요";
/** The amount tiles of the mock; anything else goes through "직접 입력". */
const AMOUNTS = [1, 2, 3, 5, 10];

const roundButton = "grid h-10 w-10 place-items-center rounded-full bg-fill text-ink2 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-staff";

function RoundButton({ label, icon, onClick, pressed }: { label: string; icon: LineIconName; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} className="group grid h-11 w-11 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 outline-none">
      <span className={roundButton}>
        <LineIcon name={icon} />
      </span>
    </button>
  );
}

/** Sub-screen header, as the kit's PageHeader with `back`, but the heading can take the focus when the step changes. */
function Header({ left, right, heading }: { left: ReactNode; right?: ReactNode; heading?: RefObject<HTMLHeadingElement | null> }) {
  return (
    <header className="-mx-0.5 -mt-0.5 flex items-center gap-2">
      {left}
      <h1 ref={heading} tabIndex={-1} className="m-0 min-w-0 grow text-center text-[17px] font-bold tracking-[-0.025em] outline-none lg:text-left lg:text-[22px] lg:tracking-[-0.035em]">
        달란트 결제
      </h1>
      {right ?? <span className="w-11 shrink-0 lg:hidden" />}
    </header>
  );
}

/**
 * Stall payment: find the child (search, class, or QR card), choose the amount, take it.
 * This screen only shows what the server sent; balances are re-read and re-checked on the
 * server for every payment, so a stale number here can never overdraw.
 * `levels` holds the tree level of the children this teacher may see in detail; the others get a leaf.
 */
export function FestivalPay({ eventName, kids, classes, levels, last: initialLast }: { eventName: string; kids: FestivalKid[]; classes: { id: number; name: string }[]; levels: Record<number, number>; last: Last | null }) {
  const [step, setStep] = useState<Step>({ name: "find" });
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [last, setLast] = useState<Last | null>(initialLast);
  const [scanning, setScanning] = useState(false);
  const scanOk = useSyncExternalStore(noSubscribe, canScan, () => false);
  const stall = useSyncExternalStore(stallSubscribe, stallRead, () => "");
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
        setCustom(false);
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
      const r = await festivalPayAction(child.id, amount, stall);
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

  const flash = message ? (
    <Notice tone={message.error ? "danger" : "navy"} role={message.error ? "alert" : "status"}>
      {message.text}
    </Notice>
  ) : null;

  // The mock's last line: "방금 결제: 이서윤 2달란트 · 취소".
  const lastLine = last ? (
    <p className="m-0 flex flex-wrap items-center justify-center gap-x-1 text-center text-[13px] text-mute">
      <span>
        방금 결제: {last.childName} {last.amount}달란트 ·
      </span>
      <button type="button" onClick={undo} disabled={busy} className="-my-1.5 h-11 cursor-pointer border-0 bg-transparent px-1.5 text-[13px] font-bold text-danger underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-staff disabled:cursor-default disabled:opacity-50">
        취소
      </button>
    </p>
  ) : null;

  if (step.name === "pay") {
    const { child } = step;
    const short = amount > child.balance;
    return (
      <Page narrow>
        <Header heading={heading} left={<RoundButton label="다른 아이 찾기" icon="back" onClick={() => setStep({ name: "find" })} />} />
        <StallLine stall={stall} />
        <div className="flex items-center gap-3 rounded-[20px] bg-fill px-4 py-3.5">
          <TreeAvatar level={levels[child.id] ?? null} photo={child.photo_url} size="m" onWhite className="max-[339px]:h-10 max-[339px]:w-10" />
          <div className="flex min-w-0 grow flex-col">
            <b className="text-[16px] tracking-[-0.02em]">{child.name}</b>
            <span className="text-[13px] text-mute">{child.class_name ?? "반 없음"}</span>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <b className="text-[24px] leading-[1.25] tracking-[-0.03em] text-blue">{child.balance}</b>
            <span className="text-[13px] text-mute">남은 달란트</span>
          </div>
        </div>

        <h2 className="m-0 mt-0.5 text-[17px] font-bold tracking-[-0.025em]">몇 달란트를 받을까요?</h2>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="금액 고르기">
          {AMOUNTS.map((n) => {
            const on = !custom && amount === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                aria-label={`${n}달란트`}
                onClick={() => {
                  setMessage(null);
                  setCustom(false);
                  setAmount(n);
                }}
                className={`cursor-pointer rounded-2xl border-0 px-1.5 py-3 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff ${on ? "bg-staff text-white" : "bg-fill text-ink"}`}
              >
                <b className="block text-[17px] tracking-[-0.02em]">{n}</b>
                <span className={`text-[11.5px] ${on ? "text-[#cfd6f6]" : "text-mute"}`}>달란트</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={custom}
            aria-label="직접 입력"
            onClick={() => {
              setMessage(null);
              setCustom(true);
              setAmount(0);
            }}
            className={`cursor-pointer rounded-2xl border-0 px-1.5 py-3 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff ${custom ? "bg-staff text-white" : "bg-fill text-ink"}`}
          >
            <b className="block text-[17px] tracking-[-0.02em]">직접</b>
            <span className={`text-[11.5px] ${custom ? "text-[#cfd6f6]" : "text-mute"}`}>입력</span>
          </button>
        </div>
        {custom ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="fp-amount" className="text-[13px] leading-[1.4] font-semibold text-ink2">
              받을 달란트
            </label>
            <input
              id="fp-amount"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              enterKeyHint="done"
              placeholder={`1에서 ${MAX_TALENT_AMOUNT}까지`}
              value={amount === 0 ? "" : String(amount)}
              onChange={(e) => {
                setMessage(null);
                const n = Number(e.currentTarget.value.replace(/[^0-9]/g, "").slice(0, 4));
                setAmount(Math.min(MAX_TALENT_AMOUNT, n));
              }}
              aria-invalid={short ? true : undefined}
              className={inputBoxClass(short)}
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2.5 px-0.5 py-1 text-[14px]" aria-live="polite">
          <span className="text-mute">결제 후 남는 달란트</span>
          {short ? <b className="text-right text-danger">달란트가 모자라요</b> : <b className="text-[16px]">{amount > 0 ? child.balance - amount : "–"}</b>}
        </div>
        {flash}
        <span className="min-h-0 grow" />
        <button type="button" onClick={() => pay(child)} disabled={busy || amount < 1 || short} className={`${ctaClass("navy")} shrink-0 disabled:cursor-default disabled:bg-fill disabled:text-faint`}>
          {busy ? "받는 중…" : amount > 0 ? `${amount}달란트 받기` : "달란트 받기"}
        </button>
        {lastLine}
      </Page>
    );
  }

  if (step.name === "done") {
    return (
      <Page narrow>
        <Header left={<RoundLink href="/staff" label="홈으로 돌아가기" icon="back" />} />
        <div className="flex flex-col items-center gap-1.5 pt-4 text-center">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-staff text-white">
            <LineIcon name="check" size={30} stroke={2.6} />
          </span>
          {/* The result takes the focus, so a screen reader says it first. */}
          <h2 ref={heading} tabIndex={-1} className="m-0 mt-2 text-[22px] leading-[1.35] font-bold tracking-[-0.035em] outline-none">
            {step.amount}달란트 받았어요
          </h2>
          <p className="m-0 text-[14px] text-mute">
            {step.childName}
            {stall ? ` · ${stall}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-center gap-0.5 rounded-[20px] bg-fill py-5">
          <b className="text-[36px] leading-[1.2] tracking-[-0.035em] text-blue">{step.balance}</b>
          <span className="text-[13px] text-mute">남은 달란트</span>
        </div>
        <span className="min-h-0 grow" />
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setQ("");
            setStep({ name: "find" });
          }}
          className={`${ctaClass("navy")} shrink-0`}
        >
          다음 아이
        </button>
        {lastLine}
        {last ? <p className="m-0 -mt-2 text-center text-[12.5px] leading-[18px] text-mute">잘못 받았다면 {UNDO_MINUTES}분 안에 취소할 수 있어요.</p> : null}
      </Page>
    );
  }

  const word = q.trim();
  const shown = kids.filter((k) => (classId === null || k.class_id === classId) && (word === "" || k.name.includes(word)));
  const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-[13px] leading-[1.4] font-semibold whitespace-nowrap group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-staff ${on ? "bg-staff text-white" : "bg-fill text-sub"}`;
  const chipButton = "group flex h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 outline-none lg:h-10";

  return (
    <Page narrow>
      <Header
        heading={heading}
        left={<RoundLink href="/staff" label="홈으로 돌아가기" icon="back" />}
        right={scanOk ? <RoundButton label={scanning ? "카메라 닫기" : "QR 카드 찍기"} icon={scanning ? "close" : "qr"} pressed={scanning} onClick={() => setScanning((s) => !s)} /> : undefined}
      />
      <StallLine stall={stall} />
      {flash}
      {scanning ? <CardScanner onRead={onRead} onClose={() => setScanning(false)} /> : null}
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[13px] text-mute">
          {eventName} · 아이를 찾아 주세요{scanOk ? " (오른쪽 위 버튼으로 QR 카드를 찍을 수 있어요)" : ""}
        </p>
        <div className="flex h-12 items-center gap-2 rounded-full bg-fill px-4 text-faint focus-within:outline-2 focus-within:outline-staff">
          <LineIcon name="search" size={18} />
          <label htmlFor="fp-q" className="sr-only">
            이름으로 찾기
          </label>
          <input id="fp-q" type="search" value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="이름으로 찾기" autoComplete="off" enterKeyHint="search" className="h-full min-w-0 grow border-0 bg-transparent p-0 text-[16px] text-ink outline-none placeholder:text-faint" />
        </div>
        <div className="flex flex-wrap gap-x-[7px]" role="group" aria-label="반 고르기">
          <button type="button" aria-pressed={classId === null} onClick={() => setClassId(null)} className={chipButton}>
            <span className={chip(classId === null)}>전체</span>
          </button>
          {classes.map((c) => (
            <button key={c.id} type="button" aria-pressed={classId === c.id} onClick={() => setClassId(c.id)} className={chipButton}>
              <span className={chip(classId === c.id)}>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="m-0 flex list-none flex-col p-0" aria-label="아이 목록">
        {shown.map((k) => (
          <li key={k.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => openChild(() => festivalChildAction(k.id))}
              className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-0 py-[11px] text-left text-inherit focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-staff disabled:cursor-default"
            >
              <span className="flex shrink-0 max-[319px]:hidden">
                <TreeAvatar level={levels[k.id] ?? null} photo={k.photo_url} size="m" />
              </span>
              <span className="flex min-w-0 grow flex-col">
                <b className="text-[16px] tracking-[-0.02em]">{k.name}</b>
                <span className="text-[13px] text-mute">{k.class_name ?? "반 없음"}</span>
              </span>
              <Chevron />
            </button>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <EmptyNote>찾는 아이가 없어요.</EmptyNote> : null}
      {lastLine ? <div className="sticky bottom-[76px] z-10 -mx-[18px] mt-auto bg-white px-[18px] py-1.5 lg:static lg:mx-0 lg:p-0">{lastLine}</div> : null}
    </Page>
  );
}
