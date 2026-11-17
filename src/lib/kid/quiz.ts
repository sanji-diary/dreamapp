import "server-only";
import { db, one } from "@/lib/db";
import { completeMission, missionsForChild } from "@/lib/game";
import { parseQuiz, scoreQuiz } from "@/lib/quiz";
import { todayKst } from "@/lib/time";

/**
 * Quiz attempts live in the database. The browser only ever says "for question N of my attempt
 * I pick choice K"; the server records that answer once, says whether it was right, and at the
 * end scores the answers it recorded itself. A score sent by the browser is never used.
 */

export type QuizFail = "not_found" | "already_done" | "stale" | "invalid";

function parseAnswers(raw: unknown): number[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : [];
}

async function openQuiz(childId: number, missionId: number, date: string) {
  const m = (await missionsForChild(db, childId, date)).find((x) => x.id === missionId);
  if (!m || m.kind !== "quiz") return { ok: false, reason: "not_found" } as const;
  if (m.state !== "available") return { ok: false, reason: "already_done" } as const;
  const quiz = parseQuiz(m.quiz);
  if (quiz.length === 0) return { ok: false, reason: "not_found" } as const;
  return { ok: true, quiz, pass: m.quiz_pass } as const;
}

export type StartQuizResult = { ok: true; attemptId: number; total: number } | { ok: false; reason: QuizFail };

/** Begins a fresh try. Earlier unfinished tries are dropped; trying again is always free. */
export async function startQuiz(childId: number, missionId: number, date: string = todayKst()): Promise<StartQuizResult> {
  if (!Number.isInteger(missionId)) return { ok: false, reason: "not_found" };
  const open = await openQuiz(childId, missionId, date);
  if (!open.ok) return open;
  await db.query("delete from quiz_attempts where child_id = $1 and mission_id = $2 and finished_at is null", [childId, missionId]);
  const rows = await db.query<{ id: number }>("insert into quiz_attempts (child_id, mission_id) values ($1,$2) returning id", [childId, missionId]);
  return { ok: true, attemptId: rows[0].id, total: open.quiz.length };
}

export type AnswerQuizResult =
  | {
      ok: true;
      right: boolean;
      /** Index of the right choice for the question just answered (only this one). */
      correct: number;
      done: boolean;
      /** Set when done. */
      result?: { right: number; total: number; need: number; passed: boolean; completionId: number | null };
    }
  | { ok: false; reason: QuizFail };

/**
 * Records one answer. `index` must be the next unanswered question, so an answer can never be
 * changed after the right one has been shown, and a repeated request cannot shift later answers.
 */
export async function answerQuiz(childId: number, attemptId: number, index: number, choice: number, date: string = todayKst()): Promise<AnswerQuizResult> {
  if (![attemptId, index, choice].every(Number.isInteger)) return { ok: false, reason: "invalid" };
  const attempt = await one<{ mission_id: number }>(db, "select mission_id from quiz_attempts where id = $1 and child_id = $2 and finished_at is null", [attemptId, childId]);
  if (!attempt) return { ok: false, reason: "stale" };
  const open = await openQuiz(childId, attempt.mission_id, date);
  if (!open.ok) return open;
  const { quiz, pass } = open;

  const saved = await db.tx(async (q) => {
    const row = await one<{ answers: unknown }>(q, "select answers from quiz_attempts where id = $1 and child_id = $2 and finished_at is null for update", [attemptId, childId]);
    if (!row) return { ok: false, reason: "stale" } as const;
    const answers = parseAnswers(row.answers);
    if (index !== answers.length || index >= quiz.length) return { ok: false, reason: "stale" } as const;
    if (choice < 0 || choice >= quiz[index].choices.length) return { ok: false, reason: "invalid" } as const;
    answers.push(choice);
    const done = answers.length >= quiz.length;
    await q.query("update quiz_attempts set answers = $2::jsonb, finished_at = case when $3::boolean then now() else null end where id = $1", [attemptId, JSON.stringify(answers), done]);
    return { ok: true, answers, done } as const;
  });
  if (!saved.ok) return saved;

  const right = choice === quiz[index].answer;
  if (!saved.done) return { ok: true, right, correct: quiz[index].answer, done: false };
  const score = scoreQuiz(quiz, saved.answers, pass);
  let completionId: number | null = null;
  if (score.passed) {
    const r = await completeMission(childId, attempt.mission_id, { verified: true, date });
    if (r.ok) completionId = r.completionId;
  }
  return { ok: true, right, correct: quiz[index].answer, done: true, result: { ...score, completionId } };
}
