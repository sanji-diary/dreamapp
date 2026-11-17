"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { completeOnboardingAction, newPinAction } from "@/lib/kid/actions";
import { callName, formatPhone, phoneDigits } from "@/lib/kid/korean";
import type { OnboardingErrors, OnboardingField } from "@/lib/kid/onboarding";
import { PinDots, PinKeys } from "./PinPad";

/**
 * First-time setup, one question per screen. Nothing is saved until the last step,
 * so going back and changing an answer is always safe.
 */

type StepKey = "name" | "birth" | "gender" | "school" | "schoolClass" | "phone" | "guardianPhone" | "address" | "friend" | "pin" | "pin2";
const ALL_STEPS: StepKey[] = ["name", "birth", "gender", "school", "schoolClass", "phone", "guardianPhone", "address", "friend", "pin", "pin2"];
const PIN_STEPS: StepKey[] = ["pin", "pin2"];

export interface JoinPrefill {
  birthYear: number | null;
  gender: "" | "M" | "F";
  school: string;
  schoolClass: string;
  hasPhone: boolean;
  phone: string;
  guardianPhone: string;
  address: string;
  friendId: number | null;
  friendName: string;
}

interface Props {
  token: string;
  name: string;
  today: string;
  prefill: JoinPrefill;
  friends: { id: number; name: string }[];
  /** The child joined before and only needs a new PIN. */
  pinOnly?: boolean;
}

/** Keeps the screen exactly as tall as the visible area so the bottom button sits above the keyboard. */
function useVisibleHeight(): number | null {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setH(Math.round(vv.height));
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
  return h;
}

const questionClass = "m-0 text-[25px] leading-[34px] font-bold tracking-[-0.6px] whitespace-pre-line";
const hintClass = "m-0 mt-2 text-[15px] leading-[22px] text-sub";
const bigInput = `${inputClass} h-14 text-[20px] font-semibold tracking-[-0.3px]`;
const skipClass = "h-11 w-full cursor-pointer border-0 bg-transparent text-[15px] font-semibold text-sub underline underline-offset-2";
const choiceClass = "flex min-h-[60px] w-full cursor-pointer items-center rounded-[14px] border-[1.5px] px-4 text-left text-[17px] font-bold";

export function JoinWizard({ token, name, today, prefill, friends, pinOnly = false }: Props) {
  const steps = pinOnly ? PIN_STEPS : ALL_STEPS;
  const [index, setIndex] = useState(0);
  const [childName, setChildName] = useState(name);
  const [birthYear, setBirthYear] = useState<number | null>(prefill.birthYear);
  const [gender, setGender] = useState<"" | "M" | "F">(prefill.gender);
  const [school, setSchool] = useState(prefill.school);
  const classMatch = /^(\d)학년\s*(\d{1,2})반$/.exec(prefill.schoolClass.trim());
  const freeClass = prefill.schoolClass.trim() !== "" && !classMatch;
  const [grade, setGrade] = useState(classMatch ? classMatch[1] : "");
  const [ban, setBan] = useState(classMatch ? classMatch[2] : "");
  const [classText, setClassText] = useState(freeClass ? prefill.schoolClass : "");
  const [hasPhone, setHasPhone] = useState(prefill.hasPhone);
  const [phone, setPhone] = useState(formatPhone(prefill.phone));
  const [guardian, setGuardian] = useState(formatPhone(prefill.guardianPhone));
  const [address, setAddress] = useState(prefill.address);
  const [friendId, setFriendId] = useState<number | null>(prefill.friendId);
  const [friendText, setFriendText] = useState(prefill.friendId ? (friends.find((f) => f.id === prefill.friendId)?.name ?? "") : prefill.friendName);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [pinNote, setPinNote] = useState("");
  const [shake, setShake] = useState(0);
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [fatal, setFatal] = useState("");
  const [saving, setSaving] = useState(false);
  const height = useVisibleHeight();
  const step = steps[index];
  const savingRef = useRef(false);

  const schoolClass = freeClass ? classText.trim() : grade && ban ? `${grade}학년 ${Number(ban)}반` : "";
  const thisYear = Number(today.slice(0, 4));
  const yearChoices = [14, 13, 12, 11, 10, 9].map((n) => thisYear - n);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + delta)));
    },
    [steps.length],
  );
  const next = useCallback(() => go(1), [go]);
  const back = () => {
    // Leaving a PIN screen backwards starts the PIN over, so a half-typed one is never kept.
    if (step === "pin" || step === "pin2") {
      setPin("");
      setPin2("");
    }
    go(-1);
  };

  const valid: Record<StepKey, boolean> = {
    name: childName.trim().length >= 2,
    birth: birthYear !== null,
    gender: gender !== "",
    school: school.trim().length >= 2,
    schoolClass: schoolClass !== "",
    phone: phoneDigits(phone) !== null,
    guardianPhone: phoneDigits(guardian) !== null,
    address: address.trim().length >= 2,
    friend: friendId !== null || friendText.trim().length >= 2,
    pin: pin.length === 4,
    pin2: pin2.length === 4,
  };

  const submit = useCallback(
    async (finalPin2: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setFatal("");
      try {
        const r = pinOnly
          ? await newPinAction(token, pin, finalPin2)
          : await completeOnboardingAction(token, {
              name: childName,
              birthYear: birthYear ?? 0,
              gender,
              school,
              schoolClass,
              hasPhone,
              phone: hasPhone ? phone : "",
              guardianPhone: guardian,
              address,
              friendId,
              friendName: friendId ? "" : friendText,
              pin,
              pin2: finalPin2,
            });
        // Success redirects on the server; a returned value means something needs fixing.
        if (!r) return;
        if (r.reason === "invalid" && r.errors) {
          setErrors(r.errors);
          const first = steps.findIndex((s) => (s === "friend" ? r.errors?.friend : r.errors?.[s as OnboardingField]));
          setPin2("");
          if (first >= 0) setIndex(first);
          if (r.errors.pin || r.errors.pin2) setPin("");
        } else if (r.reason === "already") setFatal("이미 등록을 마친 카드예요. 카드를 다시 찍어 주세요.");
        else if (r.reason === "no_consent") setFatal("부모님 동의서가 먼저 필요해요. 선생님께 말해 주세요.");
        else setFatal("카드를 찾을 수 없어요. 선생님께 말해 주세요.");
      } catch {
        setFatal("연결이 잠시 끊겼어요. 다시 해 주세요.");
        setPin2("");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [pinOnly, token, pin, childName, birthYear, gender, school, schoolClass, hasPhone, phone, guardian, address, friendId, friendText, steps],
  );

  const onPinDigit = useCallback(
    (d: string) => {
      if (step === "pin") {
        if (pin.length >= 4) return;
        const v = pin + d;
        setPin(v);
        setPinNote("");
        if (v.length === 4) setTimeout(() => go(1), 180);
      } else if (step === "pin2") {
        if (pin2.length >= 4 || savingRef.current) return;
        const v = pin2 + d;
        setPin2(v);
        if (v.length < 4) return;
        if (v !== pin) {
          // Start over from the first PIN screen, gently.
          setTimeout(() => {
            setPin("");
            setPin2("");
            setPinNote("두 번 누른 숫자가 달랐어요. 처음부터 다시 만들어 볼까요?");
            setShake((n) => n + 1);
            go(-1);
          }, 250);
        } else void submit(v);
      }
    },
    [step, pin, pin2, go, submit],
  );
  const onPinDelete = useCallback(() => {
    if (step === "pin") setPin((p) => p.slice(0, -1));
    else if (step === "pin2") setPin2((p) => p.slice(0, -1));
  }, [step]);

  const filteredFriends = useMemo(() => {
    const q = friendText.trim();
    if (!q) return friends;
    return friends.filter((f) => f.name.includes(q));
  }, [friends, friendText]);

  const error = (k: OnboardingField) =>
    errors[k] ? (
      <p role="alert" className="m-0 mt-2 text-[14px] font-semibold text-danger">
        {errors[k]}
      </p>
    ) : null;
  const clearError = (k: OnboardingField) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  /** One text-like question: label + input, Enter moves on. */
  const field = (k: StepKey, label: string, input: ReactNode) => (
    <form
      id="step-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid[k]) next();
      }}
      className="mt-6 flex flex-col gap-2"
    >
      <label htmlFor={`f-${k}`} className="text-[14px] font-semibold text-ink2">
        {label}
      </label>
      {input}
    </form>
  );

  let question = "";
  let hint: ReactNode = null;
  let body: ReactNode = null;
  let skip: ReactNode = null;
  let showNext = true;
  const nextLabel = "다음";

  switch (step) {
    case "name":
      question = "이름을 알려 주세요";
      hint = "꿈의숲에 온 걸 환영해요. 몇 가지만 알려 주면 내 씨앗을 받을 수 있어요.";
      body = (
        <>
          {field(
            "name",
            "이름",
            <input
              id="f-name"
              autoFocus
              autoComplete="name"
              enterKeyHint="next"
              maxLength={10}
              placeholder="홍길동"
              value={childName}
              onChange={(e) => {
                setChildName(e.target.value);
                clearError("name");
              }}
              className={bigInput}
            />,
          )}
          {error("name")}
        </>
      );
      skip = <p className="m-0 pb-2 text-center text-[13px] leading-[19px] text-mute">선생님이 적어 둔 이름이에요. 틀렸으면 고쳐 주세요</p>;
      break;
    case "birth":
      question = `${callName(childName.trim() || name)}, 반가워!\n몇 년에 태어났어요?`;
      showNext = birthYear !== null;
      body = (
        <div role="group" aria-label="태어난 해" className="mt-6 grid grid-cols-2 gap-3">
          {yearChoices.map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={birthYear === y}
              onClick={() => {
                setBirthYear(y);
                clearError("birth");
                setTimeout(next, 160);
              }}
              className={`h-[68px] cursor-pointer rounded-2xl border-[1.5px] text-[20px] font-bold ${birthYear === y ? "border-navy bg-navy-tint text-navy" : "border-[#D1D6DB] bg-white text-ink"}`}
            >
              {y}년
            </button>
          ))}
          {error("birth")}
        </div>
      );
      break;
    case "gender":
      question = "남자예요, 여자예요?";
      showNext = gender !== "";
      body = (
        <div role="group" aria-label="성별" className="mt-6 grid grid-cols-2 gap-3">
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
              onClick={() => {
                setGender(v);
                clearError("gender");
                setTimeout(next, 160);
              }}
              className={`h-[120px] cursor-pointer rounded-2xl border-[1.5px] text-[22px] font-bold ${gender === v ? "border-navy bg-navy-tint text-navy" : "border-[#D1D6DB] bg-white text-ink"}`}
            >
              {label}
            </button>
          ))}
          {error("gender")}
        </div>
      );
      break;
    case "school":
      question = "어느 학교에 다녀요?";
      body = (
        <>
          {field(
            "school",
            "학교 이름",
            <input
              id="f-school"
              autoFocus
              autoComplete="off"
              enterKeyHint="next"
              maxLength={40}
              placeholder="예) 꿈의숲초등학교"
              value={school}
              onChange={(e) => {
                setSchool(e.target.value);
                clearError("school");
              }}
              className={bigInput}
            />,
          )}
          {error("school")}
        </>
      );
      break;
    case "schoolClass":
      question = "학교에서 몇 학년 몇 반이에요?";
      hint = "교회 반이 아니라 학교 반을 알려 주세요.";
      body = freeClass ? (
        <>
          {field("schoolClass", "학년과 반", <input id="f-schoolClass" autoFocus autoComplete="off" enterKeyHint="next" maxLength={20} value={classText} onChange={(e) => setClassText(e.target.value)} className={bigInput} />)}
          {error("schoolClass")}
        </>
      ) : (
        <form
          id="step-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid.schoolClass) next();
          }}
          className="mt-6 flex flex-col gap-5"
        >
          <div role="group" aria-label="학년" className="grid grid-cols-6 gap-2">
            {["1", "2", "3", "4", "5", "6"].map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={grade === g}
                aria-label={`${g}학년`}
                onClick={() => {
                  setGrade(g);
                  clearError("schoolClass");
                  document.getElementById("f-schoolClass")?.focus();
                }}
                className={`h-14 cursor-pointer rounded-xl border-[1.5px] text-[18px] font-bold ${grade === g ? "border-navy bg-navy-tint text-navy" : "border-[#D1D6DB] bg-white text-ink"}`}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="w-[84px] text-[20px] font-bold">{grade ? `${grade}학년` : "학년"}</span>
            <label htmlFor="f-schoolClass" className="sr-only">
              반
            </label>
            <input
              id="f-schoolClass"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="next"
              placeholder="3"
              value={ban}
              onChange={(e) => {
                setBan(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 2));
                clearError("schoolClass");
              }}
              className={`${bigInput.replace("w-full", "w-[88px]")} text-center`}
            />
            <span className="text-[20px] font-bold">반</span>
          </div>
          {error("schoolClass")}
        </form>
      );
      break;
    case "phone":
      question = "내 휴대폰 번호를 알려 주세요";
      hint = "선생님이 연락할 때만 써요.";
      body = (
        <>
          {field(
            "phone",
            "휴대폰 번호",
            <input
              id="f-phone"
              autoFocus
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              enterKeyHint="next"
              placeholder="010-1234-5678"
              value={phone}
              onChange={(e) => {
                setPhone(formatPhone(e.target.value));
                setHasPhone(true);
                clearError("phone");
              }}
              className={bigInput}
            />,
          )}
          {error("phone")}
        </>
      );
      skip = (
        <button
          type="button"
          className={skipClass}
          onClick={() => {
            setHasPhone(false);
            setPhone("");
            clearError("phone");
            next();
          }}
        >
          휴대폰이 없어요
        </button>
      );
      break;
    case "guardianPhone":
      question = "보호자 연락처를 알려 주세요";
      hint = "엄마, 아빠 또는 함께 사는 어른의 번호예요.";
      body = (
        <>
          {field(
            "guardianPhone",
            "보호자 휴대폰 번호",
            <input
              id="f-guardianPhone"
              autoFocus
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="next"
              placeholder="010-1234-5678"
              value={guardian}
              onChange={(e) => {
                setGuardian(formatPhone(e.target.value));
                clearError("guardianPhone");
              }}
              className={bigInput}
            />,
          )}
          {error("guardianPhone")}
        </>
      );
      skip = (
        <button
          type="button"
          className={skipClass}
          onClick={() => {
            setGuardian("");
            clearError("guardianPhone");
            next();
          }}
        >
          번호를 잘 모르겠어요
        </button>
      );
      break;
    case "address":
      question = "어디에 살아요?";
      hint = "동네와 아파트 이름 정도만 적어도 돼요.";
      body = (
        <>
          {field(
            "address",
            "집 주소",
            <input id="f-address" autoFocus autoComplete="street-address" enterKeyHint="next" maxLength={120} placeholder="예) 꿈동 숲아파트 101동" value={address} onChange={(e) => setAddress(e.target.value)} className={`${inputClass} h-14 text-[17px]`} />,
          )}
          {error("address")}
        </>
      );
      skip = (
        <button
          type="button"
          className={skipClass}
          onClick={() => {
            setAddress("");
            next();
          }}
        >
          나중에 할게요
        </button>
      );
      break;
    case "friend":
      question = "교회에서 가장 친한 친구는\n누구예요?";
      body = (
        <>
          {field(
            "friend",
            "친구 이름 찾기",
            <input
              id="f-friend"
              autoComplete="off"
              enterKeyHint="search"
              maxLength={20}
              placeholder="이름을 적어 보세요"
              value={friendText}
              onChange={(e) => {
                setFriendText(e.target.value);
                setFriendId(null);
                clearError("friend");
              }}
              className={`${inputClass} h-[52px] text-[17px]`}
            />,
          )}
          {errors.friend ? (
            <p role="alert" className="m-0 mt-2 text-[14px] font-semibold text-danger">
              {errors.friend}
            </p>
          ) : null}
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {filteredFriends.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  aria-pressed={friendId === f.id}
                  onClick={() => {
                    setFriendId(f.id);
                    setFriendText(f.name);
                    clearError("friend");
                    setTimeout(next, 160);
                  }}
                  className={`${choiceClass} ${friendId === f.id ? "border-navy bg-navy-tint text-navy" : "border-line bg-white text-ink2"}`}
                >
                  {f.name}
                </button>
              </li>
            ))}
            {friendId === null && friendText.trim().length >= 2 && !friends.some((f) => f.name === friendText.trim()) ? (
              <li>
                <button type="button" onClick={next} className={`${choiceClass} border-line bg-white text-ink2`}>
                  <span className="font-medium text-sub">목록에 없어요.&nbsp;</span>‘{friendText.trim()}’ 그대로 적기
                </button>
              </li>
            ) : null}
          </ul>
        </>
      );
      skip = (
        <button
          type="button"
          className={skipClass}
          onClick={() => {
            setFriendId(null);
            setFriendText("");
            next();
          }}
        >
          아직 없어요
        </button>
      );
      break;
    case "pin":
      question = pinOnly ? "새 비밀번호를 만들어요" : "마지막이에요!\n비밀번호를 만들어요";
      hint = "나만 아는 숫자 4개를 눌러 주세요. 다음에 들어올 때 필요해요.";
      showNext = false;
      body = (
        <div className="mt-8 flex flex-col items-center gap-4">
          <PinDots key={shake} count={pin.length} shake={shake > 0} />
          <p role="status" className="m-0 min-h-10 text-center text-[14px] leading-5 font-semibold text-danger">
            {errors.pin ?? pinNote}
          </p>
        </div>
      );
      break;
    case "pin2":
      question = "한 번 더 눌러 주세요";
      hint = "방금 만든 비밀번호와 똑같이 눌러요.";
      showNext = false;
      body = (
        <div className="mt-8 flex flex-col items-center gap-4">
          <PinDots count={pin2.length} />
          <p role="status" className={`m-0 min-h-10 text-center text-[14px] leading-5 font-semibold ${fatal ? "text-danger" : "text-navy"}`}>
            {saving ? "씨앗을 준비하고 있어요…" : (errors.pin2 ?? "")}
          </p>
        </div>
      );
      break;
  }

  const isPin = step === "pin" || step === "pin2";
  const progress = Math.round(((index + 1) / steps.length) * 100);

  return (
    <main className="flex flex-col overflow-hidden bg-white" style={{ height: height ?? "100dvh" }}>
      <div className="flex h-[52px] shrink-0 items-center gap-2 pt-[env(safe-area-inset-top)] pr-5 pl-2">
        {index > 0 ? (
          <button type="button" aria-label="이전 질문으로" disabled={saving} onClick={back} className="flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent text-ink">
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        ) : (
          <div className="h-11 w-3" />
        )}
        <div role="progressbar" aria-label="진행 정도" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 grow overflow-hidden rounded-full bg-[#E5E8EB]">
          <div className="h-1.5 rounded-full bg-bar transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <span aria-hidden="true" className="w-10 text-right text-[13px] font-semibold text-mute">
          {index + 1}/{steps.length}
        </span>
      </div>
      <div key={step} className="step-in flex min-h-0 grow flex-col overflow-y-auto px-5 pt-4 pb-3">
        <h1 className={questionClass}>{question}</h1>
        {hint ? <p className={hintClass}>{hint}</p> : null}
        {body}
      </div>
      {fatal ? (
        <p role="alert" className="mx-5 mb-2 rounded-xl bg-danger-tint px-4 py-3 text-[14px] leading-5 font-semibold text-danger">
          {fatal}
        </p>
      ) : null}
      {isPin ? (
        <div className="shrink-0 pb-[max(20px,env(safe-area-inset-bottom))]">
          <PinKeys onDigit={onPinDigit} onDelete={onPinDelete} disabled={saving} />
        </div>
      ) : (
        <div className="flex shrink-0 flex-col gap-1 px-5 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">
          {skip}
          {showNext ? (
            <button type={step === "birth" || step === "gender" ? "button" : "submit"} form="step-form" disabled={!valid[step]} onClick={step === "birth" || step === "gender" ? next : undefined} className={`${primaryButtonClass} h-14 cursor-pointer text-[17px]`}>
              {nextLabel}
            </button>
          ) : null}
        </div>
      )}
    </main>
  );
}
