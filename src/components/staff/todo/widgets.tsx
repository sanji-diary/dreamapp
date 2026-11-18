"use client";

import { useRef, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { LineIcon, barButtonClass } from "@/components/staff/kit";
import { replyWorryAction } from "@/lib/staff/actions";
import { bulkApproveAction } from "@/lib/staff/actions-todo";
import { BULK_FORM_ID } from "@/lib/staff/todo";

/** Interactive pieces of the "할 일" screens. */

export interface Choice {
  value: string;
  label: string;
  /** Full name for screen readers ('이서윤 가정예배 드리기 확인'). */
  aria: string;
}

/**
 * The two buttons at the bottom of a tile, white on the left and navy on the right, posted as
 * `decision`. Both are switched off while the form is on its way, so a second tap cannot send the
 * same thing twice. On a screen narrower than 330px they stand one above the other, the navy one first.
 */
export function ChoiceButtons({ no, yes }: { no: Choice; yes: Choice }) {
  const { pending } = useFormStatus();
  const base = "flex h-11 min-w-0 cursor-pointer items-center justify-center rounded-[11px] border-0 px-2 text-[14px] font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff disabled:cursor-default disabled:opacity-60 lg:h-[42px]";
  return (
    <div className="grid grid-cols-[1fr_1.3fr] gap-2 max-[329px]:grid-cols-1">
      <button type="submit" name="decision" value={no.value} aria-label={no.aria} disabled={pending} className={`${base} bg-white text-ink2 max-[329px]:order-2`}>
        {no.label}
      </button>
      <button type="submit" name="decision" value={yes.value} aria-label={yes.aria} disabled={pending} className={`${base} bg-staff text-white`}>
        {yes.label}
      </button>
    </div>
  );
}

/** The photo a child sent in, across the tile. A tap opens it whole in a dialog. */
export function PhotoTile({ src, alt }: { src: string; alt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" aria-label={`${alt} 크게 보기`} onClick={() => dialog.current?.showModal()} className="block w-full cursor-pointer overflow-hidden rounded-[14px] border-0 bg-white p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
        {/* One tile across (phones): the picture keeps a 4:3 window. Side by side: every tile gets the same height. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={src} loading="lazy" className="block aspect-[4/3] w-full object-cover sm:aspect-auto sm:h-[168px]" />
      </button>
      <dialog
        ref={dialog}
        aria-label={alt}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-auto max-h-[92dvh] w-[min(92vw,560px)] rounded-2xl border-0 p-0 backdrop:bg-black/60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={alt} src={src} className="block max-h-[78dvh] w-full object-contain" />
        <form method="dialog" className="p-3">
          <button className="h-11 w-full cursor-pointer rounded-[10px] border-0 bg-fill text-[15px] font-bold text-ink2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">닫기</button>
        </form>
      </dialog>
    </>
  );
}

/* ---------- 고른 N건 한꺼번에 확인 (wide screens) ---------- */

const subscribe = (onChange: () => void) => {
  document.addEventListener("change", onChange);
  return () => document.removeEventListener("change", onChange);
};
const ticked = () => document.querySelectorAll(`input[type="checkbox"][form="${BULK_FORM_ID}"]:checked`).length;

function BulkButton({ n }: { n: number }) {
  const { pending } = useFormStatus();
  // Nothing ticked yet: the button is off and says what to do first.
  if (n === 0) {
    return (
      <button type="submit" disabled className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-[10px] border-0 bg-fill px-[13px] text-[13.5px] font-semibold whitespace-nowrap text-mute">
        골라서 한꺼번에 확인
      </button>
    );
  }
  return (
    <button type="submit" disabled={pending} className={`${barButtonClass("solid")} disabled:cursor-default disabled:opacity-60`}>
      {pending ? "확인하는 중" : `고른 ${n}건 한꺼번에 확인`}
    </button>
  );
}

/**
 * The form behind the checkboxes on the mission cards. The checkboxes are plain inputs tied to
 * this form by its id, so what is sent is exactly what is ticked; the button only counts them.
 * The server checks every ticked submission again before approving it.
 * Give it a `key` made of the listed submissions: the count starts over when the list changes.
 */
export function BulkApprove({ filter }: { filter: string }) {
  const n = useSyncExternalStore(subscribe, ticked, () => 0);
  return (
    <form id={BULK_FORM_ID} action={bulkApproveAction}>
      {filter !== "all" ? <input type="hidden" name="f" value={filter} /> : null}
      <BulkButton n={n} />
    </form>
  );
}

/* ---------- reply to a worry ---------- */

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" aria-label="답장 보내기" disabled={pending} className="grid h-[46px] w-[46px] shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-staff p-0 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff disabled:cursor-default disabled:opacity-60">
      <LineIcon name="send" />
    </button>
  );
}

/** The reply box under a worry: a field that grows with the words (up to about six lines) and a round send button. */
export function ReplyBox({ worryId }: { worryId: number }) {
  return (
    <form action={replyWorryAction} className="flex items-end gap-2">
      <input type="hidden" name="id" value={worryId} />
      <label htmlFor="reply" className="sr-only">
        답장 쓰기
      </label>
      <textarea
        id="reply"
        name="content"
        required
        maxLength={2000}
        rows={1}
        placeholder="답장 쓰기"
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 142)}px`;
        }}
        className="h-[46px] max-h-[142px] min-w-0 grow resize-none rounded-[23px] border-0 bg-fill px-4 py-3 text-[16px] leading-[22px] text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-staff"
      />
      <SendButton />
    </form>
  );
}
