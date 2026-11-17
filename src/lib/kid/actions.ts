"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { kidLogin, requireKid, setSession, signOut } from "@/lib/auth";
import { forgetCard, readCard, rememberCard } from "@/lib/card";
import { db } from "@/lib/db";
import { completeMission, dropBalance, ensureTree, harvestTree, missionsForChild, waterTree } from "@/lib/game";
import { saveUpload } from "@/lib/uploads";
import { addComment, deleteComment, reportComment, toggleLike } from "./feed";
import { saveNewPin, saveOnboarding, type OnboardingErrors, type OnboardingInput } from "./onboarding";
import { lockMinutes } from "./queries";
import { deleteWorry, submitWorry } from "./worries";

/**
 * Every action below finds the child from the session cookie (or, before sign-in, from the QR card).
 * A child id is never accepted from the browser.
 */

export type JoinActionResult = { ok: false; reason: "not_found" | "no_consent" | "already" | "invalid"; errors?: OnboardingErrors };

export async function completeOnboardingAction(token: string, input: OnboardingInput): Promise<JoinActionResult> {
  const r = await saveOnboarding(token, input);
  if (!r.ok) return r;
  await setSession("kid", r.childId);
  await rememberCard(token);
  redirect(`/join/${encodeURIComponent(token)}/done`);
}

export async function newPinAction(token: string, pin: string, pin2: string): Promise<JoinActionResult> {
  const r = await saveNewPin(token, pin, pin2);
  if (!r.ok) return r;
  await setSession("kid", r.childId);
  await rememberCard(token);
  redirect("/home");
}

export type LoginActionResult = { ok: false; reason: "no_card" | "wrong" | "locked"; left?: number; minutes?: number };

export async function loginAction(pin: string): Promise<LoginActionResult> {
  const token = await readCard();
  if (!token) return { ok: false, reason: "no_card" };
  const r = await kidLogin(token, typeof pin === "string" ? pin : "");
  if (r.ok) redirect("/home");
  if (r.reason === "wrong") return { ok: false, reason: "wrong", left: r.left };
  if (r.reason === "locked") return { ok: false, reason: "locked", minutes: Math.max(1, await lockMinutes(token)) };
  if (r.reason === "no_pin") redirect(`/join/${encodeURIComponent(token)}`);
  await forgetCard();
  return { ok: false, reason: "no_card" };
}

export async function forgetCardAction(): Promise<void> {
  await forgetCard();
  await signOut("kid");
  redirect("/login");
}

export async function signOutAction(): Promise<void> {
  await signOut("kid");
  redirect("/login");
}

export type WaterActionResult = { ok: boolean; reason?: "no_drops" | "ripe"; level: number; given: number; drops: number; leveledUp: boolean };

/** Gives one drop to the tree. Always answers with the true state so the screen can correct itself. */
export async function waterAction(): Promise<WaterActionResult> {
  const kid = await requireKid();
  const r = await waterTree(kid.id);
  if (r.ok) return { ok: true, level: r.tree.level, given: r.tree.given, drops: r.drops, leveledUp: r.leveledUp };
  const tree = await ensureTree(db, kid.id);
  return { ok: false, reason: r.reason, level: tree.level, given: tree.given, drops: await dropBalance(db, kid.id), leveledUp: false };
}

export type MissionActionResult = { ok: false; message: string };

const FAIL: Record<string, string> = {
  not_found: "지금은 할 수 없는 미션이에요",
  not_available: "지금은 할 수 없는 미션이에요",
  already_done: "이미 한 미션이에요",
  invalid: "내용을 다시 확인해 주세요",
};

/** Missions a child finishes alone. Other kinds need a photo, a teacher, or happen elsewhere in the app. */
const SELF_SERVE = ["self", "text", "verse"];

export async function completeMissionAction(missionId: number, text?: string): Promise<MissionActionResult> {
  const kid = await requireKid();
  const m = (await missionsForChild(db, kid.id)).find((x) => x.id === missionId);
  if (!m || !SELF_SERVE.includes(m.kind)) return { ok: false, message: FAIL.not_found };
  const body = typeof text === "string" ? text.slice(0, 2000) : undefined;
  if (m.kind === "verse" && (body ?? "").trim() !== (m.verse_text ?? "").trim()) return { ok: false, message: "말씀과 똑같이 써야 해요. 다시 확인해 볼까요?" };
  const r = await completeMission(kid.id, m.id, { text: m.kind === "self" ? undefined : body });
  if (!r.ok) return { ok: false, message: m.kind === "text" && r.reason === "invalid" ? "한 글자 이상 적어 주세요" : FAIL[r.reason] };
  revalidatePath("/missions");
  redirect(`/missions/done/${r.completionId}`);
}

export async function photoMissionAction(missionId: number, form: FormData): Promise<MissionActionResult> {
  const kid = await requireKid();
  const m = (await missionsForChild(db, kid.id)).find((x) => x.id === missionId);
  if (!m || m.kind !== "photo") return { ok: false, message: FAIL.not_found };
  if (m.state !== "available") return { ok: false, message: FAIL.already_done };
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "사진을 골라 주세요" };
  let url: string;
  try {
    url = await saveUpload(file, "mission", { childId: kid.id });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "사진을 올리지 못했어요" };
  }
  const r = await completeMission(kid.id, m.id, { photoUrl: url });
  if (!r.ok) return { ok: false, message: FAIL[r.reason] };
  revalidatePath("/missions");
  redirect(`/missions/done/${r.completionId}`);
}

const WORRY_FAIL: Record<string, string> = {
  empty: "이야기를 적어 주세요",
  too_long: "조금만 줄여서 적어 주세요",
  audience: "읽을 사람을 골라 주세요",
  no_reader: "지금은 그분께 보낼 수 없어요. 다른 분을 골라 주세요",
};

export async function worryAction(content: string, audience: string): Promise<MissionActionResult> {
  const kid = await requireKid();
  const r = await submitWorry(kid.id, content, audience);
  if (!r.ok) return { ok: false, message: WORRY_FAIL[r.reason] };
  revalidatePath("/missions");
  if (r.mission?.ok) redirect(`/missions/done/${r.mission.completionId}`);
  redirect("/me/worries?sent=1");
}

export async function deleteWorryAction(worryId: number): Promise<void> {
  const kid = await requireKid();
  await deleteWorry(kid.id, worryId);
  revalidatePath("/me/worries");
}

export async function harvestAction(): Promise<MissionActionResult> {
  const kid = await requireKid();
  const r = await harvestTree(kid.id);
  if (!r.ok) return { ok: false, message: "아직 열매가 다 익지 않았어요" };
  redirect("/harvest/done");
}

export async function likeAction(postId: number): Promise<{ liked: boolean; likes: number } | null> {
  const kid = await requireKid();
  return toggleLike(kid.id, postId);
}

const COMMENT_FAIL: Record<string, string> = {
  empty: "한마디 적어 주세요",
  too_long: "100자까지 쓸 수 있어요",
  rude: "고운 말로 다시 써 볼까요?",
  closed: "이 소식에는 댓글을 달 수 없어요",
  not_found: "소식을 찾을 수 없어요",
};

export type CommentActionResult = { ok: true; drops: number; points: number; missionDone: boolean } | { ok: false; message: string };

export async function commentAction(postId: number, body: string): Promise<CommentActionResult> {
  const kid = await requireKid();
  const r = await addComment(kid.id, postId, body);
  if (!r.ok) return { ok: false, message: COMMENT_FAIL[r.reason] };
  revalidatePath("/feed");
  const m = r.mission?.ok ? r.mission : null;
  return { ok: true, missionDone: m !== null, drops: m?.drops ?? 0, points: m?.points ?? 0 };
}

export async function deleteCommentAction(commentId: number): Promise<void> {
  const kid = await requireKid();
  await deleteComment(kid.id, commentId);
  revalidatePath("/feed");
}

export async function reportCommentAction(commentId: number): Promise<void> {
  const kid = await requireKid();
  await reportComment(kid.id, commentId);
  revalidatePath("/feed");
}
