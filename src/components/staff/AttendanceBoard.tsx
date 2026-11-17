"use client";

import { useRef, useState } from "react";
import { primaryButtonClass } from "@/components/ui";
import { markAttendanceAction } from "@/lib/staff/actions";
import type { AttStatus, RosterKid } from "@/lib/staff/attendance";
import { Face } from "./ui";

const BUTTONS: { status: AttStatus; label: string; on: string }[] = [
  { status: "present", label: "출석", on: "bg-navy text-white" },
  { status: "late", label: "지각", on: "bg-[#8A5300] text-white" },
  { status: "absent", label: "결석", on: "bg-danger text-white" },
];

type Entry = { status: AttStatus | null; note: string };

function noteFor(kid: RosterKid, status: AttStatus | null): { text: string; warn: boolean } {
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

/** Attendance list: each tap is saved straight away; the screen updates first and rolls back if the save fails. */
export function AttendanceBoard({ date, kids }: { date: string; kids: RosterKid[] }) {
  const [entries, setEntries] = useState<Record<number, Entry>>(() => Object.fromEntries(kids.map((k) => [k.id, { status: k.status, note: k.note }])));
  const [failed, setFailed] = useState<Record<number, Entry>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(0);
  const saved = useRef<Record<number, Entry>>(Object.fromEntries(kids.map((k) => [k.id, { status: k.status, note: k.note }])));
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  function save(id: number, next: Entry) {
    setEntries((e) => ({ ...e, [id]: next }));
    setMessage(null);
    setBusy((n) => n + 1);
    // Saves run one after another so that quick taps on one child land in order.
    queue.current = queue.current.then(async () => {
      let ok = false;
      let error = "저장하지 못했어요. 다시 눌러 주세요";
      try {
        const r = await markAttendanceAction(id, date, next.status, next.note);
        ok = r.ok;
        if (!r.ok) error = r.error;
      } catch {
        // network trouble: keep the default message
      }
      setBusy((n) => n - 1);
      if (ok) {
        saved.current[id] = next;
        setFailed((f) => {
          const rest = { ...f };
          delete rest[id];
          return rest;
        });
      } else {
        setFailed((f) => ({ ...f, [id]: next }));
        setEntries((e) => ({ ...e, [id]: saved.current[id] }));
        setMessage({ text: error, error: true });
      }
    });
    return queue.current;
  }

  async function saveAll() {
    for (const [id, entry] of Object.entries(failed)) save(Number(id), entry);
    await queue.current;
    setMessage((m) => (m?.error ? m : { text: "출석을 저장했어요", error: false }));
  }

  const values = kids.map((k) => entries[k.id]?.status ?? null);
  const count = (s: AttStatus | null) => values.filter((v) => v === s).length;
  const chips = [
    { label: "출석", n: count("present"), cls: "bg-navy-tint text-navy" },
    { label: "지각", n: count("late"), cls: "bg-warn-tint text-warn" },
    { label: "결석", n: count("absent"), cls: "bg-danger-tint text-[#8E2A22]" },
    { label: "미체크", n: count(null), cls: "bg-fill text-sub" },
  ];

  return (
    <>
      <p className="m-0 px-4 pt-1.5 text-[14px] leading-5 tracking-[-0.2px] text-mute" aria-live="polite">
        {kids.length}명 중 {kids.length - count(null)}명 체크{busy > 0 ? " · 저장 중" : ""}
      </p>
      <div className="flex gap-1.5 px-4 pt-3.5 pb-1.5">
        {chips.map((c) => (
          <div key={c.label} className={`flex h-[30px] items-center gap-1 rounded-md px-2.5 text-[13px] font-bold ${c.cls}`}>
            {c.label} <span>{c.n}</span>
          </div>
        ))}
      </div>
      <ul className="m-0 flex grow list-none flex-col px-4 py-0">
        {kids.map((k) => {
          const e = entries[k.id] ?? { status: null, note: "" };
          const note = noteFor(k, e.status);
          return (
            <li key={k.id} className="border-b border-line">
              <div className="flex h-[70px] items-center gap-[13px]">
                <Face name={k.name} id={k.id} photo={k.photo_url} />
                <div className="flex min-w-0 grow flex-col gap-px">
                  <div className="truncate text-[17px] leading-[23px] font-bold tracking-[-0.4px] text-ink2">{k.name}</div>
                  <div className={`truncate text-[13px] leading-[18px] tracking-[-0.2px] ${note.warn ? "font-semibold text-danger" : "text-sub"}`}>{note.text}</div>
                </div>
                <div className="flex shrink-0 gap-[5px]" role="group" aria-label={`${k.name} 출석`}>
                  {BUTTONS.map((b) => {
                    const active = e.status === b.status;
                    return (
                      <button
                        key={b.status}
                        type="button"
                        aria-pressed={active}
                        onClick={() => save(k.id, { status: active ? null : b.status, note: !active && b.status === "absent" ? e.note : "" })}
                        className="flex h-11 cursor-pointer items-center border-0 bg-transparent p-0"
                      >
                        <span className={`flex h-[30px] w-[46px] items-center justify-center rounded-md text-[12px] font-semibold ${active ? b.on : "bg-fill text-sub"}`}>{b.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {e.status === "absent" ? (
                <div className="pb-2.5 pl-[59px]">
                  <label className="sr-only" htmlFor={`note-${k.id}`}>
                    {k.name} 결석 사유
                  </label>
                  <input
                    id={`note-${k.id}`}
                    defaultValue={e.note}
                    maxLength={200}
                    placeholder="결석 사유 (선택)"
                    enterKeyHint="done"
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") ev.currentTarget.blur();
                    }}
                    onBlur={(ev) => {
                      const v = ev.currentTarget.value.trim();
                      if (v !== (entries[k.id]?.note ?? "")) save(k.id, { status: "absent", note: v });
                    }}
                    className="h-11 w-full rounded-[10px] border-[1.5px] border-[#D1D6DB] bg-white px-3 text-[15px] text-ink outline-none focus:border-navy"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-[76px] z-10 bg-white px-4 pt-2.5 pb-2.5 lg:bottom-0">
        {message ? (
          <p role={message.error ? "alert" : "status"} className={`m-0 pb-2 text-center text-[13px] font-semibold ${message.error ? "text-danger" : "text-navy"}`}>
            {message.text}
          </p>
        ) : (
          <p className="m-0 pb-2 text-center text-[12px] text-mute">버튼을 누르면 바로 저장돼요</p>
        )}
        <button type="button" onClick={saveAll} className={`${primaryButtonClass} cursor-pointer`}>
          {Object.keys(failed).length > 0 ? "다시 저장하기" : "출석 저장하기"}
        </button>
      </div>
    </>
  );
}
