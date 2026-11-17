"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { missionsForChild } from "@/lib/game";
import { findGame } from "@/games/registry";
import { issueGameToken, winGame } from "./game-proof";
import { answerQuiz, startQuiz, type QuizFail } from "./quiz";

/**
 * Actions for quiz and game missions. As everywhere on the child side, the child comes from the
 * session cookie; ids sent by the browser only say which mission or attempt of that child is meant.
 */

const QUIZ_FAIL: Record<QuizFail, string> = {
  not_found: "지금은 할 수 없는 퀴즈예요",
  already_done: "이미 한 미션이에요",
  stale: "퀴즈를 처음부터 다시 시작해 주세요",
  invalid: "보기를 다시 골라 주세요",
};

export type StartQuizActionResult = { ok: true; attemptId: number } | { ok: false; message: string };

export async function startQuizAction(missionId: number): Promise<StartQuizActionResult> {
  const kid = await requireKid();
  const r = await startQuiz(kid.id, Number(missionId));
  if (!r.ok) return { ok: false, message: QUIZ_FAIL[r.reason] };
  return { ok: true, attemptId: r.attemptId };
}

export type AnswerQuizActionResult =
  | { ok: true; right: boolean; correct: number; done: boolean; result?: { right: number; total: number; need: number; passed: boolean; completionId: number | null } }
  | { ok: false; message: string; restart: boolean };

export async function answerQuizAction(attemptId: number, index: number, choice: number): Promise<AnswerQuizActionResult> {
  const kid = await requireKid();
  const r = await answerQuiz(kid.id, Number(attemptId), Number(index), Number(choice));
  if (!r.ok) return { ok: false, message: QUIZ_FAIL[r.reason], restart: r.reason !== "invalid" };
  // No revalidatePath here: it would re-render the open quiz page as "already done" and wipe the
  // result screen. The mission list is rendered on every request, so it is fresh anyway.
  return r;
}

const GAME_FAIL: Record<string, string> = {
  not_found: "지금은 할 수 없는 미션이에요",
  not_available: "지금은 할 수 없는 미션이에요",
  already_done: "이미 한 미션이에요",
  invalid: "지금은 할 수 없는 미션이에요",
  bad: "게임을 처음부터 다시 해 주세요",
  too_fast: "게임이 너무 빨리 끝났어요. 한 번 더 해 볼까요?",
  expired: "시간이 많이 지났어요. 한 번 더 해 볼까요?",
};

/** `token` is a fresh start token when the game may simply be played again. */
export type WinGameActionResult = { ok: false; message: string; token: string | null };

async function freshToken(childId: number, missionId: number): Promise<string | null> {
  const m = (await missionsForChild(db, childId)).find((x) => x.id === missionId);
  if (!m || m.kind !== "game" || m.state !== "available" || !findGame(m.game_id)) return null;
  return issueGameToken(childId, m.id, m.game_id!);
}

export async function winGameAction(missionId: number, token: string): Promise<WinGameActionResult> {
  const kid = await requireKid();
  const id = Number(missionId);
  const r = await winGame(kid.id, id, token);
  if (!r.ok) return { ok: false, message: GAME_FAIL[r.reason] ?? GAME_FAIL.not_found, token: await freshToken(kid.id, id) };
  revalidatePath("/missions");
  redirect(`/missions/done/${r.completionId}`);
}

/** A new start token for "play again" (the old one may be past its 30 minutes). */
export async function gameTokenAction(missionId: number): Promise<string | null> {
  const kid = await requireKid();
  return freshToken(kid.id, Number(missionId));
}
