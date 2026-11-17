"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Chevron, ClayIcon, LineIcon } from "./kit";

export interface QuickAction {
  href: string;
  /** Clay picture name (public/img/icon-*.webp). */
  icon: string;
  title: string;
  sub: string;
}

/**
 * The round "+" in the middle of the tab bar and the "바로 하기" sheet it opens.
 * The sheet is a native modal dialog: the page behind is inert, Escape closes it and focus goes
 * back to the button. It also closes on a tap outside and when a row is chosen.
 * The slide-up is dropped for people who ask for reduced motion (globals.css).
 */
export function QuickSheet({ actions }: { actions: QuickAction[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  const close = () => dialog.current?.close();

  // The tab bar stays mounted between pages, so close the sheet once the new page is showing.
  useEffect(() => {
    dialog.current?.close();
  }, [path]);

  return (
    <>
      <button
        type="button"
        aria-label="바로 하기"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="-mt-[22px] grid h-[50px] w-[50px] cursor-pointer place-items-center rounded-full border-0 bg-navy p-0 text-white shadow-[0_6px_16px_rgba(11,31,166,0.32)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
      >
        <LineIcon name="plus" size={24} stroke={2.2} />
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="quick-sheet-title"
        onClick={(e) => {
          // A click that lands on the dialog itself is a click on the dimmed area around the sheet.
          if (e.target === e.currentTarget) close();
        }}
        className="quick-sheet fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[86dvh] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-t-[26px] border-0 bg-white p-0 text-ink"
      >
        <div className="flex flex-col px-5 pt-2.5 pb-[max(26px,env(safe-area-inset-bottom))] text-[14px] leading-[1.4] tracking-[-0.015em] break-keep wrap-break-word">
          <span aria-hidden="true" className="mb-1.5 h-1 w-[38px] self-center rounded-full bg-track" />
          <div className="flex items-center">
            <h2 id="quick-sheet-title" className="m-0 grow text-[17px] font-bold tracking-[-0.025em]">
              바로 하기
            </h2>
            <button type="button" aria-label="닫기" onClick={close} className="-mr-2.5 grid h-11 w-11 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-mute focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-navy">
              <LineIcon name="close" size={18} />
            </button>
          </div>
          {actions.length === 0 ? (
            <p className="m-0 py-6 text-[14px] leading-[21px] text-mute">지금 바로 할 수 있는 일이 없어요. 달란트 잔치 날에는 여기에서 결제를 열 수 있어요.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {actions.map((a) => (
                <li key={a.href} className="border-b border-line last:border-b-0">
                  <Link href={a.href} onClick={close} className="flex items-center gap-3 py-[13px] text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy">
                    <ClayIcon name={a.icon} />
                    <span className="flex min-w-0 grow flex-col">
                      <b className="block text-[16px] tracking-[-0.02em]">{a.title}</b>
                      <span className="block text-[13px] text-mute">{a.sub}</span>
                    </span>
                    <Chevron />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}
