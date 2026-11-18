"use client";

import { useRef, useState } from "react";
import { inputBoxClass } from "./form-kit";
import { LineIcon } from "./kit";

type Item = { key: number; title: string; detail: string };

const iconButton =
  "grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent p-0 text-ink2 hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-staff disabled:cursor-default disabled:text-[#c4cad1] disabled:hover:bg-transparent lg:h-9 lg:w-9";

/**
 * Order of worship: rows can be added, removed and moved up or down. Posted as item_title / item_detail pairs.
 * On phones the two boxes of a row are stacked; from `lg` it reads as a table (number, 순서, 내용, buttons).
 */
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
      <div aria-hidden="true" className="mt-2 hidden h-11 items-center gap-2 border-b border-[#eef0f4] px-[22px] text-[13px] font-semibold text-mute lg:flex">
        <span className="w-6 shrink-0">#</span>
        <span className="w-[34%] shrink-0">순서</span>
        <span className="grow">맡은 사람 · 내용</span>
        <span className="w-[120px] shrink-0 text-right">옮기기 · 빼기</span>
      </div>
      <ol className="m-0 flex list-none flex-col p-0">
        {items.map((it, i) => (
          // On a narrow phone the three buttons go under the two boxes, so that the boxes keep the whole width.
          <li key={it.key} className="flex items-center gap-1 border-b border-line py-2 max-[359px]:flex-wrap max-[359px]:justify-end max-[359px]:gap-y-0 lg:gap-2 lg:border-[#f1f3f6] lg:px-[22px] lg:py-2.5">
            <span aria-hidden="true" className="w-5 shrink-0 text-center text-[13px] font-bold text-mute lg:w-6 lg:text-left lg:text-[14px]">
              {i + 1}
            </span>
            <div className="flex min-w-0 grow flex-col gap-1.5 max-[359px]:basis-[calc(100%-24px)] lg:flex-row lg:gap-2">
              <input name="item_title" aria-label={`${i + 1}번째 순서 이름`} value={it.title} maxLength={30} placeholder="순서 (예: 찬양)" onChange={(e) => edit(it.key, "title", e.target.value)} className={`${inputBoxClass()} font-semibold lg:w-[38%] lg:shrink-0`} />
              <input name="item_detail" aria-label={`${i + 1}번째 순서 내용`} value={it.detail} maxLength={80} placeholder="맡은 사람이나 내용" onChange={(e) => edit(it.key, "detail", e.target.value)} className={`${inputBoxClass()} lg:min-w-0 lg:grow`} />
            </div>
            <div className="flex shrink-0 flex-col max-[359px]:flex-row lg:w-[120px] lg:flex-row lg:justify-end">
              <button type="button" aria-label={`${i + 1}번째 순서 위로`} disabled={i === 0} onClick={() => move(i, -1)} className={iconButton}>
                <LineIcon name="up" size={19} stroke={2.1} />
              </button>
              <button type="button" aria-label={`${i + 1}번째 순서 아래로`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className={iconButton}>
                <LineIcon name="down" size={19} stroke={2.1} />
              </button>
              <button type="button" aria-label={`${i + 1}번째 순서 빼기`} onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))} className={iconButton.replace("text-ink2", "text-danger")}>
                <LineIcon name="trash" size={18} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {items.length === 0 ? <p className="m-0 py-3 text-center text-[14px] text-mute">아직 순서가 없어요.</p> : null}
      <div className="lg:px-[22px]">
        <button
          type="button"
          onClick={() => setItems((list) => [...list, { key: next.current++, title: "", detail: "" }])}
          className="mt-2.5 flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#b0b8c1] bg-transparent text-[14px] font-bold text-sub focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff lg:mt-3.5 lg:h-12 lg:bg-[#fafbfc] lg:text-staff"
        >
          <LineIcon name="plus" size={17} stroke={2.2} />
          순서 더하기
        </button>
      </div>
    </div>
  );
}
