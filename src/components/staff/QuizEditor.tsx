"use client";

import { useRef, useState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { QUIZ_CHOICE_LENGTH, QUIZ_MAX_CHOICES, QUIZ_MAX_QUESTIONS, QUIZ_MIN_CHOICES, QUIZ_QUESTION_LENGTH } from "@/lib/quiz";
import type { QuizQuestion } from "@/lib/types";

/**
 * Quiz questions for a quiz mission: add, remove and reorder up to ten questions with two to four
 * choices each, mark the right one, and choose how many must be right. The whole quiz is posted as
 * JSON in the hidden "quiz" field and checked again on the server.
 */

type Draft = QuizQuestion & { key: number };

const smallButton = "flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-[10px] border-0 px-2.5 text-[13px] font-bold text-ink2 disabled:cursor-default disabled:text-faint";
const addButton = "flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[#B0B8C1] bg-transparent text-[14px] font-bold text-sub";

const blank = (key: number): Draft => ({ key, q: "", choices: ["", ""], answer: 0 });

export function QuizEditor({ initial, initialPass }: { initial: QuizQuestion[] | null; initialPass: number | null }) {
  const nextKey = useRef((initial?.length ?? 0) + 1);
  const [list, setList] = useState<Draft[]>(() => (initial && initial.length > 0 ? initial.map((x, i) => ({ ...x, choices: [...x.choices], key: i + 1 })) : [blank(0)]));
  const [pass, setPass] = useState<number | null>(initialPass);

  const change = (key: number, fn: (d: Draft) => Draft) => setList((l) => l.map((d) => (d.key === key ? fn(d) : d)));
  const move = (i: number, by: number) =>
    setList((l) => {
      const j = i + by;
      if (j < 0 || j >= l.length) return l;
      const copy = [...l];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const total = list.length;
  const shownPass = pass !== null && pass < total ? pass : total;

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-fill p-3">
      <input type="hidden" name="quiz" value={JSON.stringify(list.map(({ q, choices, answer }) => ({ q, choices, answer })))} />
      <input type="hidden" name="quiz_pass" value={shownPass >= total ? "" : shownPass} />
      <p className="m-0 text-[13px] leading-[19px] text-sub">아이는 한 화면에 한 문제씩 풀어요. 틀려도 몇 번이든 다시 할 수 있어요.</p>
      {list.map((d, i) => (
        <fieldset key={d.key} className="m-0 flex min-w-0 flex-col gap-2 rounded-xl border-0 bg-white p-3">
          <legend className="sr-only">문제 {i + 1}</legend>
          <div className="flex items-center gap-1">
            <span aria-hidden="true" className="grow text-[15px] font-bold text-ink2">
              문제 {i + 1}
            </span>
            <button type="button" aria-label={`문제 ${i + 1} 위로 옮기기`} disabled={i === 0} onClick={() => move(i, -1)} className={`${smallButton} bg-fill`}>
              ▲
            </button>
            <button type="button" aria-label={`문제 ${i + 1} 아래로 옮기기`} disabled={i === total - 1} onClick={() => move(i, 1)} className={`${smallButton} bg-fill`}>
              ▼
            </button>
            <button type="button" aria-label={`문제 ${i + 1} 지우기`} disabled={total <= 1} onClick={() => setList((l) => l.filter((x) => x.key !== d.key))} className={`${smallButton} bg-fill`}>
              지우기
            </button>
          </div>
          <label htmlFor={`quiz-q-${d.key}`} className="sr-only">
            문제 {i + 1} 질문
          </label>
          <textarea
            id={`quiz-q-${d.key}`}
            required
            maxLength={QUIZ_QUESTION_LENGTH}
            value={d.q}
            onChange={(e) => change(d.key, (x) => ({ ...x, q: e.target.value }))}
            placeholder="예: 다윗이 골리앗과 싸울 때 쓴 것은?"
            className="min-h-[64px] w-full rounded-xl border-[1.5px] border-[#D1D6DB] bg-white px-3.5 py-2.5 text-[16px] leading-6 text-ink outline-none focus:border-navy"
          />
          <p className="m-0 text-[12px] text-mute">보기를 적고, 정답인 보기 앞의 동그라미를 눌러 주세요.</p>
          {d.choices.map((c, ci) => (
            <div key={ci} className="flex items-center gap-1">
              <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                <input type="radio" name={`quiz-answer-${d.key}`} checked={d.answer === ci} onChange={() => change(d.key, (x) => ({ ...x, answer: ci }))} className="peer sr-only" />
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#B0B8C1] bg-white text-[13px] font-bold text-white peer-checked:border-navy peer-checked:bg-navy peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy">
                  ✓
                </span>
                <span className="sr-only">
                  문제 {i + 1}의 보기 {ci + 1}을 정답으로
                </span>
              </label>
              <input
                aria-label={`문제 ${i + 1} 보기 ${ci + 1}`}
                required
                maxLength={QUIZ_CHOICE_LENGTH}
                value={c}
                onChange={(e) => change(d.key, (x) => ({ ...x, choices: x.choices.map((v, k) => (k === ci ? e.target.value : v)) }))}
                placeholder={`보기 ${ci + 1}`}
                className={`${inputClass} h-11 min-w-0 grow`}
              />
              {d.answer === ci ? <span className="shrink-0 px-1 text-[12px] font-bold text-navy">정답</span> : null}
              {d.choices.length > QUIZ_MIN_CHOICES ? (
                <button
                  type="button"
                  aria-label={`문제 ${i + 1} 보기 ${ci + 1} 지우기`}
                  onClick={() => change(d.key, (x) => ({ ...x, choices: x.choices.filter((_, k) => k !== ci), answer: x.answer === ci ? 0 : x.answer > ci ? x.answer - 1 : x.answer }))}
                  className={`${smallButton} shrink-0 bg-fill`}
                >
                  빼기
                </button>
              ) : null}
            </div>
          ))}
          {d.choices.length < QUIZ_MAX_CHOICES ? (
            <button type="button" onClick={() => change(d.key, (x) => ({ ...x, choices: [...x.choices, ""] }))} className={addButton}>
              보기 더하기
            </button>
          ) : null}
        </fieldset>
      ))}
      {total < QUIZ_MAX_QUESTIONS ? (
        <button
          type="button"
          onClick={() => {
            const key = nextKey.current++;
            setList((l) => [...l, blank(key)]);
          }}
          className={addButton}
        >
          문제 더하기 ({total}/{QUIZ_MAX_QUESTIONS})
        </button>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="quiz-pass" className={labelClass}>
          몇 문제를 맞히면 완료인가요
        </label>
        <select id="quiz-pass" value={shownPass} onChange={(e) => setPass(Number(e.target.value))} className={inputClass}>
          {Array.from({ length: total }, (_, k) => k + 1).map((n) => (
            <option key={n} value={n}>
              {n === total ? `${total}문제 모두` : `${total}문제 중 ${n}문제 이상`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
