"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { BULK_APPROVE_MAX, approveMany } from "./review";
import { approvalFilter, approvalsHref } from "./todo";
import { toInt } from "./util";

/**
 * Server actions of the "할 일" screens that are not in actions.ts.
 * Like the others, each identifies the teacher from the session cookie and leaves the rules to
 * the functions in this folder.
 */

/**
 * "고른 N건 한꺼번에 확인": approves the ticked submissions one by one. Every one of them is checked
 * again in approveMany (the teacher's class, still waiting), so a tampered or stale selection
 * approves only what this teacher may approve; the rest is counted in the message.
 */
export async function bulkApproveAction(formData: FormData) {
  const staff = await requireStaff();
  const back = approvalsHref(approvalFilter(formData.get("f")));
  const to = (key: "ok" | "error", message: string) => `${back}${back.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
  const ids = [...new Set(formData.getAll("ids").map(toInt))].filter((id): id is number => id !== null);
  if (ids.length === 0) redirect(to("error", "확인할 미션을 먼저 골라 주세요"));
  if (ids.length > BULK_APPROVE_MAX) redirect(to("error", `한 번에 ${BULK_APPROVE_MAX}건까지 확인할 수 있어요`));
  const r = await approveMany(staff, ids);
  const left = r.refused.length;
  if (r.approved.length === 0) redirect(to("error", "확인하지 못했어요. 이미 처리했거나 권한이 없는 미션이에요"));
  revalidatePath("/staff", "layout");
  redirect(to("ok", left > 0 ? `${r.approved.length}건을 확인했어요. ${left}건은 이미 처리했거나 권한이 없어서 그대로 두었어요` : `${r.approved.length}건을 한꺼번에 확인했어요`));
}
