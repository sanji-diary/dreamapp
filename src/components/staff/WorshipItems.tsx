"use client";

import { useRef, useState } from "react";

type Item = { key: number; title: string; detail: string };

const iconButton = "flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-ink2 disabled:cursor-default disabled:text-[#C4CAD1]";

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
    <div className="flex flex-col">
      <ol className="m-0 flex list-none flex-col p-0">
        {items.map((it, i) => (
          <li key={it.key} className="flex items-center gap-1 border-b border-line py-1.5">
            <span aria-hidden="true" className="w-5 shrink-0 text-center text-[13px] font-bold text-mute">
              {i + 1}
            </span>
            <div className="flex min-w-0 grow flex-col gap-1">
              <input name="item_title" aria-label={`${i + 1}번째 순서 이름`} value={it.title} maxLength={30} placeholder="순서 (예: 찬양)" onChange={(e) => edit(it.key, "title", e.target.value)} className="h-11 w-full rounded-[10px] border-[1.5px] border-[#D1D6DB] bg-white px-3 text-[15px] font-semibold text-ink outline-none focus:border-navy" />
              <input name="item_detail" aria-label={`${i + 1}번째 순서 내용`} value={it.detail} maxLength={80} placeholder="내용" onChange={(e) => edit(it.key, "detail", e.target.value)} className="h-11 w-full rounded-[10px] border-[1.5px] border-[#D1D6DB] bg-white px-3 text-[15px] text-ink outline-none focus:border-navy" />
            </div>
            <div className="flex shrink-0 flex-col">
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
      <button type="button" onClick={() => setItems((list) => [...list, { key: next.current++, title: "", detail: "" }])} className="mt-2 flex h-11 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-fill text-[14px] font-bold text-ink2">
        순서 추가
      </button>
    </div>
  );
}
