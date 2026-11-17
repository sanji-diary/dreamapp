"use client";

import { useState } from "react";
import { inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { missionSaveAction } from "@/lib/staff/actions-admin";
import type { MissionInput } from "@/lib/staff/admin-missions";
import { QuizEditor } from "./QuizEditor";
import { Stepper } from "./widgets";

type Option = { value: string; label: string };

function Pick({ legend, name, options, value, onChange }: { legend: string; name: string; options: Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
      <legend className={`p-0 ${labelClass}`}>{legend}</legend>
      <div className="flex flex-wrap gap-x-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex h-11 cursor-pointer items-center">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className="flex h-[34px] items-center rounded-lg bg-fill px-3 text-[14px] font-semibold text-sub peer-checked:bg-navy peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const ICON_NAMES: Record<string, string> = { bible: "성경", stamp: "도장", house: "집", bubble: "말풍선", pray: "기도", drop: "물방울", can: "물뿌리개", persimmon: "감", badge: "배지", pouch: "주머니" };

const hintClass = "m-0 text-[13px] leading-[19px] text-sub";

/**
 * Create or edit a mission. Fields that belong to one kind show only for that kind:
 * verse text, quiz questions, the game picker, and the QR notes.
 */
export function MissionForm({ id, initial, kinds, icons, targets, games }: { id: number | null; initial: MissionInput; kinds: Option[]; icons: string[]; targets: Option[]; games: { id: string; title: string; description: string }[] }) {
  const [gameId, setGameId] = useState(initial.game_id ?? games[0]?.id ?? "");
  const [qrSelf, setQrSelf] = useState(initial.qr_self);
  const [kind, setKind] = useState(initial.kind);
  const [repeat, setRepeat] = useState(initial.repeat);
  const [icon, setIcon] = useState(initial.icon);
  const [points, setPoints] = useState(initial.points);
  const [drops, setDrops] = useState(initial.drops);
  const [target, setTarget] = useState(initial.target_class_id !== null ? `c${initial.target_class_id}` : initial.target_grade !== null ? `g${initial.target_grade}` : "all");
  return (
    <form action={missionSaveAction} className="flex grow flex-col gap-3 px-4 pt-1.5 pb-6">
      {id !== null ? <input type="hidden" name="id" value={id} /> : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="m-title" className={labelClass}>
          미션 이름
        </label>
        <input id="m-title" name="title" required maxLength={40} defaultValue={initial.title} placeholder="예: 이번 주 말씀 쓰기" className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="m-desc" className={labelClass}>
          한 줄 설명
        </label>
        <input id="m-desc" name="description" maxLength={80} defaultValue={initial.description} placeholder="예: 시편 23편 1절 따라 쓰기" className={inputClass} />
      </div>
      <Pick legend="어떻게 확인하나요" name="kind" options={kinds} value={kind} onChange={setKind} />
      {kind === "verse" ? (
        <div className="flex flex-col gap-2 rounded-xl bg-fill p-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="m-verse" className={labelClass}>
              따라 쓸 말씀
            </label>
            <textarea id="m-verse" name="verse_text" required maxLength={300} defaultValue={initial.verse_text ?? ""} className="min-h-[76px] w-full rounded-xl border-[1.5px] border-[#D1D6DB] bg-white px-3.5 py-2.5 text-[16px] leading-6 text-ink outline-none focus:border-navy" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="m-ref" className={labelClass}>
              말씀 주소
            </label>
            <input id="m-ref" name="verse_ref" maxLength={40} defaultValue={initial.verse_ref ?? ""} placeholder="예: 시편 23편 1절" className={inputClass} />
          </div>
        </div>
      ) : null}
      {kind === "quiz" ? <QuizEditor initial={initial.quiz} initialPass={initial.quiz_pass} /> : null}
      {kind === "game" ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded-xl border-0 bg-fill p-3">
          <legend className="sr-only">어떤 게임인가요</legend>
          <span aria-hidden="true" className={labelClass}>
            어떤 게임인가요
          </span>
          {games.map((g) => (
            <label key={g.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-transparent bg-white px-3.5 py-2 has-checked:border-navy has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-navy">
              <input type="radio" name="game_id" value={g.id} checked={gameId === g.id} onChange={() => setGameId(g.id)} className="h-5 w-5 shrink-0 accent-navy" />
              <span className="flex min-w-0 flex-col">
                <span className="text-[15px] font-bold text-ink2">{g.title}</span>
                <span className="text-[13px] leading-[18px] text-sub">{g.description}</span>
              </span>
            </label>
          ))}
          <p className={hintClass}>아이가 게임을 끝까지 하면 미션이 완료돼요. 시간을 재거나 순위를 매기지 않아요.</p>
        </fieldset>
      ) : null}
      {kind === "qr" ? (
        <div className="flex flex-col gap-1 rounded-xl bg-fill p-3">
          <p className="m-0 text-[14px] font-bold text-ink2">QR을 인쇄해서 교회에 붙여 주세요</p>
          <p className={hintClass}>{id === null ? "미션을 올리면 QR이 만들어져요. 미션 목록의 ‘QR 인쇄’에서 A4로 뽑을 수 있어요." : "이 화면 위쪽의 ‘QR 인쇄하기’에서 A4로 뽑을 수 있어요."} 아이가 휴대폰 카메라로 찍으면 바로 완료돼요.</p>
        </div>
      ) : null}
      {kind === "attendance" ? (
        <div className="flex flex-col gap-2 rounded-xl bg-fill p-3">
          <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold text-ink2">QR로 스스로 출석</span>
              <span className="text-[12px] leading-[17px] text-mute">아이가 교회에 붙은 QR을 찍으면 출석으로 기록돼요</span>
            </span>
            <input type="checkbox" role="switch" name="qr_self" checked={qrSelf} onChange={(e) => setQrSelf(e.target.checked)} className="peer sr-only" />
            <span className="flex h-[30px] w-[52px] shrink-0 items-center rounded-full bg-faint px-[3px] peer-checked:justify-end peer-checked:bg-navy peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy">
              <span className="h-6 w-6 rounded-full bg-white" />
            </span>
          </label>
          {qrSelf ? (
            <p className={hintClass}>
              기간 안의 어느 날이든 QR을 찍으면 그날 출석으로 기록돼요. 기간을 주일 하루로 정하고, 예배가 끝나면 QR을 떼어 주세요. QR 주소를 전달받은 아이도 찍을 수 있으니 출석부에서 한 번 더 확인해 주세요.
            </p>
          ) : null}
        </div>
      ) : null}
      <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
        <legend className={`p-0 ${labelClass}`}>아이콘</legend>
        <div className="grid grid-cols-5 gap-1.5 pt-1">
          {icons.map((name) => (
            <label key={name} className="cursor-pointer">
              <input type="radio" name="icon" value={name} checked={icon === name} onChange={() => setIcon(name)} className="peer sr-only" />
              <span className="flex h-[52px] items-center justify-center rounded-xl border-2 border-transparent bg-fill peer-checked:border-navy peer-checked:bg-navy-tint peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={ICON_NAMES[name] ?? name} src={`/img/icon-${name}.webp`} width={36} height={36} className="h-9 w-9" />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>보상</span>
        <div className="flex gap-2">
          <Stepper name="points" label="포인트" icon="pouch" value={points} onChange={setPoints} step={5} min={0} max={100} unit="P" />
          <Stepper name="drops" label="물방울" icon="drop" value={drops} onChange={setDrops} step={1} min={0} max={5} unit="개" />
        </div>
      </div>
      <Pick
        legend="몇 번 할 수 있나요"
        name="repeat"
        options={[
          { value: "once", label: "한 번" },
          { value: "daily", label: "매일" },
          { value: "weekly", label: "매주" },
        ]}
        value={repeat}
        onChange={setRepeat}
      />
      {repeat === "daily" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="m-limit" className={labelClass}>
            한 주에 몇 번까지
          </label>
          <input id="m-limit" name="weekly_limit" type="number" inputMode="numeric" min={1} max={7} defaultValue={initial.weekly_limit ?? ""} placeholder="비우면 7번" className={inputClass} />
          <p className="m-0 text-[12px] leading-[18px] text-mute">
            한 주에 최대 물방울 {drops * 7}개까지 받을 수 있어요. 횟수를 정하면 그만큼만 받아요.
          </p>
        </div>
      ) : null}
      <Pick legend="누구에게 보이나요" name="target" options={targets} value={target} onChange={setTarget} />
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className={`p-0 ${labelClass}`}>기간</legend>
        <div className="flex items-center gap-2 pt-1.5">
          <input aria-label="시작하는 날" name="starts_on" type="date" required defaultValue={initial.starts_on} className={`${inputClass} min-w-0 px-2.5`} />
          <span aria-hidden="true" className="text-mute">
            -
          </span>
          <input aria-label="끝나는 날" name="ends_on" type="date" required defaultValue={initial.ends_on} className={`${inputClass} min-w-0 px-2.5`} />
        </div>
      </fieldset>
      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl bg-fill px-3.5">
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold text-ink2">도전 미션</span>
          <span className="text-[12px] text-mute">미션 목록 맨 위에 따로 보여요</span>
        </span>
        <input type="checkbox" role="switch" name="is_challenge" defaultChecked={initial.is_challenge} className="peer sr-only" />
        <span className="flex h-[30px] w-[52px] shrink-0 items-center rounded-full bg-faint px-[3px] peer-checked:justify-end peer-checked:bg-navy peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy">
          <span className="h-6 w-6 rounded-full bg-white" />
        </span>
      </label>
      <button type="submit" className={`${primaryButtonClass} mt-2 shrink-0 cursor-pointer`}>
        {id === null ? "미션 올리기" : "미션 저장하기"}
      </button>
    </form>
  );
}
