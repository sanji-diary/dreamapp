"use client";

import { useEffect } from "react";
import { primaryButtonClass } from "@/components/ui";

/** The last screen of the sign-up. Moves on by itself after a moment; the button is there for anyone who is quicker. */
export function Welcome({ name, next }: { name: string; next: string }) {
  useEffect(() => {
    const t = setTimeout(() => window.location.assign(next), 2600);
    return () => clearTimeout(t);
  }, [next]);

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="step-in flex grow flex-col items-center justify-center px-6 pb-10 text-center">
        <div aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-navy">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <p className="m-0 mt-6 text-[16px] leading-6 font-bold text-navy">가입 완료!</p>
        <h1 className="m-0 mt-2 text-[28px] leading-[38px] font-bold tracking-[-0.7px] break-keep">
          {name}님,
          <br />
          환영합니다!
        </h1>
      </div>
      <div className="shrink-0 px-5 pb-[max(16px,env(safe-area-inset-bottom))]">
        {/* A plain link: the next address may be a route handler, which needs a full page request. */}
        <a href={next} className={`${primaryButtonClass} h-14 rounded-2xl text-[17px] no-underline`}>
          시작하기
        </a>
      </div>
    </main>
  );
}
