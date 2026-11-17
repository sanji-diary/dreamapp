"use client";

import type { ReactNode } from "react";
import { Tag, TreeAvatar, ctaClass } from "@/components/staff/kit";
import type { AttStatus } from "@/lib/staff/attendance";
import type { MonthKid } from "@/lib/staff/attendance-month";
import type { AttendanceStore } from "./store";

export const STATUS_BUTTONS: { status: AttStatus; label: string; on: string }[] = [
  { status: "present", label: "출석", on: "bg-navy font-bold text-white" },
  { status: "late", label: "지각", on: "bg-warn-tint font-bold text-warn" },
  { status: "absent", label: "결석", on: "bg-danger-tint font-bold text-danger" },
];

/** The line under the name: how the weeks before this one went, counting the mark being made now. */
function noteFor(kid: MonthKid, status: AttStatus | null): { text: string; warn: boolean } {
  const p = kid.prior;
  const word = (k: "attend" | "absent") => (k === "absent" ? "결석" : "출석");
  if (status === null) {
    if (p.kind === null) return { text: kid.isNew ? "새 친구" : "지난주 기록 없음", warn: false };
    return { text: p.n >= 2 ? `${p.n}주 연속 ${word(p.kind)}` : `지난주 ${word(p.kind)}`, warn: p.kind === "absent" && p.n >= 2 };
  }
  const now = status === "absent" ? "absent" : "attend";
  const total = p.kind === now ? p.n + 1 : 1;
  if (total >= 2) return { text: `${total}주 연속 ${word(now)}`, warn: now === "absent" };
  if (p.kind === null) return { text: kid.isNew ? "새 친구" : "지난주 기록 없음", warn: false };
  return { text: p.n >= 2 ? `지난주까지 ${p.n}주 연속 ${word(p.kind)}` : `지난주 ${word(p.kind)}`, warn: false };
}

function Row({ kid, date, store }: { kid: MonthKid; date: string; store: AttendanceStore }) {
  const e = store.get(kid.id, date);
  const note = noteFor(kid, e.status);
  return (
    <li className="flex flex-col border-b border-line py-[7px] last:border-b-0">
      {/* So that names stay whole: below 360px the three buttons are a little narrower (44px), and below
          330px (a folded cover screen) they move to a line of their own under the picture and the name. */}
      <div className="flex items-center gap-x-2.5 max-[329px]:flex-wrap">
        <TreeAvatar level={kid.level} photo={kid.photo_url} size="s" />
        <div className="flex min-w-0 grow flex-col max-[329px]:basis-[calc(100%-48px)]">
          <b className="text-[15px]">{kid.name}</b>
          <span className={`text-[13px] ${note.warn ? "font-semibold text-danger" : "text-mute"}`}>{note.text}</span>
        </div>
        <div className="flex shrink-0 gap-[5px] max-[329px]:w-full" role="group" aria-label={`${kid.name} 출석`}>
          {STATUS_BUTTONS.map((b) => {
            const active = e.status === b.status;
            return (
              <button
                key={b.status}
                type="button"
                aria-pressed={active}
                onClick={() => store.save(kid.id, date, { status: active ? null : b.status, note: !active && b.status === "absent" ? e.note : "" })}
                className="group flex h-11 cursor-pointer items-center border-0 bg-transparent p-0 outline-none max-[329px]:flex-1"
              >
                <span
                  className={`grid h-[34px] w-[50px] place-items-center rounded-[9px] text-[13px] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy max-[359px]:w-11 max-[329px]:h-9 max-[329px]:w-full ${active ? b.on : "bg-fill font-semibold text-sub"}`}
                >
                  {b.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {e.status === "absent" ? (
        <div className="pt-0.5 pb-1 pl-12 max-[329px]:pl-0">
          <label className="sr-only" htmlFor={`note-${kid.id}`}>
            {kid.name} 결석 사유
          </label>
          <input
            id={`note-${kid.id}`}
            defaultValue={e.note}
            maxLength={200}
            placeholder="결석 사유 (선택)"
            enterKeyHint="done"
            onKeyDown={(ev) => {
              if (ev.key === "Enter") ev.currentTarget.blur();
            }}
            onBlur={(ev) => {
              const v = ev.currentTarget.value.trim();
              if (v !== store.get(kid.id, date).note) store.save(kid.id, date, { status: "absent", note: v });
            }}
            className="h-11 w-full rounded-xl border-0 bg-fill px-3.5 text-[16px] text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-navy"
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Phones (and everything below `lg`): the roll call of one day. One row per child with 출석, 지각 and
 * 결석; a tap is saved straight away, and tapping the lit button again clears the mark.
 * `title` is the class name, or the class picker for a teacher with several classes.
 * With `grouped` (모든 반) the children are listed class by class.
 */
export function RollCall({ date, kids, store, title, grouped }: { date: string; kids: MonthKid[]; store: AttendanceStore; title: ReactNode; grouped: boolean }) {
  const values = kids.map((k) => store.get(k.id, date).status);
  const count = (s: AttStatus | null) => values.filter((v) => v === s).length;
  const came = count("present") + count("late");
  const rest = [count("late") > 0 ? `지각 ${count("late")}명` : null, count("absent") > 0 ? `결석 ${count("absent")}명` : null, count(null) > 0 ? `아직 ${count(null)}명 남았어요` : null].filter(Boolean);
  const classIds = grouped ? [...new Set(kids.map((k) => k.class_id))] : [];

  return (
    <div className="flex grow flex-col gap-2 lg:hidden">
      <div className="flex min-h-11 flex-wrap items-center gap-x-2">
        <div className="flex min-w-0 grow">{title}</div>
        <Tag tone="navy">
          {kids.length}명 중 {came}명 출석
        </Tag>
      </div>
      <p aria-live="polite" className="m-0 -mt-1.5 min-h-[18px] text-[13px] text-mute">
        {rest.join(" · ")}
        {store.busy > 0 ? `${rest.length > 0 ? " · " : ""}저장 중` : ""}
      </p>
      {grouped ? (
        classIds.map((id) => {
          const group = kids.filter((k) => k.class_id === id);
          return (
            <section key={id} className="flex flex-col pt-1.5">
              <h3 className="m-0 text-[13px] font-bold text-sub">{group[0].class_name}</h3>
              <ul className="m-0 flex list-none flex-col p-0">
                {group.map((k) => (
                  <Row key={k.id} kid={k} date={date} store={store} />
                ))}
              </ul>
            </section>
          );
        })
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {kids.map((k) => (
            <Row key={k.id} kid={k} date={date} store={store} />
          ))}
        </ul>
      )}
      <span className="grow" />
      <div className="sticky bottom-[76px] z-10 -mx-[18px] bg-white px-[18px] pt-2 pb-2.5">
        {store.message ? (
          <p role={store.message.error ? "alert" : "status"} className={`m-0 pb-2 text-center text-[13px] font-semibold ${store.message.error ? "text-danger" : "text-navy"}`}>
            {store.message.text}
          </p>
        ) : (
          <p className="m-0 pb-2 text-center text-[12px] text-mute">버튼을 누르면 바로 저장돼요</p>
        )}
        <button type="button" onClick={store.saveAll} className={ctaClass()}>
          {store.failed > 0 ? "다시 저장하기" : "저장하기"}
        </button>
      </div>
    </div>
  );
}
