"use client";

import { useState } from "react";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { staffSaveAction } from "@/lib/staff/actions-admin";

type SwitchKey = "can_attendance" | "can_visits" | "can_approve" | "can_view_all" | "can_read_pastor_worries";
type Switches = Record<SwitchKey, boolean>;

const SWITCHES: { key: SwitchKey; label: string }[] = [
  { key: "can_attendance", label: "출석 체크" },
  { key: "can_visits", label: "심방일지 쓰기·보기" },
  { key: "can_approve", label: "미션 승인" },
  { key: "can_view_all", label: "모든 반 보기" },
  { key: "can_read_pastor_worries", label: "전도사님께 쓴 고민 보기" },
];

/** Role, classes and switches for one teacher. Picking a role fills the switches with that role's preset. */
export function StaffForm({
  id,
  name,
  isSelf,
  initial,
  roles,
  presets,
  classes,
}: {
  id: number;
  name: string;
  isSelf: boolean;
  initial: { role: string; class_ids: number[]; active: boolean } & Switches;
  roles: { value: string; label: string }[];
  presets: Record<string, Switches>;
  classes: { id: number; name: string }[];
}) {
  const [role, setRole] = useState(initial.role);
  const [sw, setSw] = useState<Switches>(initial);
  const [classIds, setClassIds] = useState<number[]>(initial.class_ids);
  const [active, setActive] = useState(initial.active);
  const chip = (on: boolean) => `flex h-[34px] items-center rounded-lg px-3 text-[14px] font-semibold ${on ? "bg-navy text-white" : "bg-white text-sub"} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy`;
  return (
    <form action={staffSaveAction} className="flex flex-col gap-3 px-4 pt-2.5 pb-6">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-2.5 rounded-2xl bg-fill p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="s-name" className="text-[13px] font-semibold text-sub">
            이름
          </label>
          <input id="s-name" name="name" required maxLength={20} defaultValue={name} className={inputClass} />
        </div>
        <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
          <legend className="p-0 text-[13px] font-semibold text-sub">등급</legend>
          <div className="flex flex-wrap gap-x-1.5">
            {roles.map((r) => {
              const locked = isSelf && r.value !== "admin";
              return (
                <label key={r.value} className={`flex h-11 items-center ${locked ? "opacity-50" : "cursor-pointer"}`}>
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={role === r.value}
                    disabled={locked}
                    onChange={() => {
                      setRole(r.value);
                      setSw(presets[r.value]);
                    }}
                    className="peer sr-only"
                  />
                  <span className={chip(role === r.value)}>{r.label}</span>
                </label>
              );
            })}
          </div>
          {isSelf ? <p className="m-0 text-[12px] leading-[18px] text-mute">내 관리자 권한은 스스로 내릴 수 없어요.</p> : null}
        </fieldset>
        <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
          <legend className="p-0 text-[13px] font-semibold text-sub">담당 반</legend>
          <div className="flex flex-wrap gap-x-1.5">
            {classes.map((c) => {
              const on = classIds.includes(c.id);
              return (
                <label key={c.id} className="flex h-11 cursor-pointer items-center">
                  <input type="checkbox" name="class_ids" value={c.id} checked={on} onChange={() => setClassIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))} className="peer sr-only" />
                  <span className={chip(on)}>{c.name}</span>
                </label>
              );
            })}
            {classes.length === 0 ? <span className="py-2 text-[13px] text-mute">아직 반이 없어요</span> : null}
          </div>
        </fieldset>
        <div className="flex flex-col rounded-xl bg-white px-3.5 py-0.5">
          {SWITCHES.map((s) => (
            <label key={s.key} className="flex h-12 cursor-pointer items-center justify-between">
              <span className="text-[15px] font-semibold text-ink2">{s.label}</span>
              <input type="checkbox" role="switch" name={s.key} checked={sw[s.key]} onChange={(e) => setSw((v) => ({ ...v, [s.key]: e.target.checked }))} className="peer sr-only" />
              <span className={`flex h-[30px] w-[52px] shrink-0 items-center rounded-full px-[3px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy ${sw[s.key] ? "justify-end bg-navy" : "bg-faint"}`}>
                <span className="h-6 w-6 rounded-full bg-white" />
              </span>
            </label>
          ))}
        </div>
        {role === "basic" ? <p className="m-0 text-[12px] leading-[18px] text-mute">교사 기본은 스위치를 켜도 이름·사진·반만 볼 수 있어요.</p> : null}
        <label className={`flex h-12 items-center justify-between rounded-xl bg-white px-3.5 ${isSelf ? "opacity-50" : "cursor-pointer"}`}>
          <span className="text-[15px] font-semibold text-ink2">로그인 허용</span>
          <input type="hidden" name="active" value={active ? "on" : "off"} />
          <input type="checkbox" role="switch" checked={active} disabled={isSelf} onChange={(e) => setActive(e.target.checked)} className="peer sr-only" />
          <span className={`flex h-[30px] w-[52px] shrink-0 items-center rounded-full px-[3px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy ${active ? "justify-end bg-navy" : "bg-faint"}`}>
            <span className="h-6 w-6 rounded-full bg-white" />
          </span>
        </label>
      </div>
      <button type="submit" className={`${primaryButtonClass} cursor-pointer`}>
        저장하기
      </button>
    </form>
  );
}
