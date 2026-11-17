"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/staff/kit";
import type { AttStatus } from "@/lib/staff/attendance";
import type { AttColumn, MonthKid } from "@/lib/staff/attendance-month";
import { STATUS_BUTTONS } from "./RollCall";
import type { AttendanceStore, Entry } from "./store";

/** A column of the table with the address that makes it the chosen day. */
export interface TableColumn extends AttColumn {
  href: string;
}

const WORD: Record<AttStatus, string> = { present: "출석", late: "지각", absent: "결석" };
const TONE: Record<AttStatus, string> = { present: "text-blue", late: "text-warn", absent: "text-danger" };
const came = (s: AttStatus | null) => s === "present" || s === "late";
const cellId = (childId: number, date: string) => `att-${childId}-${date}`;

/** The choices that open under a cell: 출석, 지각, 결석, clear, and the reason while the mark is 결석. */
function CellMenu({ kid, col, entry, store, onClose }: { kid: MonthKid; col: AttColumn; entry: Entry; store: AttendanceStore; onClose: () => void }) {
  const pick = (status: AttStatus | null) => {
    if (status !== entry.status) store.save(kid.id, col.date, { status, note: status === "absent" ? entry.note : "" });
    // After 결석 the box stays open for the reason.
    if (status !== "absent") onClose();
  };
  return (
    <div
      role="dialog"
      aria-label={`${kid.name} ${col.md} 출석 고치기`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="absolute top-[calc(100%-4px)] left-1/2 z-30 flex w-max -translate-x-1/2 flex-col gap-2 rounded-2xl bg-white p-2.5 text-left shadow-[0_6px_24px_rgba(25,31,40,0.18)] ring-1 ring-line"
    >
      <div className="flex items-center gap-1.5">
        {STATUS_BUTTONS.map((b) => {
          const active = entry.status === b.status;
          return (
            <button
              key={b.status}
              type="button"
              autoFocus={b.status === (entry.status ?? "present")}
              aria-pressed={active}
              onClick={() => pick(b.status)}
              className={`h-9 w-[52px] cursor-pointer rounded-[9px] border-0 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${active ? b.on : "bg-fill font-semibold text-sub"}`}
            >
              {b.label}
            </button>
          );
        })}
        {entry.status !== null ? (
          <button type="button" onClick={() => pick(null)} className="h-9 cursor-pointer rounded-[9px] border-0 bg-transparent px-2 text-[13px] font-semibold text-mute hover:bg-fill focus-visible:outline-2 focus-visible:outline-navy">
            지우기
          </button>
        ) : null}
      </div>
      {entry.status === "absent" ? (
        <>
          <label className="sr-only" htmlFor={`${cellId(kid.id, col.date)}-note`}>
            {kid.name} {col.md} 결석 사유
          </label>
          <input
            id={`${cellId(kid.id, col.date)}-note`}
            defaultValue={entry.note}
            maxLength={200}
            placeholder="결석 사유 (선택)"
            onKeyDown={(ev) => {
              if (ev.key !== "Enter") return;
              // Leaving the box saves what was typed (onBlur below).
              ev.currentTarget.blur();
              onClose();
            }}
            onBlur={(ev) => {
              const v = ev.currentTarget.value.trim();
              if (v !== store.get(kid.id, col.date).note) store.save(kid.id, col.date, { status: "absent", note: v });
            }}
            className="h-9 w-full rounded-[10px] border-0 bg-fill px-3 text-[13.5px] text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-navy"
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Wide screens: one row per child, one column per Sunday of the month (and any weekday that has
 * marks). A cell opens the choices; the pick is saved at once through the same store as the roll
 * call. Days still to come are empty and cannot be opened. `side` is the box at the right.
 */
export function MonthTable({ date, kids, columns, store, showClass, total, side }: { date: string; kids: MonthKid[]; columns: TableColumn[]; store: AttendanceStore; showClass: boolean; total: string; side: ReactNode }) {
  const [open, setOpen] = useState<{ id: number; date: string } | null>(null);
  const openKey = open ? cellId(open.id, open.date) : null;

  // A click anywhere outside the open cell closes it. (A click on another cell has already moved `open` there.)
  useEffect(() => {
    if (!openKey) return;
    const onClick = (e: MouseEvent) => {
      setOpen((cur) => (cur && e.target instanceof Element && e.target.closest(`[data-cell="${cellId(cur.id, cur.date)}"]`) ? cur : null));
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openKey]);

  const past = columns.filter((c) => !c.future);
  // A day counts for a child when their class had attendance taken on it (the same rule as "최근 4주 출석").
  const taken = new Set<string>();
  for (const k of kids) for (const c of past) if (store.get(k.id, c.date).status !== null) taken.add(`${k.class_id}:${c.date}`);
  const counted = (k: MonthKid) => past.filter((c) => taken.has(`${k.class_id}:${c.date}`));
  const attended = (k: MonthKid) => counted(k).filter((c) => came(store.get(k.id, c.date).status)).length;
  const sum = kids.reduce((t, k) => ({ att: t.att + attended(k), all: t.all + counted(k).length }), { att: 0, all: 0 });

  // Shared by every cell; each cell adds its own side padding and alignment (a day column is narrower and centered).
  const th = "border-b border-line py-[9px] text-[12px] font-medium whitespace-nowrap text-mute";
  const wide = "px-2.5 text-left";
  const day = "px-1 text-center";
  const close = (id: number, d: string) => {
    setOpen(null);
    document.getElementById(cellId(id, d))?.focus();
  };

  return (
    <div className="hidden items-start gap-3.5 lg:grid min-[1180px]:grid-cols-[minmax(0,1fr)_304px]">
      <Card>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={`${th} ${wide}`}>
                이름
              </th>
              {showClass ? (
                <th scope="col" className={`${th} ${wide}`}>
                  반
                </th>
              ) : null}
              {columns.map((c) => {
                const on = c.date === date;
                const words = (
                  <>
                    {c.label}
                    <br />
                    {c.md}
                  </>
                );
                return (
                  <th key={c.date} scope="col" className={`${th} ${day}`}>
                    {c.future ? (
                      <span className="inline-block px-1.5 py-0.5 text-faint">{words}</span>
                    ) : (
                      <Link
                        href={c.href}
                        scroll={false}
                        aria-current={on ? "date" : undefined}
                        className={`inline-block rounded-lg px-1.5 py-0.5 no-underline focus-visible:outline-2 focus-visible:outline-navy ${on ? "bg-navy-tint font-bold text-navy" : "text-mute hover:bg-fill"}`}
                      >
                        {words}
                      </Link>
                    )}
                  </th>
                );
              })}
              <th scope="col" className={`${th} px-2.5 text-center`}>
                {total}
              </th>
              <th scope="col" className={`${th} ${wide}`}>
                메모
              </th>
            </tr>
          </thead>
          <tbody>
            {kids.map((k) => {
              const td = `border-b border-line py-1.5 ${open?.id === k.id ? "bg-navy-tint" : ""}`;
              const notes = columns.map((c) => ({ c, e: store.get(k.id, c.date) })).filter((x) => x.e.status === "absent" && x.e.note);
              const n = counted(k).length;
              return (
                <tr key={k.id}>
                  <th scope="row" className={`${td} ${wide} font-bold whitespace-nowrap`}>
                    {k.name}
                  </th>
                  {showClass ? <td className={`${td} ${wide} whitespace-nowrap text-mute`}>{k.class_short}</td> : null}
                  {columns.map((c) => {
                    const e = store.get(k.id, c.date);
                    const id = cellId(k.id, c.date);
                    const isOpen = openKey === id;
                    return (
                      <td key={c.date} data-cell={id} className={`${td} ${day} relative`}>
                        {c.future ? (
                          <span className="text-track">·</span>
                        ) : (
                          <button
                            id={id}
                            type="button"
                            aria-haspopup="dialog"
                            aria-expanded={isOpen}
                            aria-label={`${k.name} ${c.md} ${e.status ? WORD[e.status] : "기록 없음"}, 고치기`}
                            onClick={() => setOpen(isOpen ? null : { id: k.id, date: c.date })}
                            className={`h-9 min-w-[46px] cursor-pointer rounded-lg border-0 px-1 text-[13px] font-bold focus-visible:outline-2 focus-visible:outline-navy ${isOpen ? "bg-white" : "bg-transparent hover:bg-fill"} ${e.status ? TONE[e.status] : "text-faint"}`}
                          >
                            {e.status ? WORD[e.status] : "·"}
                          </button>
                        )}
                        {isOpen ? <CellMenu kid={k} col={c} entry={e} store={store} onClose={() => close(k.id, c.date)} /> : null}
                      </td>
                    );
                  })}
                  <td className={`${td} px-2.5 text-center whitespace-nowrap`}>{n > 0 ? `${attended(k)} / ${n}` : <span className="text-faint">–</span>}</td>
                  <td className={`${td} ${wide} text-mute`}>{notes.map((x) => `${x.c.md} ${x.e.note}`).join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-2.5 py-2.5 text-mute" colSpan={showClass ? 2 : 1}>
                출석 인원
              </td>
              {columns.map((c) => {
                const marked = kids.some((k) => store.get(k.id, c.date).status !== null);
                return (
                  <td key={c.date} className="px-1 py-2.5 text-center">
                    {marked ? <b>{kids.filter((k) => came(store.get(k.id, c.date).status)).length}</b> : <span className="text-track">·</span>}
                  </td>
                );
              })}
              <td className="px-2.5 py-2.5 text-center">{sum.all > 0 ? <b>{Math.round((sum.att / sum.all) * 100)}%</b> : <span className="text-faint">–</span>}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <p className="m-0 px-2.5 py-2 text-[13px] text-mute">
          칸을 누르면 출석, 지각, 결석을 고칠 수 있어요. 아직 오지 않은 주일은 비어 있어요.
          <span aria-live="polite" className={`ml-1.5 font-semibold ${store.message?.error ? "text-danger" : "text-navy"}`}>
            {store.busy > 0 ? "저장 중" : (store.message?.text ?? (store.done ? "저장했어요" : ""))}
          </span>
        </p>
      </Card>
      {side}
    </div>
  );
}
