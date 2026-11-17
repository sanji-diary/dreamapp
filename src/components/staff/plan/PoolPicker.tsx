"use client";

import Link from "next/link";
import { useState } from "react";
import { Checkbox } from "../form-kit";

export interface PoolChoice {
  id: number;
  title: string;
  /** "물방울 1 · 10P · 마지막 11월 2주차" */
  sub: string;
  /** The most drops a child can earn from it in a week. */
  drops: number;
  /** Where its details open. */
  href: string;
}

/**
 * The rotating missions to tick for one week, with the week's drops counted while ticking:
 * what the fixed and dated missions give (`other`) plus the ticked ones, against the weekly cap.
 * Rotating missions give different numbers of drops, so the sum changes with the choice; this
 * says before saving whether the week adds up. Sits inside the form that saves the choice.
 */
export function PoolPicker({ choices, chosen, other, cap, legend, targeted }: { choices: PoolChoice[]; chosen: number[]; other: number; cap: number; legend: string; /** Some missions are for one grade or class: the sum is then the most any class can get. */ targeted: boolean }) {
  const [picked, setPicked] = useState<number[]>(chosen);
  const rotating = choices.filter((c) => picked.includes(c.id)).reduce((sum, c) => sum + c.drops, 0);
  const total = other + rotating;
  const room = cap - other;
  const tone = total === cap ? "bg-navy-tint text-navy" : "bg-warn-tint text-warn";
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1 p-0 text-[13px] leading-[19px] text-sub">{legend}</legend>
      <ul className="m-0 list-none p-0">
        {choices.map((m) => (
          <li key={m.id} className="flex min-w-0 items-center gap-2 border-b border-track py-1 last:border-b-0">
            <div className="min-w-0 grow">
              <Checkbox
                name="mission_ids"
                value={m.id}
                checked={picked.includes(m.id)}
                onChange={(on) => setPicked((list) => (on ? [...list, m.id] : list.filter((id) => id !== m.id)))}
                label={
                  <span className="flex min-w-0 flex-col">
                    <span className="break-keep">{m.title}</span>
                    <span className="text-[12.5px] font-medium text-mute">{m.sub}</span>
                  </span>
                }
              />
            </div>
            <Link href={m.href} aria-label={`${m.title} 자세히`} className="flex h-11 shrink-0 items-center px-1 text-[13px] font-semibold text-navy no-underline">
              자세히
            </Link>
          </li>
        ))}
      </ul>
      <p role="status" className={`m-0 rounded-xl px-3.5 py-3 text-[14px] leading-5 font-bold ${tone}`}>
        고른 순환 미션 {picked.length}개 · 물방울 {rotating}개. 고정·기간 미션 {other}개와 합치면 {total}개예요.{" "}
        {total === cap ? `한 주 한도 ${cap}개와 딱 맞아요.` : total > cap ? `한도 ${cap}개보다 ${total - cap}개 많아요. 넘는 만큼은 아이가 받지 못해요.` : `한도 ${cap}개보다 ${cap - total}개 적어요.`}
        {total !== cap && room > 0 ? ` 순환 미션의 물방울이 ${room}개가 되게 고르면 딱 맞아요.` : ""}
        {targeted ? " (학년이나 반을 정한 미션이 있으면 반마다 다를 수 있어요.)" : ""}
      </p>
    </fieldset>
  );
}
