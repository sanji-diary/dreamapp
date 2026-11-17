import "server-only";
import { canApprove, canReadVisits, canSeeChildDetail, canWriteVisits, detailScope } from "@/lib/authz";
import { db, one } from "@/lib/db";
import { completeMission, dropBalance, getSettings, missionsForChild, pointBalance, type MissionForChild } from "@/lib/game";
import { newToken } from "@/lib/pin";
import { addDays, ageOn, todayKst, weekStart } from "@/lib/time";
import type { Staff } from "@/lib/types";
import { audit, scopeSql } from "./access";
import { streakFrom, type Streak } from "./attendance";
import { clean, cleanOrNull, deny, fail, isDate, kstDate, type Result } from "./util";

/* ---------- list ---------- */

export interface ChildListItem {
  id: number;
  name: string;
  photo_url: string | null;
  class_id: number | null;
  class_name: string | null;
  active: boolean;
  /** True when this teacher may open the detail page. */
  canOpen: boolean;
  /** Only filled for children the teacher may see in detail. */
  noPhone: boolean;
  notOnboarded: boolean;
}

/** Everyone sees names, photos and classes. Nothing else leaves this function for children outside the teacher's scope. */
export async function listChildren(staff: Staff, opts: { q?: string; classId?: number | null; includeInactive?: boolean } = {}): Promise<ChildListItem[]> {
  const includeInactive = opts.includeInactive === true && staff.role === "admin";
  const rows = await db.query<{ id: number; name: string; photo_url: string | null; class_id: number | null; class_name: string | null; active: boolean; has_phone: boolean; onboarded: boolean }>(
    `select c.id, c.name, c.photo_url, c.class_id, k.name as class_name, c.active, c.has_phone, (c.onboarded_at is not null) as onboarded
       from children c left join classes k on k.id = c.class_id
      where ($1::boolean or c.active) and ($2 = '' or c.name ilike '%' || $2 || '%') and ($3::int is null or c.class_id = $3)
      order by k.sort nulls last, k.id, c.name, c.id`,
    [includeInactive, clean(opts.q, 30).replace(/[%_\\]/g, ""), opts.classId ?? null],
  );
  return rows.map((r) => {
    const canOpen = canSeeChildDetail(staff, r.class_id);
    return {
      id: r.id,
      name: r.name,
      photo_url: r.photo_url,
      class_id: r.class_id,
      class_name: r.class_name,
      active: r.active,
      canOpen,
      noPhone: canOpen && !r.has_phone,
      notOnboarded: canOpen && !r.onboarded,
    };
  });
}

/* ---------- detail ---------- */

export interface VisitRow {
  id: number;
  visited_on: string;
  method: "in_person" | "phone" | "message";
  content: string;
  staff_id: number | null;
  staff_name: string | null;
  canEdit: boolean;
}

export interface ChildDetail {
  id: number;
  name: string;
  class_id: number | null;
  class_name: string | null;
  birth_date: string | null;
  birth_year: number | null;
  age: number | null;
  gender: "M" | "F" | null;
  school: string | null;
  school_class: string | null;
  address: string | null;
  phone: string | null;
  guardian_phone: string | null;
  photo_url: string | null;
  best_friend_id: number | null;
  best_friend: string | null;
  best_friend_name: string | null;
  has_phone: boolean;
  has_pin: boolean;
  onboarded_on: string | null;
  consent_on: string | null;
  photo_consent: boolean;
  memo: string | null;
  active: boolean;
  attendance: { date: string; status: string | null }[];
  attended: number;
  streak: Streak;
  tree: { level: number; given: number; need: number; harvested: number };
  drops: number;
  points: number;
  completions: { id: number; title: string; status: string; done_on: string; by_staff: string | null }[];
  /** null when this teacher may not read visit notes. */
  visits: VisitRow[] | null;
  can: { edit: boolean; writeVisits: boolean; proxy: boolean; resetPin: boolean; admin: boolean };
}

function canEditChild(staff: Staff, classId: number | null): boolean {
  return canSeeChildDetail(staff, classId);
}

/** Admins, and homeroom teachers for their own class. */
export function canResetPin(staff: Staff, classId: number | null): boolean {
  if (staff.role === "admin") return true;
  return staff.role === "homeroom" && classId !== null && staff.class_ids.includes(classId);
}

/** Returns null when the child does not exist or the teacher may not see details. Callers show "not found" either way. */
export async function getChildDetail(staff: Staff, id: number): Promise<ChildDetail | null> {
  const c = await one<{
    id: number; name: string; class_id: number | null; class_name: string | null; birth_date: string | null; birth_year: number | null; gender: "M" | "F" | null;
    school: string | null; school_class: string | null; address: string | null; phone: string | null; guardian_phone: string | null;
    photo_url: string | null; best_friend_id: number | null; best_friend_name: string | null; friend_name: string | null; friend_class: number | null;
    has_phone: boolean; has_pin: boolean; onboarded_at: Date | null; consent_on: string | null; photo_consent: boolean; memo: string | null; active: boolean;
  }>(
    db,
    `select c.id, c.name, c.class_id, k.name as class_name, c.birth_date, c.birth_year, c.gender, c.school, c.school_class, c.address, c.phone, c.guardian_phone,
            c.photo_url, c.best_friend_id, c.best_friend_name, f.name as friend_name, f.class_id as friend_class,
            c.has_phone, (c.pin_hash is not null) as has_pin, c.onboarded_at, c.consent_on, c.photo_consent, c.memo, c.active
       from children c left join classes k on k.id = c.class_id left join children f on f.id = c.best_friend_id
      where c.id = $1`,
    [id],
  );
  if (!c || !canSeeChildDetail(staff, c.class_id)) return null;
  if (!c.active && staff.role !== "admin") return null;

  const today = todayKst();
  const ws = weekStart(today);
  const sundays = Array.from({ length: 8 }, (_, i) => addDays(ws, -7 * i));
  const att = await db.query<{ date: string; status: string }>("select date, status from attendance where child_id = $1 and date >= $2", [id, addDays(ws, -7 * 60)]);
  const byDate = new Map(att.map((a) => [a.date, a.status]));
  const attendance = sundays.map((d) => ({ date: d, status: byDate.get(d) ?? null }));
  const streak = streakFrom(byDate, byDate.has(ws) ? ws : addDays(ws, -7));

  const settings = await getSettings(db);
  const tree = await one<{ level: number; given: number }>(db, "select level, given from trees where child_id = $1 and harvested_at is null", [id]);
  const harvested = await one<{ n: number }>(db, "select count(*)::int as n from trees where child_id = $1 and harvested_at is not null", [id]);
  const level = tree?.level ?? 1;

  const completions = await db.query<{ id: number; title: string; status: string; done_on: string; by_staff: string | null }>(
    `select mc.id, m.title, mc.status, mc.done_on, s.name as by_staff
       from mission_completions mc join missions m on m.id = mc.mission_id left join staff s on s.id = mc.entered_by_staff_id
      where mc.child_id = $1 order by mc.done_on desc, mc.id desc limit 10`,
    [id],
  );

  let visits: VisitRow[] | null = null;
  if (canReadVisits(staff, c.class_id)) {
    const rows = await db.query<Omit<VisitRow, "canEdit">>(
      `select v.id, v.visited_on, v.method, v.content, v.staff_id, s.name as staff_name
         from visits v left join staff s on s.id = v.staff_id where v.child_id = $1 order by v.visited_on desc, v.id desc`,
      [id],
    );
    const write = canWriteVisits(staff, c.class_id);
    visits = rows.map((v) => ({ ...v, canEdit: write && (staff.role === "admin" || v.staff_id === staff.id) }));
  }

  return {
    id: c.id,
    name: c.name,
    class_id: c.class_id,
    class_name: c.class_name,
    birth_date: c.birth_date,
    birth_year: c.birth_year,
    // Children enter only their birth year when they join; use it until a teacher adds the full date.
    age: ageOn(c.birth_date, today) ?? (c.birth_year ? Number(today.slice(0, 4)) - c.birth_year : null),
    gender: c.gender,
    school: c.school,
    school_class: c.school_class,
    address: c.address,
    phone: c.phone,
    guardian_phone: c.guardian_phone,
    photo_url: c.photo_url,
    best_friend_id: c.best_friend_id,
    best_friend: c.friend_name ? `${c.friend_name}${c.friend_class !== null && c.friend_class === c.class_id ? " (같은 반)" : ""}` : c.best_friend_name,
    best_friend_name: c.best_friend_name,
    has_phone: c.has_phone,
    has_pin: c.has_pin,
    onboarded_on: kstDate(c.onboarded_at),
    consent_on: c.consent_on,
    photo_consent: c.photo_consent,
    memo: c.memo,
    active: c.active,
    attendance,
    attended: attendance.filter((a) => a.status === "present" || a.status === "late").length,
    streak,
    tree: { level, given: tree?.given ?? 0, need: settings.levelNeeds[level - 1] ?? 0, harvested: harvested?.n ?? 0 },
    drops: await dropBalance(db, id),
    points: await pointBalance(db, id),
    completions,
    visits,
    can: {
      edit: canEditChild(staff, c.class_id),
      writeVisits: canWriteVisits(staff, c.class_id),
      proxy: canApprove(staff, c.class_id),
      resetPin: canResetPin(staff, c.class_id),
      admin: staff.role === "admin",
    },
  };
}

/* ---------- create / edit ---------- */

export interface ChildInput {
  name: string;
  class_id?: number | null;
  birth_date?: string | null;
  gender?: string | null;
  school?: string | null;
  school_class?: string | null;
  address?: string | null;
  phone?: string | null;
  guardian_phone?: string | null;
  best_friend_id?: number | null;
  best_friend_name?: string | null;
  has_phone?: boolean;
  memo?: string | null;
  photo_url?: string | null;
}

async function normalize(input: ChildInput, selfId: number | null): Promise<Result<{ v: Required<Omit<ChildInput, "class_id" | "photo_url">> }>> {
  const name = clean(input.name, 20);
  if (!name) return fail("이름을 적어 주세요");
  const birth = cleanOrNull(input.birth_date, 10);
  if (birth !== null && (!isDate(birth) || birth > todayKst())) return fail("생년월일이 올바르지 않아요");
  const gender = input.gender === "M" || input.gender === "F" ? input.gender : null;
  let friendId = input.best_friend_id ?? null;
  if (friendId !== null) {
    const f = await one<{ id: number }>(db, "select id from children where id = $1 and active", [friendId]);
    if (!f || friendId === selfId) friendId = null;
  }
  return {
    ok: true,
    v: {
      name,
      birth_date: birth,
      gender,
      school: cleanOrNull(input.school, 40),
      school_class: cleanOrNull(input.school_class, 20),
      address: cleanOrNull(input.address, 120),
      phone: cleanOrNull(input.phone, 20),
      guardian_phone: cleanOrNull(input.guardian_phone, 20),
      best_friend_id: friendId,
      best_friend_name: friendId !== null ? null : cleanOrNull(input.best_friend_name, 20),
      has_phone: input.has_phone !== false,
      memo: cleanOrNull(input.memo, 2000),
    },
  };
}

async function classExists(id: number): Promise<boolean> {
  return (await one(db, "select 1 as x from classes where id = $1 and not archived", [id])) !== null;
}

export async function createChild(staff: Staff, input: ChildInput): Promise<Result<{ id: number }>> {
  if (staff.role !== "admin") return deny;
  const n = await normalize(input, null);
  if (!n.ok) return n;
  const classId = input.class_id ?? null;
  if (classId !== null && !(await classExists(classId))) return fail("반을 찾을 수 없어요");
  const v = n.v;
  return db.tx(async (q) => {
    const rows = await q.query<{ id: number }>(
      `insert into children (name, class_id, birth_date, gender, school, school_class, address, phone, guardian_phone, best_friend_id, best_friend_name, has_phone, memo, photo_url, qr_token)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
      [v.name, classId, v.birth_date, v.gender, v.school, v.school_class, v.address, v.phone, v.guardian_phone, v.best_friend_id, v.best_friend_name, v.has_phone, v.memo, input.photo_url ?? null, newToken()],
    );
    await q.query("insert into trees (child_id, seq) values ($1, 1)", [rows[0].id]);
    await audit(q, staff.id, "child_create", "child", rows[0].id);
    return { ok: true, id: rows[0].id } as const;
  });
}

/** Teachers with detail access edit the profile. Only admins move a child to another class. */
export async function updateChild(staff: Staff, id: number, input: ChildInput): Promise<Result> {
  const cur = await one<{ class_id: number | null; active: boolean }>(db, "select class_id, active from children where id = $1", [id]);
  if (!cur || !canEditChild(staff, cur.class_id) || (!cur.active && staff.role !== "admin")) return deny;
  const n = await normalize(input, id);
  if (!n.ok) return n;
  let classId = cur.class_id;
  if (staff.role === "admin" && input.class_id !== undefined && input.class_id !== cur.class_id) {
    if (input.class_id !== null && !(await classExists(input.class_id))) return fail("반을 찾을 수 없어요");
    classId = input.class_id;
  }
  const v = n.v;
  await db.tx(async (q) => {
    await q.query(
      `update children set name=$2, class_id=$3, birth_date=$4, birth_year=coalesce(extract(year from $4::date)::int, birth_year), gender=$5, school=$6, school_class=$7, address=$8, phone=$9, guardian_phone=$10,
              best_friend_id=$11, best_friend_name=$12, has_phone=$13, memo=$14, photo_url=coalesce($15, photo_url) where id=$1`,
      [id, v.name, classId, v.birth_date, v.gender, v.school, v.school_class, v.address, v.phone, v.guardian_phone, v.best_friend_id, v.best_friend_name, v.has_phone, v.memo, input.photo_url ?? null],
    );
    if (classId !== cur.class_id) await audit(q, staff.id, "child_class_change", "child", id, { from: cur.class_id, to: classId });
  });
  return { ok: true };
}

/* ---------- admin and PIN operations (each writes the audit log) ---------- */

export async function setChildActive(staff: Staff, id: number, active: boolean): Promise<Result> {
  if (staff.role !== "admin") return deny;
  const rows = await db.query("update children set active = $2 where id = $1 returning id", [id, active]);
  if (rows.length === 0) return fail("아이를 찾을 수 없어요");
  await audit(db, staff.id, active ? "child_reactivate" : "child_deactivate", "child", id);
  return { ok: true };
}

export async function setConsent(staff: Staff, id: number, consentOn: string | null, photoConsent: boolean): Promise<Result> {
  if (staff.role !== "admin") return deny;
  if (consentOn !== null && (!isDate(consentOn) || consentOn > todayKst())) return fail("동의 날짜가 올바르지 않아요");
  const before = await one<{ consent_on: string | null; photo_consent: boolean }>(db, "select consent_on, photo_consent from children where id = $1", [id]);
  if (!before) return fail("아이를 찾을 수 없어요");
  await db.query("update children set consent_on = $2, photo_consent = $3 where id = $1", [id, consentOn, photoConsent]);
  await audit(db, staff.id, "child_consent", "child", id, { before, after: { consent_on: consentOn, photo_consent: photoConsent } });
  return { ok: true };
}

/** A new card: the old QR stops working and the PIN is cleared. onboarded_at stays so the tree and records carry on. */
export async function reissueCard(staff: Staff, id: number): Promise<Result> {
  if (staff.role !== "admin") return deny;
  const rows = await db.query("update children set qr_token = $2, pin_hash = null, pin_fail_count = 0, pin_locked_until = null where id = $1 returning id", [id, newToken()]);
  if (rows.length === 0) return fail("아이를 찾을 수 없어요");
  await audit(db, staff.id, "child_card_reissue", "child", id);
  return { ok: true };
}

/** Clears the PIN and any lock. The child sets a new PIN by scanning the card again. */
export async function resetPin(staff: Staff, id: number): Promise<Result> {
  const cur = await one<{ class_id: number | null }>(db, "select class_id from children where id = $1 and active", [id]);
  if (!cur || !canResetPin(staff, cur.class_id)) return deny;
  await db.query("update children set pin_hash = null, pin_fail_count = 0, pin_locked_until = null where id = $1", [id]);
  await audit(db, staff.id, "child_pin_reset", "child", id);
  return { ok: true };
}

/* ---------- visit notes ---------- */

const METHODS = ["in_person", "phone", "message"];

export async function addVisit(staff: Staff, childId: number, input: { visited_on: string; method: string; content: string }): Promise<Result<{ id: number }>> {
  const child = await one<{ class_id: number | null }>(db, "select class_id from children where id = $1 and active", [childId]);
  if (!child || !canWriteVisits(staff, child.class_id)) return deny;
  const content = clean(input.content, 4000);
  if (!isDate(input.visited_on) || input.visited_on > todayKst()) return fail("날짜가 올바르지 않아요");
  if (!METHODS.includes(input.method)) return fail("방법을 골라 주세요");
  if (!content) return fail("내용을 적어 주세요");
  const rows = await db.query<{ id: number }>("insert into visits (child_id, visited_on, method, content, staff_id) values ($1,$2,$3,$4,$5) returning id", [childId, input.visited_on, input.method, content, staff.id]);
  return { ok: true, id: rows[0].id };
}

async function ownVisit(staff: Staff, visitId: number): Promise<{ child_id: number } | null> {
  const v = await one<{ child_id: number; staff_id: number | null; class_id: number | null }>(
    db,
    "select v.child_id, v.staff_id, c.class_id from visits v join children c on c.id = v.child_id where v.id = $1",
    [visitId],
  );
  if (!v || !canWriteVisits(staff, v.class_id)) return null;
  if (staff.role !== "admin" && v.staff_id !== staff.id) return null;
  return { child_id: v.child_id };
}

export async function updateVisit(staff: Staff, visitId: number, input: { visited_on: string; method: string; content: string }): Promise<Result<{ childId: number }>> {
  const v = await ownVisit(staff, visitId);
  if (!v) return deny;
  const content = clean(input.content, 4000);
  if (!isDate(input.visited_on) || input.visited_on > todayKst()) return fail("날짜가 올바르지 않아요");
  if (!METHODS.includes(input.method)) return fail("방법을 골라 주세요");
  if (!content) return fail("내용을 적어 주세요");
  await db.query("update visits set visited_on = $2, method = $3, content = $4, updated_at = now() where id = $1", [visitId, input.visited_on, input.method, content]);
  return { ok: true, childId: v.child_id };
}

export async function deleteVisit(staff: Staff, visitId: number): Promise<Result<{ childId: number }>> {
  const v = await ownVisit(staff, visitId);
  if (!v) return deny;
  await db.query("delete from visits where id = $1", [visitId]);
  await audit(db, staff.id, "visit_delete", "child", v.child_id, { visit_id: visitId });
  return { ok: true, childId: v.child_id };
}

/* ---------- missions entered by a teacher for a child ---------- */

/** Kinds a teacher can tick off for a child. Attendance goes through the attendance screen; worries and comments are the child's own words. */
const PROXY_SKIP = ["attendance", "worry", "comment"];

export interface ProxyMission extends Pick<MissionForChild, "id" | "title" | "description" | "icon" | "kind" | "state" | "drops" | "points" | "drops_now"> {
  canEnter: boolean;
}

export async function proxyMissions(staff: Staff, childId: number): Promise<ProxyMission[] | null> {
  const child = await one<{ class_id: number | null }>(db, "select class_id from children where id = $1 and active", [childId]);
  if (!child || !canApprove(staff, child.class_id)) return null;
  const list = await missionsForChild(db, childId);
  return list.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    icon: m.icon,
    kind: m.kind,
    state: m.state,
    drops: m.drops,
    points: m.points,
    drops_now: m.drops_now,
    canEnter: m.state === "available" && !PROXY_SKIP.includes(m.kind),
  }));
}

export async function proxyComplete(staff: Staff, childId: number, missionId: number): Promise<Result<{ drops: number; points: number }>> {
  const child = await one<{ class_id: number | null }>(db, "select class_id from children where id = $1 and active", [childId]);
  if (!child || !canApprove(staff, child.class_id)) return deny;
  const list = await missionsForChild(db, childId);
  const m = list.find((x) => x.id === missionId);
  if (!m || PROXY_SKIP.includes(m.kind)) return fail("대신 입력할 수 없는 미션이에요");
  const r = await completeMission(childId, missionId, { byStaffId: staff.id });
  if (!r.ok) return fail(r.reason === "already_done" ? "이미 한 미션이에요" : "미션을 찾을 수 없어요");
  return { ok: true, drops: r.drops, points: r.points };
}

/* ---------- home screen ---------- */

/** Children (within detail scope) absent two or more recorded weeks in a row, most recent week first. */
export async function longAbsent(staff: Staff): Promise<{ id: number; name: string; class_name: string | null; weeks: number }[]> {
  const sc = scopeSql(detailScope(staff), "c.class_id", 1);
  const kids = await db.query<{ id: number; name: string; class_name: string | null }>(
    `select c.id, c.name, k.name as class_name from children c left join classes k on k.id = c.class_id where c.active and ${sc.sql} order by k.sort nulls last, c.name`,
    sc.params,
  );
  if (kids.length === 0) return [];
  const ws = weekStart(todayKst());
  const att = await db.query<{ child_id: number; date: string; status: string }>("select child_id, date, status from attendance where child_id = any($1::int[]) and date >= $2", [
    kids.map((k) => k.id),
    addDays(ws, -7 * 60),
  ]);
  const out = [];
  for (const k of kids) {
    const byDate = new Map(att.filter((a) => a.child_id === k.id).map((a) => [a.date, a.status]));
    const s = streakFrom(byDate, byDate.has(ws) ? ws : addDays(ws, -7));
    if (s.kind === "absent" && s.n >= 2) out.push({ ...k, weeks: s.n });
  }
  return out;
}
