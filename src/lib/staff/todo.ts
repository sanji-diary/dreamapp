import { addDays, todayKst } from "@/lib/time";
import type { WorryAudience } from "@/lib/types";
import { shortDate } from "./util";

/** Small pure helpers for the "할 일" screens (mission check, reported comments, worries). */

/** '방금', '12분 전', '2시간 전', '어제', then the date ('11월 12일'). Days are counted in Korea time. */
export function agoText(at: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const day = todayKst(at);
  const today = todayKst(now);
  if (day === today) return `${Math.floor(minutes / 60)}시간 전`;
  if (day === addDays(today, -1)) return "어제";
  return shortDate(day);
}

/**
 * Who the child sent a worry to, in the words shown above the conversation.
 * `to` is the part in bold. The rule itself is canReadWorry in lib/authz; this only describes it.
 */
export const WORRY_SENT_TO: Record<WorryAudience, { to: string; rest: string }> = {
  teacher: { to: "담임 선생님에게만", rest: "보낸 고민이에요. 다른 선생님과 전도사님에게는 보이지 않아요." },
  pastor: { to: "전도사님에게만", rest: "보낸 고민이에요. 담임 선생님과 다른 선생님에게는 보이지 않아요." },
  both: { to: "담임 선생님과 전도사님에게", rest: "보낸 고민이에요. 다른 선생님에게는 보이지 않아요." },
};

/** The id of the "한꺼번에 확인" form: the checkboxes on the mission cards belong to it through their `form` attribute. */
export const BULK_FORM_ID = "bulk-approve";

export type ApprovalFilter = "all" | "photo" | "text" | "mine";

/** Reads `?f=` on /staff/approvals. Anything else means no filter. */
export function approvalFilter(v: unknown): ApprovalFilter {
  return v === "photo" || v === "text" || v === "mine" ? v : "all";
}

/** The address of the mission list with a filter chip on. */
export function approvalsHref(f: ApprovalFilter = "all"): string {
  return f === "all" ? "/staff/approvals" : `/staff/approvals?f=${f}`;
}
