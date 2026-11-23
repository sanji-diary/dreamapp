"use client";

import { useState } from "react";
import type { GiftChild } from "@/lib/staff/gifts";
import { FieldGroup, SaveBar, SubmitButton, TextInput, errorFor } from "./form-kit";
import { Stepper } from "./widgets";

const REASONS = ["말씀 암송", "예배 도우미", "친구 도와주기", "행사 참여", "칭찬해요"];

/**
 * "선물 주기": choose the children, how many drops and points each one gets, and why.
 * Children are listed class by class; a class can be chosen whole. The server checks everything again.
 */
export function GiftForm({ kids, preselect, maxDrops, maxPoints, action, error }: { kids: GiftChild[]; preselect: number | null; maxDrops: number; maxPoints: number; action: (formData: FormData) => void | Promise<void>; error?: string | string[] }) {
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(preselect !== null && kids.some((k) => k.id === preselect) ? [preselect] : []));
  const [drops, setDrops] = useState(1);
  const [points, setPoints] = useState(0);
  const [reason, setReason] = useState("");

  // Class by class, in the order the list came in.
  const groups: { key: string; name: string; kids: GiftChild[] }[] = [];
  for (const k of kids) {
    const key = String(k.class_id ?? "none");
    const g = groups.find((x) => x.key === key);
    if (g) g.kids.push(k);
    else groups.push({ key, name: k.class_name ?? "반 없음", kids: [k] });
  }

  const toggle = (id: number) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (ids: number[], on: boolean) =>
    setChosen((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const what = [drops > 0 ? `물방울 ${drops}개` : "", points > 0 ? `${points}P` : ""].filter(Boolean).join("와 ");
  const ready = chosen.size > 0 && (drops > 0 || points > 0) && reason.trim() !== "";
  const summary = chosen.size === 0 ? "받을 아이를 골라 주세요" : !what ? "물방울이나 포인트를 정해 주세요" : `${chosen.size}명에게 ${what}${chosen.size > 1 ? "씩" : ""}`;

  return (
    <form action={action} className="flex grow flex-col gap-5">
      <FieldGroup legend="누구에게 줄까요?" error={errorFor(error, /아이/)}>
        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            const ids = g.kids.map((k) => k.id);
            const all = ids.every((id) => chosen.has(id));
            return (
              <div key={g.key} className="flex flex-col gap-1">
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <b className="text-[14px] text-ink2">
                    {g.name} <span className="font-medium text-mute">{g.kids.length}명</span>
                  </b>
                  <button type="button" onClick={() => toggleGroup(ids, !all)} aria-pressed={all} className="h-11 cursor-pointer rounded-full border-0 bg-transparent px-2 text-[13px] font-bold text-staff focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
                    {all ? "모두 풀기" : "모두 고르기"}
                  </button>
                </div>
                <div className="-my-[5px] flex flex-wrap gap-x-[7px]">
                  {g.kids.map((k) => (
                    <label key={k.id} className="relative flex h-11 min-w-11 cursor-pointer items-center justify-center">
                      <input type="checkbox" name="child" value={k.id} checked={chosen.has(k.id)} onChange={() => toggle(k.id)} className="peer sr-only" />
                      <span className="rounded-full bg-fill px-3.5 py-2 text-[13px] leading-[1.4] font-semibold whitespace-nowrap text-sub peer-checked:bg-staff peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-staff">
                        {k.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </FieldGroup>

      <FieldGroup legend="무엇을 줄까요?" hint={`한 아이에게 한 번에 물방울 ${maxDrops}개, ${maxPoints}P까지 줄 수 있어요. 선물로 준 물방울은 한 주 한도와 따로 세요.`} error={errorFor(error, /물방울|포인트/)}>
        <div className="flex gap-2 max-[399px]:flex-col">
          <Stepper name="drops" label="물방울" icon="drop" value={drops} onChange={setDrops} step={1} min={0} max={maxDrops} unit="개" />
          <Stepper name="points" label="포인트" icon="persimmon" value={points} onChange={setPoints} step={10} min={0} max={maxPoints} unit="P" />
        </div>
      </FieldGroup>

      <div className="flex flex-col gap-1.5">
        <TextInput label="이유" name="reason" id="gift-reason" required maxLength={40} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 말씀 암송" hint="아이의 첫 화면에 이 말이 함께 보여요." error={errorFor(error, /이유/)} />
        <div className="-my-[3px] flex flex-wrap gap-x-[7px]">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className="h-11 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
              <span className="rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-sub">{r}</span>
            </button>
          ))}
        </div>
      </div>

      <SaveBar className="flex-col !gap-1.5">
        <p role="status" className="m-0 text-center text-[13px] font-semibold text-sub">
          {summary}
        </p>
        <SubmitButton disabled={!ready}>선물 주기</SubmitButton>
      </SaveBar>
    </form>
  );
}
