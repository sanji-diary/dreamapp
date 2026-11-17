"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { completeMissionAction, photoMissionAction, worryAction, type MissionActionResult } from "@/lib/kid/actions";

/** The interactive part of each mission screen. A finished mission redirects to the success screen on the server. */

const bottomButton = "h-[54px] w-full cursor-pointer rounded-[14px] border-0 bg-navy text-[17px] font-bold tracking-[-0.3px] text-white disabled:cursor-default disabled:bg-fill disabled:text-sub";

function useSubmit() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (fn: () => Promise<MissionActionResult | void>) => {
    setError("");
    start(async () => {
      try {
        const r = await fn();
        if (r && !r.ok) setError(r.message);
      } catch {
        setError("연결이 잠시 끊겼어요. 다시 해 주세요.");
      }
    });
  };
  return { pending, error, run, setError };
}

function Bottom({ error, children }: { error: string; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 bg-white px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
      {error ? (
        <p role="alert" className="m-0 mb-2 text-center text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function SelfMission({ missionId, reward }: { missionId: number; reward: string }) {
  const { pending, error, run } = useSubmit();
  return (
    <>
      <div className="grow" />
      <Bottom error={error}>
        <button type="button" disabled={pending} onClick={() => run(() => completeMissionAction(missionId))} className={bottomButton}>
          {pending ? "기록하는 중…" : `했어요! ${reward}`}
        </button>
      </Bottom>
    </>
  );
}

export function TextMission({ missionId, reward }: { missionId: number; reward: string }) {
  const { pending, error, run } = useSubmit();
  const [text, setText] = useState("");
  const ready = text.trim().length > 0;
  return (
    <>
      <div className="flex flex-col gap-1.5 px-5 pt-[18px]">
        <label htmlFor="mission-text" className="text-[14px] font-semibold text-ink2">
          여기에 적기
        </label>
        <textarea
          id="mission-text"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="생각나는 대로 적어 보세요"
          className="h-[180px] resize-none rounded-[14px] border-[1.5px] border-[#D1D6DB] bg-white p-3.5 text-[16px] leading-6 text-ink outline-none focus:border-navy"
        />
        <span className="self-end text-[13px] text-sub">{text.length} / 500자</span>
      </div>
      <div className="grow" />
      <Bottom error={error}>
        <button type="button" disabled={!ready || pending} onClick={() => run(() => completeMissionAction(missionId, text))} className={bottomButton}>
          {pending ? "보내는 중…" : ready ? reward : "적으면 받을 수 있어요"}
        </button>
      </Bottom>
    </>
  );
}

export function VerseMission({ missionId, verse, reward }: { missionId: number; verse: string; reward: string }) {
  const { pending, error, run } = useSubmit();
  const [text, setText] = useState("");
  let n = 0;
  while (n < text.length && n < verse.length && text[n] === verse[n]) n++;
  const typed = text.trimEnd();
  const done = typed === verse;
  const overflow = n === verse.length && typed.length > verse.length;
  const bad = !overflow && text.length > n ? verse.slice(n, Math.min(verse.length, text.length)) : "";
  // While a Korean syllable is still being composed the last character never matches yet, so it is not called wrong.
  const composing = bad.length === 1;
  const pct = Math.round((n / verse.length) * 100);
  const wrong = (bad !== "" && !composing) || overflow;
  return (
    <>
      <div className="mx-5 mt-[18px] rounded-2xl bg-fill px-[18px] py-5">
        <p className="m-0 text-[21px] leading-[34px] font-bold tracking-[-0.4px]">
          <span className="text-navy">{verse.slice(0, n)}</span>
          <span className={composing ? "text-ink2" : "text-danger underline"}>{bad}</span>
          <span className="text-mute">{verse.slice(n + bad.length)}</span>
        </p>
      </div>
      <div className="flex flex-col gap-1.5 px-5 pt-[18px]">
        <label htmlFor="verse-input" className="text-[14px] font-semibold text-ink2">
          여기에 따라 쓰기
        </label>
        <textarea
          id="verse-input"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\n/g, ""))}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={`${verse.slice(0, 7)}…`}
          className="h-[120px] resize-none rounded-[14px] border-[1.5px] border-[#D1D6DB] bg-white p-3.5 text-[17px] leading-[26px] text-ink outline-none focus:border-navy"
        />
        <div className="mt-1 flex items-center justify-between">
          <span aria-live="polite" className={`text-[13px] ${wrong ? "text-danger" : "text-sub"}`}>
            {overflow ? "끝에 더 쓴 글자를 지워 주세요" : wrong ? "빨간 글자부터 다시 써 보세요" : done ? "다 썼어요!" : "띄어쓰기도 똑같이 써요"}
          </span>
          <span className="text-[13px] font-bold text-ink2">
            {n} / {verse.length}자
          </span>
        </div>
        <div role="progressbar" aria-label="쓴 만큼" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 overflow-hidden rounded bg-[#E5E8EB]">
          <div className="h-2 rounded bg-bar transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="grow" />
      <Bottom error={error}>
        <button type="button" disabled={!done || pending} onClick={() => run(() => completeMissionAction(missionId, typed))} className={bottomButton}>
          {pending ? "보내는 중…" : done ? reward : "끝까지 쓰면 받을 수 있어요"}
        </button>
      </Bottom>
    </>
  );
}

/** Shrinks a photo in the browser so uploads stay small: longest side 1280px, JPEG, under about 900KB. */
async function shrinkPhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => createImageBitmap(file));
  let max = 1280;
  let quality = 0.8;
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 900_000) return new File([blob], "photo.jpg", { type: "image/jpeg" });
    max = Math.round(max * 0.8);
    quality = Math.max(0.5, quality - 0.1);
  }
  throw new Error("too large");
}

const pickClass = "flex h-12 cursor-pointer items-center justify-center rounded-xl bg-navy-tint text-[15px] font-bold text-navy focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy";

export function PhotoMission({ missionId }: { missionId: number }) {
  const { pending, error, run, setError } = useSubmit();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setWorking(true);
    try {
      const small = await shrinkPhoto(file);
      setPhoto(small);
      setPreview(URL.createObjectURL(small));
    } catch {
      setPhoto(null);
      setPreview("");
      setError("이 사진은 쓸 수 없어요. 다른 사진으로 해 볼까요?");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2 px-5 pt-[18px]">
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-fill text-[15px] font-semibold text-sub">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="고른 사진 미리 보기" src={preview} className="max-h-[320px] w-full object-contain" />
          ) : (
            <>
              <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#6B7684" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                <circle cx="12" cy="13" r="3.4" />
              </svg>
              {working ? "사진을 준비하고 있어요…" : "사진을 한 장 올려 주세요"}
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label htmlFor="mission-photo-camera" className={pickClass}>
            사진 찍기
            <input id="mission-photo-camera" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
          <label htmlFor="mission-photo-album" className={pickClass}>
            앨범에서 고르기
            <input id="mission-photo-album" type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
        </div>
        <p className="m-0 text-[13px] leading-[19px] text-sub">사진은 선생님만 볼 수 있어요. 선생님이 확인하면 물방울을 받아요.</p>
      </div>
      <div className="grow" />
      <Bottom error={error}>
        <button
          type="button"
          disabled={!photo || pending || working}
          onClick={() =>
            run(() => {
              const form = new FormData();
              if (photo) form.set("photo", photo);
              return photoMissionAction(missionId, form);
            })
          }
          className={bottomButton}
        >
          {pending ? "올리는 중…" : photo ? "사진 올리기" : "사진을 골라 주세요"}
        </button>
      </Bottom>
    </>
  );
}

export interface AudienceOption {
  id: "teacher" | "pastor" | "both";
  title: string;
  sub: string;
  disabled?: boolean;
}

export function WorryForm({ options, sendLabel }: { options: AudienceOption[]; sendLabel: string }) {
  const { pending, error, run } = useSubmit();
  const [text, setText] = useState("");
  // No audience is chosen for the child: they decide every time.
  const [picked, setPicked] = useState<"" | AudienceOption["id"]>("");
  const hasText = text.trim().length > 0;
  const ready = picked !== "" && hasText;
  return (
    <>
      <div className="flex flex-col gap-1.5 px-5 pt-4">
        <label htmlFor="worry-text" className="text-[14px] font-semibold text-ink2">
          내 이야기
        </label>
        <textarea
          id="worry-text"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          placeholder="여기에 적어 주세요"
          className="h-[150px] resize-none rounded-[14px] border-[1.5px] border-[#D1D6DB] bg-[#F9FAFB] p-3.5 text-[16px] leading-6 text-ink outline-none focus:border-navy"
        />
      </div>
      <div className="flex flex-col gap-2 px-5 pt-5">
        <div id="aud-label" className="text-[16px] font-bold">
          누가 읽으면 좋을까요?
        </div>
        <div role="group" aria-labelledby="aud-label" className="flex flex-col gap-2">
          {options.map((o) => {
            const on = picked === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={o.disabled}
                aria-pressed={on}
                onClick={() => setPicked(o.id)}
                className={`flex min-h-[60px] cursor-pointer items-center gap-3 rounded-[14px] border-[1.5px] px-3.5 py-2 text-left text-ink disabled:cursor-default disabled:opacity-60 ${on ? "border-navy bg-navy-tint" : "border-[#D1D6DB] bg-white"}`}
              >
                <span aria-hidden="true" className="h-[22px] w-[22px] shrink-0 rounded-full bg-white" style={{ border: on ? "7px solid #0B1FA6" : "1.5px solid #8B95A1" }} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[16px] font-bold">{o.title}</span>
                  <span className="text-[13px] text-sub">{o.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-start gap-2 px-5 pt-3.5">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#4E5968" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
          <rect x="3.5" y="8" width="11" height="7.5" rx="2" />
          <path d="M6 8V6a3 3 0 0 1 6 0v2" />
        </svg>
        <p className="m-0 text-[13px] leading-[19px] text-sub">
          고른 사람만 읽을 수 있어요. 위험한 일이면 도와주기 위해 다른 어른께 알릴 수 있어요. 지금 바로 도움이 필요하면 청소년상담전화{" "}
          <a href="tel:1388" className="font-bold text-navy">
            1388
          </a>
          로 전화하세요.
        </p>
      </div>
      <div className="min-h-3 grow" />
      <Bottom error={error}>
        <button type="button" disabled={!ready || pending} onClick={() => run(() => worryAction(text, picked))} className={`${bottomButton} rounded-2xl`}>
          {pending ? "보내는 중…" : !hasText ? "이야기를 적어 주세요" : picked === "" ? "읽을 사람을 골라 주세요" : sendLabel}
        </button>
      </Bottom>
    </>
  );
}
