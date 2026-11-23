"use client";

import { useState } from "react";
import { missionSaveAction } from "@/lib/staff/actions-admin";
import type { MissionInput } from "@/lib/staff/admin-missions";
import type { Verse } from "@/lib/types";
import { addDays, weekLabel, weekStart } from "@/lib/time";
import { ChoiceChips, FieldGroup, FieldPair, HintText, NumberStepper, SaveBar, SubmitButton, SwitchRow, TextInput, errorFor, inputBoxClass } from "./form-kit";
import { QuizEditor } from "./QuizEditor";
import { VerseEditor } from "./plan/VerseEditor";

type Option = { value: string; label: string };

const ICON_NAMES: Record<string, string> = { bible: "성경", stamp: "도장", house: "집", bubble: "말풍선", pray: "기도", drop: "물방울", can: "물뿌리개", persimmon: "감", badge: "배지", pouch: "주머니" };

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
const dayOf = (v: string) => Number(v.slice(8));

/** The gray box that holds what belongs to one way of checking (the verse, the quiz, the game, the QR notes). */
const panelClass = "flex min-w-0 flex-col gap-3 rounded-[20px] bg-fill p-4 max-[339px]:p-3";

/**
 * Create or edit a mission, top to bottom as on the mock: 제목, how it is checked, drops and points,
 * when, who, and the challenge switch, then one button. Fields that belong to one kind show only
 * for that kind: verse text, quiz questions, the game picker and the QR notes.
 * `error` is the message the server sent back; it is shown again under the field it is about.
 */
export function MissionForm({
  id,
  initial,
  kinds,
  icons,
  targets,
  games,
  thisWeek,
  rotatingPerWeek,
  error,
}: {
  id: number | null;
  initial: MissionInput;
  kinds: Option[];
  icons: string[];
  targets: Option[];
  games: { id: string; title: string; description: string }[];
  /** The Sunday of the current week in Korea, for the week buttons. */
  thisWeek: string;
  /** The setting: how many rotating missions come out each week, for the hint under "순환". */
  rotatingPerWeek: number;
  error?: string;
}) {
  const [gameId, setGameId] = useState(initial.game_id ?? games[0]?.id ?? "");
  const [qrSelf, setQrSelf] = useState(initial.qr_self);
  const [kind, setKind] = useState(initial.kind);
  const [repeat, setRepeat] = useState(initial.repeat);
  const [icon, setIcon] = useState(initial.icon);
  const [points, setPoints] = useState(initial.points);
  const [drops, setDrops] = useState(initial.drops);
  const [target, setTarget] = useState(initial.target_class_id !== null ? `c${initial.target_class_id}` : initial.target_grade !== null ? `g${initial.target_grade}` : "all");
  const [starts, setStarts] = useState(initial.starts_on);
  const [ends, setEnds] = useState(initial.ends_on);
  const [mode, setMode] = useState(initial.mode ?? "dated");
  const ownVerses: Verse[] = initial.verses && initial.verses.length > 0 ? initial.verses : initial.verse_text ? [{ n: null, text: initial.verse_text }] : [];

  // Week buttons: this week and the two after it. They only fill the two date boxes below.
  const weeks = [0, 1, 2].map((i) => {
    const start = addDays(thisWeek, 7 * i);
    return { start, end: addDays(start, 6), label: `${weekLabel(start)}${i === 0 ? " · 이번 주" : i === 1 ? " · 다음 주" : ""}` };
  });
  const whole = isDay(starts) && isDay(ends) && weekStart(starts) === starts && ends === addDays(starts, 6);
  const sameMonth = starts.slice(0, 7) === ends.slice(0, 7);
  const dateError = errorFor(error, /기간/);

  return (
    <form action={missionSaveAction} className="flex grow flex-col gap-3.5">
      {id !== null ? <input type="hidden" name="id" value={id} /> : null}
      <TextInput label="제목" name="title" id="m-title" required maxLength={40} defaultValue={initial.title} placeholder="예: 가정예배 드리기" error={errorFor(error, /제목/)} />
      <TextInput label="한 줄 설명" name="description" id="m-desc" maxLength={80} defaultValue={initial.description} placeholder="예: 예배 사진 한 장 올리기" hint="아이 미션 목록에서 제목 아래에 보여요." />

      <ChoiceChips legend="어떻게 확인할까요?" name="kind" options={kinds} value={kind} onChange={setKind} error={errorFor(error, /확인 방법/)} />
      {kind === "verse" ? (
        <div className={panelClass}>
          {mode === "fixed" ? (
            <div className="flex flex-col gap-1">
              <b className="text-[15px] tracking-[-0.02em]">매주 바뀌는 말씀이에요</b>
              <span className="text-[13px] leading-[19px] text-mute">말씀은 미션 화면에서 주마다 넣어요. 말씀이 없는 주에는 아이에게 이 미션이 보이지 않아요.</span>
            </div>
          ) : (
            <VerseEditor idPrefix="m-verse" initialRef={initial.verse_ref} initialVerses={ownVerses} error={errorFor(error, /말씀|절/)} />
          )}
        </div>
      ) : null}
      {kind === "quiz" ? <QuizEditor initial={initial.quiz} initialPass={initial.quiz_pass} error={errorFor(error, /문제|통과 기준/)} /> : null}
      {kind === "game" ? (
        <div className={panelClass}>
          <FieldGroup legend="어떤 게임인가요?" error={errorFor(error, /게임/)} hint="아이가 게임을 끝까지 하면 미션이 완료돼요. 순위는 매기지 않아요. 둘이 하는 게임은 두 아이가 각자 자기 휴대폰에서 이 미션을 열어야 해요.">
            <div className="flex flex-col gap-2">
              {games.map((g) => (
                <label key={g.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-transparent bg-white px-3.5 py-2 has-checked:border-staff has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-staff">
                  <input type="radio" name="game_id" value={g.id} checked={gameId === g.id} onChange={() => setGameId(g.id)} className="h-5 w-5 shrink-0 accent-staff" />
                  <span className="flex min-w-0 flex-col">
                    <b className="text-[15px] tracking-[-0.02em]">{g.title}</b>
                    <span className="text-[13px] text-mute">{g.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </FieldGroup>
        </div>
      ) : null}
      {kind === "qr" ? (
        <div className={panelClass}>
          <div className="flex flex-col gap-1">
            <b className="text-[15px] tracking-[-0.02em]">QR을 인쇄해서 교회에 붙여 주세요</b>
            <span className="text-[13px] leading-[19px] text-mute">
              {id === null ? "미션을 올리면 QR이 만들어져요. 미션 목록에서 미션을 누르고 ‘QR 인쇄’로 A4에 뽑을 수 있어요." : "이 화면 위쪽의 ‘QR 인쇄’에서 A4로 뽑을 수 있어요."} 아이가 휴대폰 카메라로 찍으면 바로 완료돼요.
            </span>
          </div>
        </div>
      ) : null}
      {kind === "attendance" ? (
        <div className={panelClass}>
          <SwitchRow onGray name="qr_self" checked={qrSelf} onChange={setQrSelf} label="QR로 스스로 출석" hint="아이가 교회에 붙은 QR을 찍으면 출석으로 기록돼요" />
          {qrSelf ? (
            <HintText>기간 안의 어느 날이든 QR을 찍으면 그날 출석으로 기록돼요. 기간을 주일 하루로 정하고, 예배가 끝나면 QR을 떼어 주세요. QR 주소를 전달받은 아이도 찍을 수 있으니 출석부에서 한 번 더 확인해 주세요.</HintText>
          ) : null}
        </div>
      ) : null}

      <FieldPair>
        <NumberStepper label="물방울" name="drops" id="m-drops" value={drops} onChange={setDrops} step={1} min={0} max={12} unit="개" error={errorFor(error, /물방울/)} hint={drops === 0 ? "물방울 없이 포인트만 줘요." : undefined} />
        <NumberStepper label="포인트" name="points" id="m-points" value={points} onChange={setPoints} step={5} min={0} max={1000} unit="P" error={errorFor(error, /포인트/)} />
      </FieldPair>

      <ChoiceChips
        legend="언제 나오나요?"
        name="mode"
        options={[
          { value: "fixed", label: "매주 고정" },
          { value: "pool", label: "순환" },
          { value: "dated", label: "기간 정하기" },
        ]}
        value={mode}
        onChange={(v) => setMode(v as typeof mode)}
        error={errorFor(error, /언제 여는지|돌아가는 순서/)}
        hint={
          mode === "fixed"
            ? "매주 빠짐없이 나와요. 출석, 말씀 쓰기, 가정예배처럼 늘 하는 미션이에요."
            : mode === "pool"
              ? `보관함에 들어가요. 오래 안 나온 미션부터 한 주에 ${rotatingPerWeek}개씩 자동으로 나와요. 미션 화면의 ‘순환 미션’에서 그 주 것을 바꿀 수 있어요.`
              : "정한 날짜에만 나와요."
        }
      />
      {mode !== "dated" ? (
        <>
          <input type="hidden" name="starts_on" value={starts} />
          <input type="hidden" name="ends_on" value={ends} />
        </>
      ) : null}
      {mode === "dated" ? (
      <FieldGroup legend="언제" error={dateError} hint={whole ? `${weekLabel(starts)} (${sameMonth ? "" : `${Number(starts.slice(5, 7))}월 `}${dayOf(starts)}일 ~ ${sameMonth ? "" : `${Number(ends.slice(5, 7))}월 `}${dayOf(ends)}일) 주일부터 토요일까지예요.` : "주를 누르면 그 주 주일부터 토요일까지로 맞춰져요. 날짜를 직접 고쳐도 돼요."}>
        <div className="-my-[5px] flex flex-wrap gap-x-[7px]" role="group" aria-label="주로 고르기">
          {weeks.map((w) => {
            const on = starts === w.start && ends === w.end;
            return (
              <button
                key={w.start}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setStarts(w.start);
                  setEnds(w.end);
                }}
                className="group flex h-11 cursor-pointer items-center border-0 bg-transparent p-0 outline-none"
              >
                <span className={`rounded-full px-3.5 py-2 text-[13px] leading-[1.4] font-semibold whitespace-nowrap group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-staff ${on ? "bg-staff text-white" : "bg-fill text-sub"}`}>{w.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 max-[339px]:flex-col max-[339px]:items-stretch max-[339px]:gap-1.5">
          <input aria-label="시작하는 날" name="starts_on" type="date" required value={starts} onChange={(e) => setStarts(e.target.value)} aria-invalid={dateError ? true : undefined} className={inputBoxClass(Boolean(dateError), true)} />
          <span aria-hidden="true" className="text-mute max-[339px]:hidden">
            ~
          </span>
          <input aria-label="끝나는 날" name="ends_on" type="date" required value={ends} min={isDay(starts) ? starts : undefined} onChange={(e) => setEnds(e.target.value)} aria-invalid={dateError ? true : undefined} className={inputBoxClass(Boolean(dateError), true)} />
        </div>
      </FieldGroup>
      ) : null}

      <ChoiceChips
        legend="몇 번 할 수 있나요?"
        name="repeat"
        options={[
          { value: "once", label: "한 번" },
          { value: "daily", label: "매일" },
          { value: "weekly", label: "매주" },
        ]}
        value={repeat}
        onChange={setRepeat}
        error={errorFor(error, /반복/)}
      />
      {repeat === "daily" ? (
        <TextInput
          label="한 주에 몇 번까지"
          name="weekly_limit"
          id="m-limit"
          type="number"
          inputMode="numeric"
          min={1}
          max={7}
          defaultValue={initial.weekly_limit ?? ""}
          placeholder="비우면 7번"
          hint={drops === 0 ? "포인트만 주는 미션이에요. 횟수를 정하면 그만큼만 받아요." : `한 주에 최대 물방울 ${drops * 7}개까지 받을 수 있어요. 횟수를 정하면 그만큼만 받아요.`}
          error={errorFor(error, /횟수/)}
        />
      ) : null}

      <ChoiceChips legend="누구에게" name="target" options={targets} value={target} onChange={setTarget} />

      <FieldGroup legend="그림">
        <div className="grid grid-cols-5 gap-1.5 min-[480px]:grid-cols-10">
          {icons.map((name) => (
            <label key={name} className="relative cursor-pointer">
              <input type="radio" name="icon" value={name} aria-label={ICON_NAMES[name] ?? name} checked={icon === name} onChange={() => setIcon(name)} className="peer sr-only" />
              <span className="grid h-[52px] place-items-center rounded-2xl border-2 border-transparent bg-fill peer-checked:border-staff peer-checked:bg-staff-tint peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-staff">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={`/img/icon-${name}.webp`} width={36} height={36} className="h-9 w-9 object-contain" />
              </span>
            </label>
          ))}
        </div>
      </FieldGroup>

      {mode === "dated" ? <SwitchRow name="is_challenge" defaultChecked={initial.is_challenge} label="이번 주 도전 미션" hint="아이 미션 목록 맨 위에 보여요" /> : null}

      <SaveBar>
        <SubmitButton>{id === null ? "미션 올리기" : "고친 내용 저장"}</SubmitButton>
      </SaveBar>
    </form>
  );
}
