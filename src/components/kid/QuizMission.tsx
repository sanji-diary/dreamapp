"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { BackLink, primaryButtonClass } from "@/components/ui";
import { answerQuizAction, startQuizAction } from "@/lib/kid/mission-actions";

/**
 * A quiz mission, one question per screen (same step style as the join wizard).
 * The questions arrive without their answers. Each tap is checked by the server, which answers
 * with right/wrong and the right choice for that one question, and at the end with the score
 * it worked out from the answers it recorded.
 */

interface Props {
  missionId: number;
  title: string;
  description: string;
  reward: string;
  rewardButton: string;
  questions: { q: string; choices: string[] }[];
  need: number;
}

type Checked = { picked: number; right: boolean; correct: number };
type Result = { right: number; total: number; need: number; passed: boolean; completionId: number | null };

const questionClass = "m-0 text-[25px] leading-[34px] font-bold tracking-[-0.6px] whitespace-pre-line";
const bottomClass = "flex shrink-0 flex-col gap-1 px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]";
const mainButton = `${primaryButtonClass} h-14 cursor-pointer text-[17px] disabled:cursor-default`;

function Mark({ ok }: { ok: boolean }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {ok ? <path d="M5 12.5l4.500 4.500L19 7.500" /> : <path d="M7 7l10 10M17 7L7 17" />}
    </svg>
  );
}

export function QuizMission({ missionId, title, description, reward, rewardButton, questions, need }: Props) {
  const total = questions.length;
  const [stage, setStage] = useState<"intro" | "play" | "result">("intro");
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [rightSoFar, setRightSoFar] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);

  const begin = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const r = await startQuizAction(missionId);
      if (!r.ok) setError(r.message);
      else {
        setAttemptId(r.attemptId);
        setIndex(0);
        setChecked(null);
        setResult(null);
        setRightSoFar(0);
        setStage("play");
      }
    } catch {
      setError("연결이 잠시 끊겼어요. 다시 눌러 주세요.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const pick = async (choice: number) => {
    if (busy.current || checked || attemptId === null) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const r = await answerQuizAction(attemptId, index, choice);
      if (!r.ok) {
        setError(r.message);
        if (r.restart) setStage("intro");
      } else {
        setChecked({ picked: choice, right: r.right, correct: r.correct });
        if (r.right) setRightSoFar((n) => n + 1);
        if (r.done && r.result) setResult(r.result);
      }
    } catch {
      setError("연결이 잠시 끊겼어요. 다시 눌러 주세요.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const next = () => {
    if (result) setStage("result");
    else {
      setIndex((i) => i + 1);
      setChecked(null);
    }
  };

  if (stage === "intro") {
    return (
      <main className="flex min-h-dvh flex-col bg-white">
        <div className="flex items-center justify-between pt-[max(8px,env(safe-area-inset-top))] pr-4 pl-2">
          <BackLink href="/missions" label="미션 목록으로 돌아가기" />
          {reward ? <div className="flex h-8 items-center rounded-2xl bg-navy-tint px-3 text-[13px] font-bold text-navy">{reward}</div> : null}
        </div>
        <div className="flex flex-col gap-1.5 px-5 pt-3">
          <h1 className="m-0 text-[24px] leading-[33px] font-bold tracking-[-0.5px] whitespace-pre-line">{title}</h1>
          {description ? <p className="m-0 text-[15px] leading-[22px] text-sub">{description}</p> : null}
        </div>
        <div className="mx-5 mt-5 flex items-center gap-3.5 rounded-2xl bg-fill px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src="/img/icon-bubble.webp" style={{ width: 52, height: 52 }} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="m-0 text-[16px] font-bold text-ink2">
              모두 {total}문제예요
            </p>
            <p className="m-0 text-[14px] leading-5 break-keep text-sub">
              {need >= total ? "모두 맞히면" : `${need}문제 이상 맞히면`} 미션 완료예요. 틀려도 괜찮아요. 몇 번이든 다시 할 수 있어요.
            </p>
          </div>
        </div>
        <div className="grow" />
        <div className="px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
          {error ? (
            <p role="alert" className="m-0 mb-2 text-center text-[14px] font-semibold text-danger">
              {error}
            </p>
          ) : null}
          <button type="button" disabled={pending} onClick={begin} className={`${primaryButtonClass} h-[54px] cursor-pointer rounded-[14px] text-[17px]`}>
            {pending ? "준비하는 중…" : "퀴즈 시작하기"}
          </button>
        </div>
      </main>
    );
  }

  if (stage === "result" && result) {
    const done = result.passed && result.completionId !== null;
    return (
      <main className="flex min-h-dvh flex-col bg-white">
        <div className="step-in flex grow flex-col items-center justify-center gap-2 px-6 text-center">
          <div aria-hidden="true" className="mb-3 flex h-[112px] w-[112px] items-center justify-center rounded-full bg-navy-tint">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={`/img/icon-${result.passed ? "badge" : "leaf"}.webp`} style={{ width: 72, height: 72 }} />
          </div>
          <p className="m-0 text-[14px] font-bold text-navy">{title}</p>
          <h1 className="m-0 text-[26px] leading-[35px] font-bold tracking-[-0.6px]">
            {result.total}문제 중 {result.right}문제를
            <br />
            맞혔어요
          </h1>
          <p className="m-0 text-[15px] leading-[22px] text-sub">
            {result.passed
              ? done
                ? "잘했어요! 퀴즈 미션을 마쳤어요."
                : "잘했어요! 이 미션은 이미 완료되어 있어요."
              : `${result.need}문제를 맞히면 완료예요. 다시 해 볼까요?`}
          </p>
        </div>
        <div className={bottomClass}>
          {error ? (
            <p role="alert" className="m-0 mb-1 text-center text-[14px] font-semibold text-danger">
              {error}
            </p>
          ) : null}
          {done ? (
            <Link href={`/missions/done/${result.completionId}`} className={`${primaryButtonClass} h-14 text-[17px] no-underline`}>
              {rewardButton}
            </Link>
          ) : result.passed ? (
            <Link href="/missions" className={`${primaryButtonClass} h-14 text-[17px] no-underline`}>
              미션 목록으로
            </Link>
          ) : (
            <>
              <button type="button" disabled={pending} onClick={begin} className={mainButton}>
                {pending ? "준비하는 중…" : "다시 해 보기"}
              </button>
              <Link href="/missions" className="flex h-11 items-center justify-center text-[15px] font-semibold text-sub underline underline-offset-2">
                나중에 할래요
              </Link>
            </>
          )}
        </div>
      </main>
    );
  }

  const question = questions[index];
  const progress = Math.round(((index + (checked ? 1 : 0)) / total) * 100);
  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="flex h-[52px] shrink-0 items-center gap-2 pt-[env(safe-area-inset-top)] pr-5 pl-2">
        <BackLink href="/missions" label="퀴즈 그만하고 미션 목록으로" />
        <div role="progressbar" aria-label="진행 정도" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 grow overflow-hidden rounded-full bg-[#E5E8EB]">
          <div className="h-1.5 rounded-full bg-bar transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <span className="w-10 text-right text-[13px] font-semibold text-mute">
          <span className="sr-only">{total}문제 중 </span>
          {index + 1}/{total}
        </span>
      </div>
      <div key={index} className="step-in flex min-h-0 grow flex-col px-5 pt-4 pb-3">
        <h1 className={questionClass}>{question.q}</h1>
        <ul className="m-0 mt-5 flex list-none flex-col gap-2.5 p-0">
          {question.choices.map((c, i) => {
            const isCorrect = checked !== null && checked.correct === i;
            const isWrongPick = checked !== null && checked.picked === i && !checked.right;
            const tone = isCorrect ? "border-navy bg-navy-tint text-navy" : isWrongPick ? "border-danger bg-danger-tint text-danger" : checked ? "border-line bg-white text-mute" : "border-line bg-white text-ink2";
            return (
              <li key={c}>
                <button
                  type="button"
                  disabled={pending || checked !== null}
                  onClick={() => pick(i)}
                  className={`flex min-h-[60px] w-full items-center justify-between gap-3 rounded-[14px] border-[1.5px] px-4 py-2.5 text-left text-[17px] leading-6 font-bold ${checked ? "cursor-default" : "cursor-pointer"} ${tone}`}
                >
                  <span>{c}</span>
                  {isCorrect ? (
                    <span className="flex shrink-0 items-center gap-1 text-[13px]">
                      <Mark ok />
                      정답
                    </span>
                  ) : isWrongPick ? (
                    <span className="flex shrink-0 items-center gap-1 text-[13px]">
                      <Mark ok={false} />
                      내가 고른 답
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div role="status" aria-live="polite" className="mt-5 min-h-[52px]">
          {checked ? (
            <div className={`rounded-2xl px-4 py-3 ${checked.right ? "bg-navy-tint" : "bg-fill"}`}>
              <p className={`m-0 text-[16px] font-bold ${checked.right ? "text-navy" : "text-ink2"}`}>{checked.right ? "맞았어요!" : "아쉬워요, 괜찮아요"}</p>
              <p className="m-0 mt-0.5 text-[14px] leading-5 text-sub">{checked.right ? `지금까지 ${rightSoFar}문제 맞혔어요.` : `정답: ‘${question.choices[checked.correct]}’`}</p>
            </div>
          ) : pending ? (
            <p className="m-0 text-center text-[14px] font-semibold text-navy">확인하는 중이에요</p>
          ) : null}
        </div>
      </div>
      <div className={bottomClass}>
        {error ? (
          <p role="alert" className="m-0 mb-1 text-center text-[14px] font-semibold text-danger">
            {error}
          </p>
        ) : null}
        {checked ? (
          <button type="button" onClick={next} className={mainButton}>
            {result ? "결과 보기" : "다음 문제"}
          </button>
        ) : (
          <p className="m-0 flex h-14 items-center justify-center text-[14px] text-mute">보기 하나를 골라 주세요</p>
        )}
      </div>
    </main>
  );
}
