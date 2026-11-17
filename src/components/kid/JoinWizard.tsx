"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { primaryButtonClass } from "@/components/ui";
import { completeOnboardingAction, newPinAction, selfJoinAction } from "@/lib/kid/actions";
import { birthYearChoices, defaultBirthYear, usualGrade } from "@/lib/kid/birth";
import type { OnboardingErrors, OnboardingField } from "@/lib/kid/onboarding";
import { PinDots, PinKeys } from "./PinPad";
import { YearWheel } from "./YearWheel";

/**
 * Sign-up, one question at a time: name, gender, birth year, school, church class, then the PIN twice.
 * The newest question is at the top; earlier answers stay underneath and can be tapped to change them.
 * Nothing is saved until the PIN is repeated, so going back is always safe.
 *
 * The same wizard serves both ways in: the shared QR (a new child) and a personal card
 * (a child the teacher registered, with the teacher's answers already filled in).
 */

type AskKey = "name" | "gender" | "birth" | "school" | "classId";
type StepKey = AskKey | "pin" | "pin2";
const ASK_STEPS: AskKey[] = ["name", "gender", "birth", "school", "classId"];
const PIN_STEPS: StepKey[] = ["pin", "pin2"];

export interface JoinPrefill {
  name: string;
  gender: "" | "M" | "F";
  birthYear: number | null;
  school: string;
  classId: number | null;
}

interface Props {
  /** Shared QR: `code`. Personal card: `token`. */
  entry: { kind: "self"; code: string } | { kind: "card"; token: string };
  today: string;
  classes: { id: number; name: string }[];
  prefill: JoinPrefill;
  /** The child joined before and only needs a new PIN. */
  pinOnly?: boolean;
}

/** Keeps the screen exactly as tall as the visible area so the confirm button sits right above the keyboard. */
function useVisibleArea(): { height: number | null; keyboard: boolean } {
  const [area, setArea] = useState<{ height: number | null; keyboard: boolean }>({ height: null, keyboard: false });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const height = Math.round(vv.height);
      setArea({ height, keyboard: height < window.innerHeight - 120 });
      if (vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return area;
}

const LABEL: Record<AskKey, string> = { name: "이름", gender: "성별", birth: "태어난 해", school: "학교", classId: "반" };
const QUESTION: Record<AskKey, string> = {
  name: "이름을 알려 주세요",
  gender: "성별을 골라 주세요",
  birth: "몇 년에 태어났어요?",
  school: "다니는 학교를 알려 주세요",
  classId: "교회에서 몇 반이에요?",
};

const lineInput =
  "w-full rounded-none border-0 border-b-2 border-solid border-navy bg-transparent px-0 pt-1 pb-2 text-[24px] leading-8 font-bold tracking-[-0.5px] text-ink outline-none placeholder:font-semibold placeholder:text-[#C4C9D0]";
const optionBase = "flex cursor-pointer items-center justify-center rounded-2xl border-[1.5px] border-solid text-[19px] font-bold tracking-[-0.3px]";
const optionOn = "border-navy bg-navy-tint text-navy";
const optionOff = "border-[#D9DEE3] bg-white text-ink";

function BackArrow() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function JoinWizard({ entry, today, classes, prefill, pinOnly = false }: Props) {
  // A card whose teacher already chose the class does not ask for it: the teacher's class stays.
  const classSet = entry.kind === "card" && prefill.classId !== null;
  const askSteps = useMemo<AskKey[]>(() => (pinOnly ? [] : classSet ? ASK_STEPS.filter((k) => k !== "classId") : ASK_STEPS), [pinOnly, classSet]);
  const steps = useMemo<StepKey[]>(() => [...askSteps, ...PIN_STEPS], [askSteps]);
  const pinIndex = steps.indexOf("pin");
  const [index, setIndex] = useState(0);
  /** The furthest question reached so far: answers before it are shown in the stack. */
  const [reached, setReached] = useState(0);
  const [name, setName] = useState(prefill.name);
  const [gender, setGender] = useState<"" | "M" | "F">(prefill.gender);
  const [birthYear, setBirthYear] = useState<number | null>(prefill.birthYear);
  const [school, setSchool] = useState(prefill.school);
  const [classId, setClassId] = useState<number | null>(prefill.classId);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinNote, setPinNote] = useState("");
  const [shake, setShake] = useState(0);
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [fatal, setFatal] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { height, keyboard } = useVisibleArea();
  const step = steps[index];

  const thisYear = Number(today.slice(0, 4));
  const years = useMemo(() => birthYearChoices(thisYear), [thisYear]);
  /** What the wheel rests on: the chosen year, or fifth grade until the child moves it. */
  const wheelYear = birthYear !== null && years.includes(birthYear) ? birthYear : defaultBirthYear(thisYear);

  /** After an answer: on to the next question, or back to where the child was when they went to change an earlier one. */
  const advance = useCallback(
    (from: number) => {
      const target = Math.min(steps.length - 1, from < reached ? reached : from + 1);
      setReached((r) => Math.max(r, target));
      setIndex(target);
    },
    [reached, steps.length],
  );

  const clearPins = () => {
    setPin("");
    setPin2("");
  };
  const back = () => {
    // Leaving a PIN screen backwards starts the PIN over, so a half-typed one is never kept.
    if (step === "pin" || step === "pin2") {
      clearPins();
      setReached(pinIndex);
    }
    setIndex((i) => Math.max(0, i - 1));
  };

  const valid: Record<AskKey, boolean> = {
    name: name.trim().length >= 2,
    gender: gender !== "",
    birth: birthYear !== null,
    school: school.trim().length >= 2,
    classId: true,
  };
  const clearError = (k: OnboardingField) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  const submit = useCallback(
    async (finalPin2: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setFatal("");
      try {
        const input = { name, gender, birthYear: birthYear ?? 0, school, classId, pin, pin2: finalPin2 };
        const r = pinOnly && entry.kind === "card" ? await newPinAction(entry.token, pin, finalPin2) : entry.kind === "card" ? await completeOnboardingAction(entry.token, input) : await selfJoinAction(entry.code, input);
        // Success redirects on the server; a returned value means something needs fixing.
        if (!r) return;
        setPin2("");
        if (r.reason === "invalid" && r.errors) {
          const found = r.errors;
          setErrors(found);
          const first = steps.findIndex((s) => found[s]);
          const target = first >= 0 ? first : pinIndex;
          // Anything wrong before the repeat screen: the PIN is made again after fixing it.
          if (target <= pinIndex) {
            setPin("");
            setReached(pinIndex);
          }
          setIndex(target);
        } else if (r.reason === "already") setFatal("이미 가입을 마친 카드예요. 카드를 다시 찍어 주세요.");
        else if (r.reason === "busy") setFatal("지금 가입하는 친구가 많아요. 잠시 후 다시 해 주세요.");
        else if (r.reason === "closed") setFatal("지금은 가입할 수 없어요. 선생님께 말해 주세요.");
        else setFatal("카드를 찾을 수 없어요. 선생님께 말해 주세요.");
      } catch {
        setFatal("연결이 잠시 끊겼어요. 다시 눌러 주세요.");
        setPin2("");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [entry, pinOnly, name, gender, birthYear, school, classId, pin, steps, pinIndex],
  );

  const onPinDigit = useCallback(
    (d: string) => {
      if (step === "pin") {
        if (pin.length >= 4) return;
        const v = pin + d;
        setPin(v);
        setPinNote("");
        clearError("pin");
        if (v.length === 4) setTimeout(() => advance(pinIndex), 180);
      } else if (step === "pin2") {
        if (pin2.length >= 4 || savingRef.current) return;
        const v = pin2 + d;
        setPin2(v);
        setFatal("");
        if (v.length < 4) return;
        if (v !== pin) {
          // Start over from the first PIN screen, gently.
          setTimeout(() => {
            setPin("");
            setPin2("");
            setPinNote("두 번 누른 숫자가 달랐어요.\n처음부터 다시 만들어 볼까요?");
            setShake((n) => n + 1);
            setIndex(pinIndex);
          }, 250);
        } else void submit(v);
      }
    },
    [step, pin, pin2, advance, pinIndex, submit],
  );
  const onPinDelete = useCallback(() => {
    if (step === "pin") setPin((p) => p.slice(0, -1));
    else if (step === "pin2") setPin2((p) => p.slice(0, -1));
  }, [step]);

  /* ---------- the dark PIN screens ---------- */

  if (step === "pin" || step === "pin2") {
    const first = step === "pin";
    const note = first ? (errors.pin ?? pinNote) : saving ? "잠시만 기다려 주세요…" : (fatal || errors.pin2 || "");
    return (
      <main className="flex flex-col overflow-hidden bg-ink text-white" style={{ height: height ?? "100dvh" }}>
        <div className="flex h-[52px] shrink-0 items-center pt-[env(safe-area-inset-top)] pl-2">
          {index > 0 ? (
            <button type="button" aria-label="이전으로" disabled={saving} onClick={back} className="flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent text-white">
              <BackArrow />
            </button>
          ) : null}
        </div>
        <div key={step} className="step-in flex min-h-0 grow flex-col items-center justify-center px-6 pb-4 text-center">
          <h1 className="m-0 text-[24px] leading-8 font-bold tracking-[-0.5px]">{first ? (pinOnly ? "새 비밀번호를 만들어요" : "비밀번호를 만들어요") : "한 번 더 눌러 주세요"}</h1>
          <p className="m-0 mt-2 text-[15px] leading-[22px] text-white/70">{first ? "나만 아는 숫자 4개를 눌러 주세요" : "방금 누른 숫자와 똑같이 눌러요"}</p>
          <div className="mt-9">
            <PinDots key={first ? shake : "again"} count={first ? pin.length : pin2.length} shake={first && shake > 0} dark />
          </div>
          <p role={saving ? "status" : "alert"} className={`m-0 mt-5 min-h-10 text-[14px] leading-5 font-semibold whitespace-pre-line ${saving ? "text-white/70" : "text-[#FFB4AB]"}`}>
            {note}
          </p>
        </div>
        <div className="shrink-0 pb-[max(20px,env(safe-area-inset-bottom))]">
          <PinKeys onDigit={onPinDigit} onDelete={onPinDelete} disabled={saving} dark />
        </div>
      </main>
    );
  }

  /* ---------- the white question screens ---------- */

  const answer: Record<AskKey, string> = {
    name: name.trim(),
    gender: gender === "M" ? "남자" : gender === "F" ? "여자" : "",
    birth: birthYear ? `${birthYear}년` : "",
    school: school.trim(),
    classId: classId === null ? "잘 모르겠어요" : (classes.find((c) => c.id === classId)?.name ?? "잘 모르겠어요"),
  };
  // Newest first, like the stack of a bank sign-up form.
  const earlier = askSteps.map((k, i) => ({ k, i }))
    .filter(({ i }) => i < reached && i !== index)
    .reverse();

  const error = (k: OnboardingField) =>
    errors[k] ? (
      <p role="alert" className="m-0 mt-2 text-[14px] font-semibold text-danger">
        {errors[k]}
      </p>
    ) : null;

  const textStep = (k: "name" | "school", input: ReactNode, hint?: string) => (
    <form
      id="step-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid[k]) advance(index);
      }}
      className="flex flex-col"
    >
      <label htmlFor={`f-${k}`} className="text-[13px] leading-[18px] font-semibold text-navy">
        {LABEL[k]}
      </label>
      {input}
      {error(k)}
      {hint && !errors[k] ? <p className="m-0 mt-2 text-[13px] leading-[19px] text-mute">{hint}</p> : null}
    </form>
  );
  const pick = (set: () => void) => {
    set();
    setTimeout(() => advance(index), 160);
  };

  let body: ReactNode = null;
  switch (step) {
    case "name":
      body = textStep(
        "name",
        <input
          id="f-name"
          autoFocus
          autoComplete="name"
          enterKeyHint="next"
          maxLength={10}
          placeholder="홍길동"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearError("name");
          }}
          className={lineInput}
        />,
        entry.kind === "card" && prefill.name ? "선생님이 적어 둔 이름이에요. 틀렸으면 고쳐 주세요" : undefined,
      );
      break;
    case "gender":
      body = (
        <>
          <div role="group" aria-label="성별" className="grid grid-cols-2 gap-3">
            {(
              [
                ["M", "남자"],
                ["F", "여자"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={gender === v}
                onClick={() =>
                  pick(() => {
                    setGender(v);
                    clearError("gender");
                  })
                }
                className={`${optionBase} h-[96px] text-[21px] ${gender === v ? optionOn : optionOff}`}
              >
                {label}
              </button>
            ))}
          </div>
          {error("gender")}
        </>
      );
      break;
    case "birth": {
      const grade = usualGrade(wheelYear, thisYear);
      body = (
        <>
          <YearWheel
            years={years}
            value={wheelYear}
            label="태어난 해"
            onChange={(y) => {
              setBirthYear(y);
              clearError("birth");
            }}
          />
          <p aria-live="polite" className="m-0 mt-4 min-h-5 text-center text-[14px] leading-5 font-medium text-mute">
            {grade ? `${wheelYear}년에 태어났으면 보통 ${grade}이에요` : ""}
          </p>
          {error("birth")}
        </>
      );
      break;
    }
    case "school":
      body = textStep(
        "school",
        <input
          id="f-school"
          autoFocus
          autoComplete="off"
          enterKeyHint="next"
          maxLength={40}
          placeholder="꿈의숲초등학교"
          value={school}
          onChange={(e) => {
            setSchool(e.target.value);
            clearError("school");
          }}
          className={lineInput}
        />,
      );
      break;
    case "classId":
      body = (
        <>
          <div role="group" aria-label="교회 반" className="grid grid-cols-2 gap-2.5">
            {classes.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={classId === c.id}
                onClick={() =>
                  pick(() => {
                    setClassId(c.id);
                    clearError("classId");
                  })
                }
                className={`${optionBase} min-h-[60px] px-2 py-2 text-center text-[17px] leading-[22px] ${classId === c.id ? optionOn : optionOff}`}
              >
                {c.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                pick(() => {
                  setClassId(null);
                  clearError("classId");
                })
              }
              className={`${optionBase} col-span-2 min-h-[60px] flex-col text-[17px] ${optionOff} border-dashed`}
            >
              잘 모르겠어요
              <span className="text-[13px] leading-[18px] font-medium text-mute">선생님이 나중에 알려 주실 거예요</span>
            </button>
          </div>
          {error("classId")}
        </>
      );
      break;
  }

  const isText = step === "name" || step === "school";

  return (
    <main className="flex flex-col overflow-hidden bg-white" style={{ height: height ?? "100dvh" }}>
      <div className="flex h-[52px] shrink-0 items-center pt-[env(safe-area-inset-top)] pl-2">
        {index > 0 ? (
          <button type="button" aria-label="이전 질문으로" onClick={back} className="flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent text-ink">
            <BackArrow />
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 grow flex-col overflow-y-auto px-6 pt-3 pb-4">
        <div key={step} className="step-in flex flex-col">
          <h1 className="m-0 mb-7 text-[26px] leading-[35px] font-bold tracking-[-0.6px] whitespace-pre-line">{QUESTION[step as AskKey]}</h1>
          {body}
        </div>
        {earlier.length > 0 ? (
          <ul aria-label="앞에서 답한 것" className="m-0 mt-5 flex list-none flex-col p-0">
            {earlier.map(({ k, i }) => (
              <li key={k}>
                <button
                  type="button"
                  aria-label={`${LABEL[k]} ${answer[k]}, 눌러서 고치기`}
                  onClick={() => setIndex(i)}
                  className="flex w-full cursor-pointer flex-col items-start gap-0.5 border-0 border-b border-solid border-[#E5E8EB] bg-transparent px-0 pt-3.5 pb-2.5 text-left"
                >
                  <span className="text-[13px] leading-[18px] font-medium text-mute">{LABEL[k]}</span>
                  <span className="w-full truncate text-[20px] leading-7 font-semibold tracking-[-0.4px] text-ink2">{answer[k]}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {fatal ? (
        <p role="alert" className="mx-5 mb-2 rounded-xl bg-danger-tint px-4 py-3 text-[14px] leading-5 font-semibold text-danger">
          {fatal}
        </p>
      ) : null}
      {isText ? (
        // With the keyboard up the button is a full-width bar resting on it; otherwise a rounded button at the bottom.
        <div className={`shrink-0 ${keyboard ? "" : "px-5 pb-[max(16px,env(safe-area-inset-bottom))]"}`}>
          <button type="submit" form="step-form" disabled={!valid[step]} className={`${primaryButtonClass} h-14 cursor-pointer text-[17px] ${keyboard ? "rounded-none" : "rounded-2xl"}`}>
            확인
          </button>
        </div>
      ) : step === "birth" ? (
        // The wheel always rests on a year, so the child confirms it rather than tapping one.
        <div className="shrink-0 px-5 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              setBirthYear(wheelYear);
              advance(index);
            }}
            className={`${primaryButtonClass} h-14 cursor-pointer rounded-2xl text-[17px]`}
          >
            확인
          </button>
        </div>
      ) : null}
    </main>
  );
}
