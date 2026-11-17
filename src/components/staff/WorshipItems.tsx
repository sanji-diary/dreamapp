"use client";

import { useRef, useState } from "react";
import { inputBoxClass } from "./form-kit";

type Item = { key: number; title: string; detail: string };

const iconButton = "grid h-11 w-11 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 text-ink2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy disabled:cursor-default disabled:text-[#c4cad1]";

/** Order of worship: rows can be added, removed and moved up or down. Posted as item_title / item_detail pairs. */
export function WorshipItems({ initial }: { initial: { title: string; detail: string }[] }) {
  const next = useRef(initial.length);
  const [items, setItems] = useState<Item[]>(() => initial.map((it, i) => ({ key: i, ...it })));
  const move = (i: number, d: number) =>
    setItems((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const edit = (key: number, field: "title" | "detail", value: string) => setItems((list) => list.map((it) => (it.key === key ? { ...it, [field]: value } : it)));
  return (
    <div className="flex min-w-0 flex-col">
      <ol className="m-0 flex list-none flex-col p-0">
        {items.map((it, i) => (
          // On a narrow phone the three buttons go under the two boxes, so that the boxes keep the whole width.
          <li key={it.key} className="flex items-center gap-1 border-b border-line py-2 max-[359px]:flex-wrap max-[359px]:justify-end max-[359px]:gap-y-0">
            <span aria-hidden="true" className="w-5 shrink-0 text-center text-[13px] font-bold text-mute">
              {i + 1}
            </span>
            <div className="flex min-w-0 grow flex-col gap-1.5 max-[359px]:basis-[calc(100%-24px)]">
              <input name="item_title" aria-label={`${i + 1}번째 순서 이름`} value={it.title} maxLength={30} placeholder="순서 (예: 찬양)" onChange={(e) => edit(it.key, "title", e.target.value)} className={`${inputBoxClass()} font-semibold`} />
              <input name="item_detail" aria-label={`${i + 1}번째 순서 내용`} value={it.detail} maxLength={80} placeholder="내용" onChange={(e) => edit(it.key, "detail", e.target.value)} className={inputBoxClass()} />
            </div>
            <div className="flex shrink-0 flex-col max-[359px]:flex-row">
              <button type="button" aria-label={`${i + 1}번째 순서 위로`} disabled={i === 0} onClick={() => move(i, -1)} className={iconButton}>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5-5 5 5" />
                </svg>
              </button>
              <button type="button" aria-label={`${i + 1}번째 순서 아래로`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className={iconButton}>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 8l5 5 5-5" />
                </svg>
              </button>
            </div>
            <button type="button" aria-label={`${i + 1}번째 순서 지우기`} onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))} className={iconButton}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </li>
        ))}
      </ol>
      {items.length === 0 ? <p className="m-0 py-3 text-center text-[14px] text-mute">아직 순서가 없어요.</p> : null}
      <button
        type="button"
        onClick={() => setItems((list) => [...list, { key: next.current++, title: "", detail: "" }])}
        className="mt-2.5 flex h-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-dashed border-[#b0b8c1] bg-transparent text-[14px] font-bold text-sub focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
      >
        순서 추가
      </button>
    </div>
  );
}
