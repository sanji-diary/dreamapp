import type { QuizQuestion } from "./types";

/** Quiz rules shared by the admin form (validation) and the child screens (scoring). No database access here. */

export const QUIZ_MAX_QUESTIONS = 10;
export const QUIZ_MIN_CHOICES = 2;
export const QUIZ_MAX_CHOICES = 4;
export const QUIZ_QUESTION_LENGTH = 120;
export const QUIZ_CHOICE_LENGTH = 40;

function isQuestion(v: unknown): v is QuizQuestion {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.q === "string" &&
    Array.isArray(o.choices) &&
    o.choices.length >= QUIZ_MIN_CHOICES &&
    o.choices.length <= QUIZ_MAX_CHOICES &&
    o.choices.every((c) => typeof c === "string") &&
    Number.isInteger(o.answer) &&
    (o.answer as number) >= 0 &&
    (o.answer as number) < o.choices.length
  );
}

/** Reads the jsonb column (some drivers hand it back as text). Anything malformed becomes an empty quiz. */
export function parseQuiz(raw: unknown): QuizQuestion[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v) || !v.every(isQuestion)) return [];
  return v.map((x) => ({ q: x.q, choices: [...x.choices], answer: x.answer }));
}

/** Reads the JSON text posted by the admin form without judging it; validateQuiz does that and explains what is wrong. */
export function readQuizJson(raw: unknown): QuizQuestion[] | null {
  if (typeof raw !== "string" || raw === "" || raw.length > 20_000) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as QuizQuestion[]) : null;
  } catch {
    return null;
  }
}

export type QuizCheck = { ok: true; quiz: QuizQuestion[]; pass: number | null } | { ok: false; error: string };

/** Validates what the admin form sent. Messages are Korean and safe to show. */
export function validateQuiz(raw: unknown, pass: number | null): QuizCheck {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "퀴즈 문제를 하나 이상 만들어 주세요" };
  if (raw.length > QUIZ_MAX_QUESTIONS) return { ok: false, error: `문제는 ${QUIZ_MAX_QUESTIONS}개까지 만들 수 있어요` };
  const quiz: QuizQuestion[] = [];
  for (let i = 0; i < raw.length; i++) {
    const n = i + 1;
    const item = raw[i] as Record<string, unknown> | null;
    if (typeof item !== "object" || item === null) return { ok: false, error: `${n}번 문제를 다시 확인해 주세요` };
    const q = typeof item.q === "string" ? item.q.trim().slice(0, QUIZ_QUESTION_LENGTH) : "";
    if (!q) return { ok: false, error: `${n}번 문제의 질문을 적어 주세요` };
    if (!Array.isArray(item.choices) || item.choices.length < QUIZ_MIN_CHOICES || item.choices.length > QUIZ_MAX_CHOICES) {
      return { ok: false, error: `${n}번 문제의 보기는 ${QUIZ_MIN_CHOICES}개에서 ${QUIZ_MAX_CHOICES}개로 만들어 주세요` };
    }
    const choices = item.choices.map((c) => (typeof c === "string" ? c.trim().slice(0, QUIZ_CHOICE_LENGTH) : ""));
    if (choices.some((c) => c === "")) return { ok: false, error: `${n}번 문제에 비어 있는 보기가 있어요` };
    if (new Set(choices).size !== choices.length) return { ok: false, error: `${n}번 문제에 똑같은 보기가 있어요` };
    const answer = item.answer;
    if (typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 || answer >= choices.length) return { ok: false, error: `${n}번 문제의 정답을 골라 주세요` };
    quiz.push({ q, choices, answer });
  }
  if (pass !== null && (!Number.isInteger(pass) || pass < 1 || pass > quiz.length)) return { ok: false, error: `통과 기준은 1에서 ${quiz.length} 사이로 정해 주세요` };
  return { ok: true, quiz, pass: pass === quiz.length ? null : pass };
}

/** How many right answers finish the mission. */
export function passNeed(total: number, pass: number | null): number {
  if (pass === null || !Number.isInteger(pass)) return total;
  return Math.max(1, Math.min(total, pass));
}

/** Scores answers the server recorded. Missing answers count as wrong. */
export function scoreQuiz(quiz: QuizQuestion[], answers: number[], pass: number | null): { right: number; total: number; need: number; passed: boolean } {
  const right = quiz.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  const need = passNeed(quiz.length, pass);
  return { right, total: quiz.length, need, passed: quiz.length > 0 && answers.length >= quiz.length && right >= need };
}

/** The part of a quiz that is safe to send to the browser: no answers. */
export function publicQuiz(quiz: QuizQuestion[]): { q: string; choices: string[] }[] {
  return quiz.map((x) => ({ q: x.q, choices: x.choices }));
}
