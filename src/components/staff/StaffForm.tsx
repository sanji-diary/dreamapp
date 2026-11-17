"use client";

import { useState } from "react";
import { staffSaveAction } from "@/lib/staff/actions-admin";
import { ChoiceChips, ErrorText, FieldGroup, HintText, SaveBar, SubmitButton, SwitchGroup, SwitchRow, TextInput, errorFor } from "./form-kit";

type SwitchKey = "can_attendance" | "can_visits" | "can_approve" | "can_view_all" | "can_read_pastor_worries";
type Switches = Record<SwitchKey, boolean>;

/** The same five switches, in the same words, as the table on the teacher list. */
const SWITCHES: { key: SwitchKey; label: string; hint: string }[] = [
  { key: "can_attendance", label: "출석 체크", hint: "주일 출석을 체크해요" },
  { key: "can_visits", label: "심방 기록", hint: "심방 기록을 쓰고 읽어요" },
  { key: "can_approve", label: "미션 확인", hint: "아이들이 올린 미션을 확인해요" },
  { key: "can_view_all", label: "모든 반 보기", hint: "다른 반 아이 정보도 볼 수 있어요" },
  { key: "can_read_pastor_worries", label: "전도사님 고민 읽기", hint: "아이가 전도사님에게 보낸 고민을 읽어요" },
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
  error,
}: {
  id: number;
  name: string;
  isSelf: boolean;
  initial: { role: string; class_ids: number[]; active: boolean } & Switches;
  roles: { value: string; label: string }[];
  presets: Record<string, Switches>;
  classes: { id: number; name: string }[];
  error?: string;
}) {
  const [role, setRole] = useState(initial.role);
  const [sw, setSw] = useState<Switches>(initial);
  const [classIds, setClassIds] = useState<number[]>(initial.class_ids);
  const [active, setActive] = useState(initial.active);
  const activeError = errorFor(error, /계정|한 명 이상/);
  return (
    <form action={staffSaveAction} className="flex min-w-0 grow flex-col gap-3.5">
      <input type="hidden" name="id" value={id} />
      <TextInput label="이름" name="name" id="s-name" required maxLength={20} defaultValue={name} />
      <ChoiceChips
        legend="역할"
        name="role"
        // An admin cannot take their own admin role away: the other roles are switched off here and refused on the server.
        options={roles.map((r) => ({ ...r, disabled: isSelf && r.value !== "admin" }))}
        value={role}
        onChange={(v) => {
          setRole(v);
          setSw(presets[v]);
        }}
        error={errorFor(error, /등급|역할|관리자/)}
        hint={isSelf ? "내 관리자 권한은 스스로 내릴 수 없어요." : "역할을 바꾸면 아래 스위치가 그 역할의 기본값으로 맞춰져요."}
      />
      <FieldGroup legend="담당 반">
        {classes.length > 0 ? (
          <div className="-my-[5px] flex flex-wrap gap-x-[7px]">
            {classes.map((c) => {
              const on = classIds.includes(c.id);
              return (
                <label key={c.id} className="relative flex h-11 cursor-pointer items-center">
                  <input type="checkbox" name="class_ids" value={c.id} checked={on} onChange={() => setClassIds((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))} className="peer sr-only" />
                  <span className="rounded-full bg-fill px-3.5 py-2 text-[13px] leading-[1.4] font-semibold whitespace-nowrap text-sub peer-checked:bg-navy peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy">{c.name}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <HintText>아직 반이 없어요.</HintText>
        )}
      </FieldGroup>
      <FieldGroup legend="할 수 있는 일" hint={role === "basic" ? "교사 기본은 스위치를 켜도 이름·사진·반만 볼 수 있어요." : undefined}>
        <SwitchGroup>
          {SWITCHES.map((s) => (
            <SwitchRow key={s.key} grouped name={s.key} label={s.label} hint={s.hint} checked={sw[s.key]} onChange={(on) => setSw((v) => ({ ...v, [s.key]: on }))} />
          ))}
        </SwitchGroup>
      </FieldGroup>
      <div className="flex flex-col gap-1.5">
        {/* The checkbox is switched off for one's own row, so the state is posted in a hidden field. */}
        <input type="hidden" name="active" value={active ? "on" : "off"} />
        <SwitchRow label="로그인 허용" hint={isSelf ? "내 계정은 스스로 끌 수 없어요" : "끄면 이 선생님은 들어올 수 없어요"} checked={active} disabled={isSelf} onChange={setActive} />
        {activeError ? <ErrorText>{activeError}</ErrorText> : null}
      </div>
      <SaveBar>
        <SubmitButton>저장하기</SubmitButton>
      </SaveBar>
    </form>
  );
}
