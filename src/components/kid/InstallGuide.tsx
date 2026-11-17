"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { primaryButtonClass } from "@/components/ui";
import { IN_APP_LABEL, chromeIntentUrl, classifyInstallPlatform } from "@/lib/kid/install-platform";

/**
 * "홈 화면에 추가하기": a child who joined with the shared QR has no paper card, so the home-screen
 * icon is their way back in. Always optional and skippable.
 */

/** Chrome's install prompt event (not in the standard DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const noSubscribe = () => () => {};
/** Browser-only facts, read after hydration (null while rendering on the server). */
function useUserAgent(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => navigator.userAgent,
    () => null,
  );
}
export function useStandalone(): boolean | null {
  return useSyncExternalStore(
    noSubscribe,
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => null,
  );
}

const ICON = { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: "#0B1FA6", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const PICTURE: Record<string, ReactNode> = {
  share: (
    <svg aria-hidden="true" {...ICON}>
      <path d="M12 15V3.5M8 7l4-4 4 4" />
      <path d="M7.5 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5" />
    </svg>
  ),
  plus: (
    <svg aria-hidden="true" {...ICON}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  ),
  check: (
    <svg aria-hidden="true" {...ICON}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  dots: (
    <svg aria-hidden="true" {...ICON} fill="#0B1FA6" stroke="none">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  ),
  phone: (
    <svg aria-hidden="true" {...ICON}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  ),
};

const STEPS: Record<"ios" | "android", { picture: string; text: ReactNode }[]> = {
  ios: [
    { picture: "share", text: <>화면 아래 <b>공유 버튼</b>을 눌러요</> },
    { picture: "plus", text: <>아래로 내려서 <b>홈 화면에 추가</b>를 눌러요</> },
    { picture: "check", text: <>오른쪽 위 <b>추가</b>를 누르면 끝!</> },
  ],
  android: [
    { picture: "dots", text: <>오른쪽 위 <b>점 세 개(⋮)</b>를 눌러요</> },
    { picture: "phone", text: <><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 눌러요</> },
    { picture: "check", text: <><b>설치</b>를 누르면 끝!</> },
  ],
};

function Steps({ os }: { os: "ios" | "android" }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
      {STEPS[os].map((s, i) => (
        <li key={i} className="flex min-h-[68px] items-center gap-3.5 rounded-2xl bg-fill px-4 py-2.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white">{PICTURE[s.picture]}</span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[12px] leading-4 font-bold text-navy">{i + 1}단계</span>
            <span className="text-[16px] leading-[22px] font-medium text-ink2 [&_b]:font-bold [&_b]:text-ink">{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Shows the link and copies it. If the clipboard is not available the text is selected so it can be copied by hand. */
function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const box = useRef<HTMLInputElement>(null);
  const copy = () => {
    const select = () => {
      box.current?.focus();
      box.current?.select();
      box.current?.setSelectionRange(0, url.length);
    };
    // Must run inside the tap itself, or the browser refuses to write to the clipboard.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => setState("copied"),
        () => {
          select();
          setState("manual");
        },
      );
    } else {
      select();
      setState("manual");
    }
  };
  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor="entry-link" className="sr-only">
        내 링크
      </label>
      <input id="entry-link" ref={box} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-12 w-full rounded-xl border-[1.5px] border-solid border-[#D1D6DB] bg-fill px-3.5 text-[14px] text-sub outline-none" />
      <button type="button" onClick={copy} className={`${primaryButtonClass} h-14 cursor-pointer rounded-2xl text-[17px]`}>
        {state === "copied" ? "복사했어요!" : "내 링크 복사하기"}
      </button>
      <p role="status" className="m-0 min-h-5 text-center text-[13px] leading-5 text-sub">
        {state === "copied" ? "이제 붙여 넣어서 열어 주세요" : state === "manual" ? "위 글자를 꾹 눌러서 복사해 주세요" : ""}
      </p>
    </div>
  );
}

export function InstallGuide({ entryPath, next, first }: { entryPath: string; next: string; first: boolean }) {
  const ua = useUserAgent();
  const standalone = useStandalone();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [tab, setTab] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already opened from the home screen: nothing to explain right after joining.
  useEffect(() => {
    if (first && standalone) window.location.replace(next);
  }, [first, standalone, next]);

  if (ua === null || standalone === null || (first && standalone)) return <main className="min-h-dvh bg-white" />;

  const p = classifyInstallPlatform(ua);
  const entryUrl = `${window.location.origin}${entryPath}`;
  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    // The event can be used once; after it the menu steps are shown again.
    setPrompt(null);
    if (choice?.outcome === "accepted") setInstalled(true);
  };

  let title = "홈 화면에 추가하면\n바로 들어올 수 있어요";
  let body: ReactNode;
  if (standalone || installed) {
    title = standalone ? "이미 홈 화면에서\n쓰고 있어요" : "홈 화면에 추가했어요!";
    body = <p className="m-0 text-[15px] leading-[22px] text-sub">홈 화면의 꿈의숲 그림을 누르고 비밀번호를 누르면 내 나무로 들어와요.</p>;
  } else if (p.kind === "inapp") {
    const target = p.os === "ios" ? "Safari" : p.os === "android" ? "Chrome" : "Safari(아이폰)나 Chrome(안드로이드)";
    const intent = p.os === "android" ? chromeIntentUrl(entryUrl) : null;
    title = `${target}에서\n열어 주세요`;
    body = (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[15px] leading-[22px] text-sub">
          지금은 {p.app ? IN_APP_LABEL[p.app] : "다른 앱"} 안이라서 홈 화면에 추가할 수 없어요. 내 링크를 복사해서 {target}에 붙여 넣어 주세요.
        </p>
        <CopyLink url={entryUrl} />
        {intent ? (
          <a href={intent} className="flex h-12 items-center justify-center rounded-2xl bg-fill text-[16px] font-bold text-ink2 no-underline">
            Chrome으로 바로 열기
          </a>
        ) : null}
      </div>
    );
  } else if (p.kind === "ios-other") {
    title = "Safari에서\n열어 주세요";
    body = (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[15px] leading-[22px] text-sub">아이폰에서는 Safari에서만 홈 화면에 추가할 수 있어요. 내 링크를 복사해서 Safari에 붙여 넣어 주세요.</p>
        <CopyLink url={entryUrl} />
      </div>
    );
  } else {
    const os = tab ?? (p.os === "android" || prompt ? "android" : "ios");
    body = (
      <div className="flex flex-col gap-3.5">
        {/* A computer or an unknown phone: let the child pick. A known phone shows its own steps only. */}
        {p.kind === "other" ? (
          <div role="group" aria-label="휴대폰 종류" className="flex gap-2">
            {(
              [
                ["ios", "아이폰"],
                ["android", "안드로이드"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={os === v} onClick={() => setTab(v)} className={`h-11 flex-1 cursor-pointer rounded-xl border-0 text-[15px] font-bold ${os === v ? "bg-navy text-white" : "bg-fill text-sub"}`}>
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {os === "android" && prompt ? (
          <>
            <button type="button" onClick={install} className={`${primaryButtonClass} h-14 cursor-pointer rounded-2xl text-[17px]`}>
              설치하기
            </button>
            <p className="m-0 text-center text-[13px] leading-5 text-sub">버튼을 누르고 ‘설치’를 누르면 끝이에요</p>
          </>
        ) : (
          <>
            <p className="m-0 text-[14px] leading-5 font-semibold text-sub">{os === "ios" ? "아이폰 Safari에서 이렇게 해요" : "안드로이드 Chrome에서 이렇게 해요"}</p>
            <Steps os={os} />
          </>
        )}
      </div>
    );
  }

  const done = standalone || installed;
  /** The numbered steps are on screen (not a copy-link screen, not the one-tap install button). */
  const plainSteps = !done && p.kind !== "inapp" && p.kind !== "ios-other" && !prompt;
  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="step-in flex grow flex-col px-6 pt-[max(56px,env(safe-area-inset-top))] pb-4">
        <h1 className="m-0 text-[25px] leading-[34px] font-bold tracking-[-0.6px] whitespace-pre-line">{title}</h1>
        {done ? null : <p className="m-0 mt-2 mb-6 text-[15px] leading-[22px] text-sub">카드가 없어도 돼요. 안 해도 괜찮아요.</p>}
        <div className={done ? "mt-3" : ""}>{body}</div>
      </div>
      <div className="flex shrink-0 flex-col gap-1 px-5 pb-[max(16px,env(safe-area-inset-bottom))]">
        {/* Plain links: the next address may be a route handler, which needs a full page request. */}
        {done || plainSteps ? (
          <a href={next} className={`${primaryButtonClass} h-14 rounded-2xl text-[17px] no-underline`}>
            {!first ? "돌아가기" : done ? "내 나무 보러 가기" : "다 했어요"}
          </a>
        ) : null}
        {done || (plainSteps && !first) ? null : (
          <a href={next} className="flex h-12 w-full items-center justify-center text-[15px] font-semibold text-sub underline underline-offset-2">
            {first ? "나중에 할게요" : "돌아가기"}
          </a>
        )}
      </div>
    </main>
  );
}

/** The row on the "나" page. Hidden when the app is already running from the home screen. */
export function InstallEntry({ href, children }: { href: string; children: ReactNode }) {
  const standalone = useStandalone();
  if (standalone) return null;
  return (
    <a href={href} className="flex h-[54px] items-center gap-2 border-b border-line no-underline">
      {children}
    </a>
  );
}
