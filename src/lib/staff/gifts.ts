import "server-only";
import { canApprove } from "@/lib/authz";
import { db, one } from "@/lib/db";
import { todayKst, weekStart } from "@/lib/time";
import type { Staff } from "@/lib/types";
import { approveScope, hasScope, scopeSql } from "./access";
import { clean, deny, fail, kstDate, type Result } from "./util";

/**
 * Gifts ("선물 주기"): a teacher or an admin gives drops, points or both to one child or several,
 * apart from any mission. For a child who helped, a memory verse said aloud, an event prize.
 *
 * - Who: teachers who may confirm missions (can_approve), for the children of the classes they see;
 *   admins for everyone.
 * - Only giving. Taking away is not a gift: an admin corrects points on "포인트 조정".
 * - Gift drops are apart from the weekly cap (only rows with ref_type 'mission' count toward it).
 * - Every gift needs a short reason. The child sees it on the tree screen, and it stays in the ledgers.
 * - One gift is one audit_log row; its id is the ref_id of every ledger row the gift wrote.
 */
export const GIFT_MAX_DROPS = 12;
export const GIFT_MAX_POINTS = 500;
const GIFT_MAX_CHILDREN = 300;

export interface GiftChild {
  id: number;
  name: string;
  class_id: number | null;
  class_name: string | null;
}

/** The children this teacher may give to, class by class. */
export async function giftChildren(staff: Staff): Promise<GiftChild[]> {
  const scope = approveScope(staff);
  if (!hasScope(scope)) return [];
  const cond = scopeSql(scope, "c.class_id", 1);
  return db.query<GiftChild>(
    `select c.id, c.name, c.class_id, k.name as class_name
       from children c left join classes k on k.id = c.class_id
      where c.active and ${cond.sql}
      order by k.sort nulls last, k.id nulls last, c.name, c.id`,
    cond.params,
  );
}

export interface GiftInput {
  childIds: number[];
  drops: number;
  points: number;
  reason: string;
}

export async function giveGift(staff: Staff, input: GiftInput): Promise<Result<{ count: number }>> {
  if (!hasScope(approveScope(staff))) return deny;
  const int = (n: number, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
  if (!int(input.drops, GIFT_MAX_DROPS)) return fail(`물방울은 한 번에 ${GIFT_MAX_DROPS}개까지 줄 수 있어요`);
  if (!int(input.points, GIFT_MAX_POINTS)) return fail(`포인트는 한 번에 ${GIFT_MAX_POINTS}P까지 줄 수 있어요`);
  if (input.drops === 0 && input.points === 0) return fail("물방울이나 포인트를 1 이상으로 정해 주세요");
  const reason = clean(input.reason, 40);
  if (!reason) return fail("이유를 적어 주세요");
  const ids = [...new Set(input.childIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return fail("받을 아이를 골라 주세요");
  if (ids.length > GIFT_MAX_CHILDREN) return fail("한 번에 너무 많은 아이를 골랐어요");
  const kids = await db.query<{ id: number; class_id: number | null }>("select id, class_id from children where id = any($1::int[]) and active", [ids]);
  if (kids.length !== ids.length) return fail("받을 아이를 다시 골라 주세요");
  if (!kids.every((k) => canApprove(staff, k.class_id))) return deny;

  const ws = weekStart(todayKst());
  await db.tx(async (q) => {
    const gift = await one<{ id: number }>(q, "insert into audit_log (staff_id, action, target_type, target_id, detail) values ($1,'gift','child',$2,$3) returning id", [
      staff.id,
      ids.length === 1 ? ids[0] : null,
      JSON.stringify({ child_ids: ids, drops: input.drops, points: input.points, reason }),
    ]);
    if (!gift) throw new Error("gift row was not written");
    for (const id of ids) {
      if (input.drops > 0) await q.query("insert into drop_ledger (child_id, delta, reason, ref_type, ref_id, week_start, staff_id) values ($1,$2,$3,'gift',$4,$5,$6)", [id, input.drops, reason, gift.id, ws, staff.id]);
      if (input.points > 0) await q.query("insert into point_ledger (child_id, delta, reason, ref_type, ref_id, staff_id) values ($1,$2,$3,'gift',$4,$5)", [id, input.points, reason, gift.id, staff.id]);
    }
  });
  return { ok: true, count: ids.length };
}

export interface GiftRow {
  id: number;
  /** "이서윤" or "이서윤 외 3명". */
  who: string;
  drops: number;
  points: number;
  reason: string;
  staff_name: string | null;
  on: string | null;
}

/** The latest gifts: every one for an admin, a teacher's own otherwise. */
export async function recentGifts(staff: Staff, limit = 15): Promise<GiftRow[]> {
  if (!hasScope(approveScope(staff))) return [];
  const mine = staff.role === "admin" ? "" : "and a.staff_id = $2";
  const rows = await db.query<{ id: number; detail: { child_ids?: number[]; drops?: number; points?: number; reason?: string }; staff_name: string | null; created_at: Date }>(
    `select a.id, a.detail, s.name as staff_name, a.created_at
       from audit_log a left join staff s on s.id = a.staff_id
      where a.action = 'gift' ${mine}
      order by a.id desc limit $1`,
    staff.role === "admin" ? [limit] : [limit, staff.id],
  );
  const first = rows.map((r) => r.detail.child_ids?.[0]).filter((id): id is number => typeof id === "number");
  const names = first.length > 0 ? await db.query<{ id: number; name: string }>("select id, name from children where id = any($1::int[])", [first]) : [];
  return rows.map((r) => {
    const ids = r.detail.child_ids ?? [];
    const name = names.find((n) => n.id === ids[0])?.name ?? "아이";
    return {
      id: r.id,
      who: ids.length > 1 ? `${name} 외 ${ids.length - 1}명` : name,
      drops: r.detail.drops ?? 0,
      points: r.detail.points ?? 0,
      reason: r.detail.reason ?? "",
      staff_name: r.staff_name,
      on: kstDate(r.created_at),
    };
  });
}
