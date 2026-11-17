"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { adjustTalents, closeEvent, createDraft, deleteDraft, lastPayment, payTalents, startEvent, undoLastPayment, updateDraft, type LastPayment, type PayResult, type UndoResult } from "@/lib/talents";
import { childByCard, festivalChild, type FestivalChild } from "./festival";
import { clean, fail, toInt, type Result } from "./util";

/**
 * Server actions for the 달란트 잔치. The admin ones run requireAdmin() first and the payment ones
 * requireStaff(); the functions they call check the role again and re-read every amount and
 * balance on the server. Ids and amounts from the browser are never trusted.
 */

const BASE = "/staff/admin/talents";

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function finish(r: Result, path: string, okMessage?: string, errorPath: string = path): never {
  if (!r.ok) redirect(withParam(errorPath, "error", r.error));
  revalidatePath("/staff", "layout");
  redirect(okMessage ? withParam(path, "ok", okMessage) : path);
}

/* ---------- admin ---------- */

export async function talentCreateAction(formData: FormData) {
  const staff = await requireAdmin();
  const r = await createDraft(staff, clean(formData.get("name"), 30), toInt(formData.get("rate")) ?? 0);
  if (!r.ok) finish(r, BASE);
  finish(r, `${BASE}/${r.id}`, "초안을 만들었어요. 아직 아이들에게는 아무것도 바뀌지 않아요");
}

export async function talentEventAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect(BASE);
  const here = `${BASE}/${id}`;
  const op = clean(formData.get("op"), 10);
  if (op === "save") finish(await updateDraft(staff, id, clean(formData.get("name"), 30), toInt(formData.get("rate")) ?? 0), here, "저장했어요");
  if (op === "delete") finish(await deleteDraft(staff, id), BASE, "초안을 지웠어요", here);
  if (op === "open") {
    // Save what is on the screen first, so the rate that opens is the rate the pastor was looking at.
    const saved = await updateDraft(staff, id, clean(formData.get("name"), 30), toInt(formData.get("rate")) ?? 0);
    if (!saved.ok) finish(saved, here);
    const r = await startEvent(staff, id);
    finish(r, here, r.ok ? `잔치를 시작했어요. ${r.children}명에게 달란트 ${r.talents}개를 나누었어요` : undefined);
  }
  if (op === "close") finish(await closeEvent(staff, id), here, "잔치를 마쳤어요. 이제 결제할 수 없어요");
  redirect(here);
}

export async function talentAdjustAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  const here = id === null ? BASE : `${BASE}/${id}`;
  const childId = toInt(formData.get("child_id"));
  if (childId === null) finish(fail("아이를 골라 주세요"), here);
  const sign = formData.get("sign") === "minus" ? -1 : 1;
  const amount = toInt(formData.get("amount"));
  finish(await adjustTalents(staff, childId, amount === null ? 0 : sign * Math.abs(amount), clean(formData.get("reason"), 60)), here, "달란트를 고쳤어요");
}

/* ---------- payment screen ---------- */

export async function festivalChildAction(childId: number): Promise<Result<{ child: FestivalChild }>> {
  const staff = await requireStaff();
  const child = typeof childId === "number" ? await festivalChild(staff, childId) : null;
  return child ? { ok: true, child } : fail("아이를 찾을 수 없어요. 잔치가 열려 있는지 확인해 주세요");
}

/** `scanned` is the text read from a child's QR card. The lookup happens on the server. */
export async function festivalScanAction(scanned: string): Promise<Result<{ child: FestivalChild }>> {
  const staff = await requireStaff();
  const child = await childByCard(staff, scanned);
  return child ? { ok: true, child } : fail("이 카드로는 아이를 찾을 수 없어요. 이름으로 찾아 주세요");
}

export async function festivalPayAction(childId: number, amount: number, note: string): Promise<PayResult> {
  const staff = await requireStaff();
  if (typeof childId !== "number" || typeof amount !== "number") return fail("잘못된 요청이에요");
  const r = await payTalents(staff, childId, amount, typeof note === "string" ? note : "");
  if (r.ok) revalidatePath("/staff", "layout");
  return r;
}

export async function festivalUndoAction(): Promise<UndoResult> {
  const staff = await requireStaff();
  const r = await undoLastPayment(staff);
  if (r.ok) revalidatePath("/staff", "layout");
  return r;
}

export async function festivalLastPaymentAction(): Promise<LastPayment | null> {
  return lastPayment(await requireStaff());
}
