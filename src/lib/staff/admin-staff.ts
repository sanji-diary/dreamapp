import "server-only";
import { ROLE_PRESETS } from "@/lib/authz";
import { db, one } from "@/lib/db";
import { newToken } from "@/lib/pin";
import type { Role, Staff } from "@/lib/types";
import { audit } from "./access";
import { clean, deny, fail, type Result } from "./util";

const ROLES: Role[] = ["basic", "homeroom", "head", "admin"];
export type Switches = Pick<Staff, "can_attendance" | "can_visits" | "can_approve" | "can_view_all" | "can_read_pastor_worries">;

export interface StaffRow extends Switches {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  /** Signed in with Kakao at least once. */
  linked: boolean;
  invite_code: string | null;
  class_ids: number[];
  class_names: string[];
}

export async function listStaff(staff: Staff): Promise<StaffRow[] | null> {
  if (staff.role !== "admin") return null;
  const rows = await db.query<Omit<StaffRow, "class_ids" | "class_names">>(
    `select id, name, role, active, (kakao_id is not null) as linked, invite_code, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries
       from staff order by active desc, case role when 'admin' then 0 when 'head' then 1 when 'homeroom' then 2 else 3 end, name, id`,
  );
  const sc = await db.query<{ staff_id: number; class_id: number; name: string }>("select sc.staff_id, sc.class_id, k.name from staff_classes sc join classes k on k.id = sc.class_id order by k.sort, k.id");
  return rows.map((r) => {
    const mine = sc.filter((x) => x.staff_id === r.id);
    return { ...r, class_ids: mine.map((x) => x.class_id), class_names: mine.map((x) => x.name) };
  });
}

export async function getStaffRow(staff: Staff, id: number): Promise<StaffRow | null> {
  return (await listStaff(staff))?.find((s) => s.id === id) ?? null;
}

/** Adds a teacher with an invite code. They sign in with Kakao through /staff/login?invite=<code>. */
export async function createStaff(staff: Staff, name: string, role: string): Promise<Result<{ id: number }>> {
  if (staff.role !== "admin") return deny;
  const n = clean(name, 20);
  if (!n) return fail("이름을 적어 주세요");
  if (!ROLES.includes(role as Role)) return fail("등급을 골라 주세요");
  const p = ROLE_PRESETS[role as Role];
  const rows = await db.query<{ id: number }>(
    `insert into staff (name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries, invite_code)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [n, role, p.can_attendance, p.can_visits, p.can_approve, p.can_view_all, p.can_read_pastor_worries, newToken()],
  );
  await audit(db, staff.id, "staff_create", "staff", rows[0].id, { role });
  return { ok: true, id: rows[0].id };
}

export interface StaffUpdate {
  name?: string;
  role: string;
  class_ids: number[];
  /** Left out: the preset of the role is used when the role changes, otherwise the switches stay as they are. */
  switches?: Partial<Switches>;
  active: boolean;
}

/**
 * Saves role, classes, switches and active state together.
 * Guards: an admin cannot demote or deactivate themselves, and the last active admin cannot be removed by anyone.
 */
export async function updateStaff(staff: Staff, id: number, input: StaffUpdate): Promise<Result> {
  if (staff.role !== "admin") return deny;
  if (!ROLES.includes(input.role as Role)) return fail("등급을 골라 주세요");
  const role = input.role as Role;
  return db.tx(async (q) => {
    const cur = await one<{ id: number; name: string; role: Role; active: boolean } & Switches>(
      q,
      "select id, name, role, active, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries from staff where id = $1",
      [id],
    );
    if (!cur) return fail("선생님을 찾을 수 없어요");
    const losesAdmin = cur.role === "admin" && cur.active && (role !== "admin" || !input.active);
    if (losesAdmin) {
      if (id === staff.id) return fail(role !== "admin" ? "내 관리자 권한은 스스로 내릴 수 없어요" : "내 계정은 스스로 끌 수 없어요");
      const others = await one<{ n: number }>(q, "select count(*)::int as n from staff where role = 'admin' and active and id <> $1", [id]);
      if ((others?.n ?? 0) < 1) return fail("관리자는 한 명 이상 있어야 해요");
    }
    const base: Switches = role !== cur.role ? ROLE_PRESETS[role] : cur;
    const sw: Switches = { ...base, ...(input.switches ?? {}) };
    const name = input.name === undefined ? cur.name : clean(input.name, 20) || cur.name;
    await q.query(
      `update staff set name=$2, role=$3, active=$4, can_attendance=$5, can_visits=$6, can_approve=$7, can_view_all=$8, can_read_pastor_worries=$9 where id=$1`,
      [id, name, role, input.active, sw.can_attendance === true, sw.can_visits === true, sw.can_approve === true, sw.can_view_all === true, sw.can_read_pastor_worries === true],
    );
    const classIds = [...new Set(input.class_ids.filter((n) => Number.isInteger(n)))];
    await q.query("delete from staff_classes where staff_id = $1", [id]);
    if (classIds.length > 0) {
      await q.query("insert into staff_classes (staff_id, class_id) select $1, k.id from classes k where k.id = any($2::int[])", [id, classIds]);
    }
    await audit(q, staff.id, "staff_update", "staff", id, { role, active: input.active, class_ids: classIds, switches: sw, role_before: cur.role, active_before: cur.active });
    return { ok: true } as const;
  });
}

export const SWITCH_KEYS = ["can_attendance", "can_visits", "can_approve", "can_view_all", "can_read_pastor_worries"] as const;
export type SwitchKey = (typeof SWITCH_KEYS)[number];

/**
 * One switch of one teacher, from the table on the teacher list. It goes through updateStaff with
 * the teacher's role, classes and sign-in state exactly as they are, so the same checks and the
 * same audit record apply and nothing else about the teacher changes.
 */
export async function setStaffSwitch(staff: Staff, id: number, key: string, on: boolean): Promise<Result> {
  if (staff.role !== "admin") return deny;
  if (!(SWITCH_KEYS as readonly string[]).includes(key)) return fail("바꿀 수 없는 항목이에요");
  const cur = await getStaffRow(staff, id);
  if (!cur) return fail("선생님을 찾을 수 없어요");
  return updateStaff(staff, id, { role: cur.role, class_ids: cur.class_ids, active: cur.active, switches: { [key as SwitchKey]: on === true } });
}

/** A fresh invite link, for a teacher who lost theirs or changed Kakao accounts. The old Kakao link is removed. */
export async function renewInvite(staff: Staff, id: number): Promise<Result> {
  if (staff.role !== "admin") return deny;
  if (id === staff.id) return fail("내 계정의 초대 링크는 다시 만들 수 없어요");
  const rows = await db.query("update staff set invite_code = $2, kakao_id = null where id = $1 returning id", [id, newToken()]);
  if (rows.length === 0) return fail("선생님을 찾을 수 없어요");
  await audit(db, staff.id, "staff_invite_renew", "staff", id);
  return { ok: true };
}
