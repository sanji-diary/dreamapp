import "server-only";
import { db, one } from "@/lib/db";
import { getSettings, type Settings } from "@/lib/game";
import { ensureJoinCode, newJoinCode, selfJoinState } from "@/lib/self-join";
import { addDays, todayKst, weekStart } from "@/lib/time";
import type { Staff } from "@/lib/types";
import { audit, listClasses, type ClassRow } from "./access";
import { clean, cleanOrNull, deny, fail, isDate, kstDate, type Result } from "./util";

const admin = (s: Staff) => s.role === "admin";

/* ---------- classes ---------- */

export async function adminClasses(staff: Staff): Promise<(ClassRow & { children: number })[] | null> {
  if (!admin(staff)) return null;
  const rows = await listClasses(db, true);
  const counts = await db.query<{ class_id: number; n: number }>("select class_id, count(*)::int as n from children where active and class_id is not null group by class_id");
  return rows.map((r) => ({ ...r, children: counts.find((c) => c.class_id === r.id)?.n ?? 0 }));
}

export async function saveClass(staff: Staff, id: number | null, name: string, grade: number | null): Promise<Result> {
  if (!admin(staff)) return deny;
  const n = clean(name, 20);
  if (!n) return fail("반 이름을 적어 주세요");
  const g = grade !== null && Number.isInteger(grade) && grade >= 1 && grade <= 6 ? grade : null;
  if (id === null) {
    await db.query("insert into classes (name, grade, sort, year) values ($1, $2, (select coalesce(max(sort),0)+1 from classes), $3)", [n, g, Number(todayKst().slice(0, 4))]);
  } else {
    await db.query("update classes set name = $2, grade = $3 where id = $1", [id, n, g]);
  }
  return { ok: true };
}

export async function moveClass(staff: Staff, id: number, dir: "up" | "down"): Promise<Result> {
  if (!admin(staff)) return deny;
  await db.tx(async (q) => {
    const rows = await q.query<{ id: number }>("select id from classes where not archived order by sort, id");
    const i = rows.findIndex((r) => r.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    for (let k = 0; k < rows.length; k++) await q.query("update classes set sort = $2 where id = $1", [rows[k].id, k + 1]);
  });
  return { ok: true };
}

export async function archiveClass(staff: Staff, id: number, archived: boolean): Promise<Result> {
  if (!admin(staff)) return deny;
  if (archived) {
    const n = await one<{ n: number }>(db, "select count(*)::int as n from children where class_id = $1 and active", [id]);
    if ((n?.n ?? 0) > 0) return fail("아이들을 먼저 다른 반으로 옮겨 주세요");
  }
  await db.query("update classes set archived = $2 where id = $1", [id, archived]);
  await audit(db, staff.id, archived ? "class_archive" : "class_restore", "class", id);
  return { ok: true };
}

/** Yearly reshuffle: move many children to one class at once. */
export async function moveChildren(staff: Staff, childIds: number[], classId: number): Promise<Result<{ moved: number }>> {
  if (!admin(staff)) return deny;
  const ids = [...new Set(childIds.filter((n) => Number.isInteger(n)))];
  if (ids.length === 0) return fail("옮길 아이를 골라 주세요");
  if (!(await one(db, "select 1 as x from classes where id = $1 and not archived", [classId]))) return fail("반을 찾을 수 없어요");
  const rows = await db.query("update children set class_id = $2 where id = any($1::int[]) and class_id is distinct from $2 returning id", [ids, classId]);
  await audit(db, staff.id, "children_move", "class", classId, { child_ids: ids });
  return { ok: true, moved: rows.length };
}

/* ---------- QR cards ---------- */

export interface CardRow {
  id: number;
  name: string;
  class_name: string | null;
  qr_token: string;
  onboarded: boolean;
}

export async function cardRows(staff: Staff, classId: number | null): Promise<CardRow[] | null> {
  if (!admin(staff)) return null;
  return db.query<CardRow>(
    `select c.id, c.name, k.name as class_name, c.qr_token, (c.onboarded_at is not null and c.pin_hash is not null) as onboarded
       from children c left join classes k on k.id = c.class_id
      where c.active and ($1::int is null or c.class_id = $1) order by k.sort nulls last, k.id, c.name, c.id`,
    [classId],
  );
}

/* ---------- the shared join QR ---------- */

/** The shared QR's code and switch, for the admin's card screen. The code is made here the first time it is needed. */
export async function sharedJoin(staff: Staff): Promise<{ code: string; on: boolean; joined: number } | null> {
  if (!admin(staff)) return null;
  const code = await ensureJoinCode();
  const state = await selfJoinState();
  const n = await one<{ n: number }>(db, "select count(*)::int as n from children where self_joined and active");
  return { code, on: state.on, joined: n?.n ?? 0 };
}

/** A new code: the QR printed before stops working at once. */
export async function reissueJoinCode(staff: Staff): Promise<Result> {
  if (!admin(staff)) return deny;
  await db.query("insert into settings (key, value) values ('join_code', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(newJoinCode())]);
  await audit(db, staff.id, "join_code_reissue", "settings", null);
  return { ok: true };
}

export async function setSelfJoin(staff: Staff, on: boolean): Promise<Result> {
  if (!admin(staff)) return deny;
  await db.query("insert into settings (key, value) values ('self_join_on', $1) on conflict (key) do update set value = excluded.value", [JSON.stringify(on === true)]);
  await audit(db, staff.id, on ? "self_join_on" : "self_join_off", "settings", null);
  return { ok: true };
}

/* ---------- worship ---------- */

export interface WorshipItem {
  title: string;
  detail: string;
}
export interface Worship {
  date: string;
  time_place: string;
  sermon_title: string;
  scripture: string;
  preacher: string;
  memory_verse: string;
  items: WorshipItem[];
}

function cleanItems(items: unknown): WorshipItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 30)
    .map((i) => ({ title: clean((i as WorshipItem)?.title, 30), detail: clean((i as WorshipItem)?.detail, 80) }))
    .filter((i) => i.title || i.detail);
}

export async function getWorship(staff: Staff, date: string): Promise<{ worship: Worship; exists: boolean; hasPrevious: boolean } | null> {
  if (!admin(staff) || !isDate(date)) return null;
  const w = await one<Worship>(db, "select date, time_place, sermon_title, scripture, preacher, memory_verse, items from worship where date = $1", [date]);
  const prev = await one(db, "select 1 as x from worship where date < $1", [date]);
  return {
    worship: w ? { ...w, items: cleanItems(w.items) } : { date, time_place: "", sermon_title: "", scripture: "", preacher: "", memory_verse: "", items: [] },
    exists: w !== null,
    hasPrevious: prev !== null,
  };
}

export async function saveWorship(staff: Staff, w: Worship): Promise<Result> {
  if (!admin(staff)) return deny;
  if (!isDate(w.date)) return fail("날짜가 올바르지 않아요");
  await db.query(
    `insert into worship (date, time_place, sermon_title, scripture, preacher, memory_verse, items) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (date) do update set time_place = excluded.time_place, sermon_title = excluded.sermon_title, scripture = excluded.scripture,
       preacher = excluded.preacher, memory_verse = excluded.memory_verse, items = excluded.items`,
    [w.date, clean(w.time_place, 60), clean(w.sermon_title, 60), clean(w.scripture, 60), clean(w.preacher, 30), clean(w.memory_verse, 60), JSON.stringify(cleanItems(w.items))],
  );
  return { ok: true };
}

/** Starts this week's order of worship from the most recent earlier one. */
export async function copyPreviousWorship(staff: Staff, date: string): Promise<Result> {
  if (!admin(staff)) return deny;
  if (!isDate(date)) return fail("날짜가 올바르지 않아요");
  const prev = await one<Worship>(db, "select date, time_place, sermon_title, scripture, preacher, memory_verse, items from worship where date < $1 order by date desc limit 1", [date]);
  if (!prev) return fail("복사할 지난 예배가 없어요");
  return saveWorship(staff, { ...prev, date });
}

/* ---------- notices ---------- */

export interface NoticeRow {
  id: number;
  title: string;
  body: string;
  important: boolean;
  staff_only: boolean;
  event_date: string | null;
  created_on: string | null;
}

export async function listNotices(staff: Staff): Promise<NoticeRow[] | null> {
  if (!admin(staff)) return null;
  const rows = await db.query<Omit<NoticeRow, "created_on"> & { created_at: Date }>("select id, title, body, important, staff_only, event_date, created_at from notices order by created_at desc, id desc");
  return rows.map(({ created_at, ...r }) => ({ ...r, created_on: kstDate(created_at) }));
}

/** Notices teachers should see on their home screen (all staff may read notices). */
export async function recentNotices(): Promise<NoticeRow[]> {
  const rows = await db.query<Omit<NoticeRow, "created_on"> & { created_at: Date }>(
    "select id, title, body, important, staff_only, event_date, created_at from notices where important or staff_only order by created_at desc, id desc limit 3",
  );
  return rows.map(({ created_at, ...r }) => ({ ...r, created_on: kstDate(created_at) }));
}

export async function saveNotice(staff: Staff, id: number | null, input: { title: string; body: string; important: boolean; staff_only: boolean; event_date: string | null }): Promise<Result> {
  if (!admin(staff)) return deny;
  const title = clean(input.title, 60);
  if (!title) return fail("제목을 적어 주세요");
  const ev = cleanOrNull(input.event_date, 10);
  if (ev !== null && !isDate(ev)) return fail("날짜가 올바르지 않아요");
  const vals = [title, clean(input.body, 4000), input.important === true, input.staff_only === true, ev];
  if (id === null) await db.query("insert into notices (title, body, important, staff_only, event_date, staff_id) values ($1,$2,$3,$4,$5,$6)", [...vals, staff.id]);
  else await db.query("update notices set title=$1, body=$2, important=$3, staff_only=$4, event_date=$5 where id=$6", [...vals, id]);
  return { ok: true };
}

export async function deleteNotice(staff: Staff, id: number): Promise<Result> {
  if (!admin(staff)) return deny;
  await db.query("delete from notices where id = $1", [id]);
  return { ok: true };
}

/* ---------- feed posts ---------- */

export interface PostRow {
  id: number;
  body: string;
  image_url: string | null;
  comments_open: boolean;
  created_on: string | null;
  likes: number;
  comments: { id: number; author: string; body: string; hidden: boolean }[];
}

export async function listPosts(staff: Staff): Promise<PostRow[] | null> {
  if (!admin(staff)) return null;
  const posts = await db.query<{ id: number; body: string; image_url: string | null; comments_open: boolean; created_at: Date; likes: number }>(
    "select p.id, p.body, p.image_url, p.comments_open, p.created_at, (select count(*)::int from post_likes l where l.post_id = p.id) as likes from posts p order by p.created_at desc, p.id desc limit 50",
  );
  if (posts.length === 0) return [];
  const comments = await db.query<{ id: number; post_id: number; author: string; body: string; hidden: boolean }>(
    `select cm.id, cm.post_id, coalesce(c.name, s.name, '알 수 없음') as author, cm.body, (cm.hidden_at is not null) as hidden
       from comments cm left join children c on c.id = cm.child_id left join staff s on s.id = cm.staff_id
      where cm.post_id = any($1::int[]) order by cm.created_at, cm.id`,
    [posts.map((p) => p.id)],
  );
  return posts.map(({ created_at, ...p }) => ({ ...p, created_on: kstDate(created_at), comments: comments.filter((c) => c.post_id === p.id) }));
}

export async function savePost(staff: Staff, id: number | null, input: { body: string; comments_open: boolean; image_url?: string | null; removeImage?: boolean }): Promise<Result> {
  if (!admin(staff)) return deny;
  const body = clean(input.body, 2000);
  if (!body) return fail("내용을 적어 주세요");
  if (id === null) {
    await db.query("insert into posts (body, image_url, comments_open, staff_id) values ($1,$2,$3,$4)", [body, input.image_url ?? null, input.comments_open === true, staff.id]);
  } else {
    await db.query("update posts set body = $2, comments_open = $3, image_url = case when $5::boolean then null else coalesce($4, image_url) end where id = $1", [
      id,
      body,
      input.comments_open === true,
      input.image_url ?? null,
      input.removeImage === true && !input.image_url,
    ]);
  }
  return { ok: true };
}

export async function deletePost(staff: Staff, id: number): Promise<Result> {
  if (!admin(staff)) return deny;
  await db.query("delete from posts where id = $1", [id]);
  await audit(db, staff.id, "post_delete", "post", id);
  return { ok: true };
}

/* ---------- points ---------- */

export interface BalanceRow {
  id: number;
  name: string;
  class_name: string | null;
  points: number;
  drops: number;
}

export async function balances(staff: Staff): Promise<BalanceRow[] | null> {
  if (!admin(staff)) return null;
  return db.query<BalanceRow>(
    `select c.id, c.name, k.name as class_name,
            (select coalesce(sum(delta),0)::int from point_ledger p where p.child_id = c.id) as points,
            (select coalesce(sum(delta),0)::int from drop_ledger d where d.child_id = c.id) as drops
       from children c left join classes k on k.id = c.class_id where c.active order by k.sort nulls last, k.id, c.name, c.id`,
  );
}

/** A manual correction. The ledger is append-only, so this adds a row with the admin's id and the reason. */
export async function adjustPoints(staff: Staff, childId: number, delta: number, reason: string): Promise<Result> {
  if (!admin(staff)) return deny;
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000) return fail("포인트는 0이 아닌 숫자로 적어 주세요 (최대 10000)");
  const why = clean(reason, 100);
  if (!why) return fail("이유를 적어 주세요");
  if (!(await one(db, "select 1 as x from children where id = $1", [childId]))) return fail("아이를 찾을 수 없어요");
  await db.query("insert into point_ledger (child_id, delta, reason, ref_type, staff_id) values ($1,$2,$3,'manual',$4)", [childId, delta, why, staff.id]);
  await audit(db, staff.id, "points_adjust", "child", childId, { delta, reason: why });
  return { ok: true };
}

export async function recentAdjustments(staff: Staff): Promise<{ id: number; child_name: string; delta: number; reason: string; staff_name: string | null; on: string | null }[] | null> {
  if (!admin(staff)) return null;
  const rows = await db.query<{ id: number; child_name: string; delta: number; reason: string; staff_name: string | null; created_at: Date }>(
    `select p.id, c.name as child_name, p.delta, p.reason, s.name as staff_name, p.created_at
       from point_ledger p join children c on c.id = p.child_id left join staff s on s.id = p.staff_id
      where p.ref_type = 'manual' order by p.created_at desc, p.id desc limit 20`,
  );
  return rows.map(({ created_at, ...r }) => ({ ...r, on: kstDate(created_at) }));
}

/* ---------- CSV exports ---------- */

export function csv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    let s = v === null ? "" : String(v);
    // Stop spreadsheet programs from running a cell that starts like a formula.
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so that Excel reads the file as UTF-8.
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function pointsCsv(staff: Staff): Promise<string | null> {
  const rows = await balances(staff);
  if (!rows) return null;
  return csv([["반", "이름", "포인트", "남은 물방울"], ...rows.map((r) => [r.class_name, r.name, r.points, r.drops])]);
}

const STATUS_KO: Record<string, string> = { present: "출석", late: "지각", absent: "결석" };

/** One row per child, one column per Sunday (most recent `weeks` Sundays, oldest first). */
export async function attendanceCsv(staff: Staff, weeks = 26): Promise<string | null> {
  if (!admin(staff)) return null;
  const ws = weekStart(todayKst());
  const sundays = Array.from({ length: weeks }, (_, i) => addDays(ws, -7 * (weeks - 1 - i)));
  const kids = await db.query<{ id: number; name: string; class_name: string | null }>(
    "select c.id, c.name, k.name as class_name from children c left join classes k on k.id = c.class_id where c.active order by k.sort nulls last, k.id, c.name, c.id",
  );
  const att = await db.query<{ child_id: number; date: string; status: string }>("select child_id, date, status from attendance where date >= $1", [sundays[0]]);
  const key = new Map(att.map((a) => [`${a.child_id}:${a.date}`, a.status]));
  return csv([
    ["반", "이름", ...sundays, "출석 수"],
    ...kids.map((k) => {
      const cells = sundays.map((d) => key.get(`${k.id}:${d}`) ?? "");
      return [k.class_name, k.name, ...cells.map((s) => STATUS_KO[s] ?? ""), cells.filter((s) => s === "present" || s === "late").length];
    }),
  ]);
}

/* ---------- settings ---------- */

export async function adminSettings(staff: Staff): Promise<Settings | null> {
  return admin(staff) ? getSettings(db) : null;
}

export async function saveSettings(staff: Staff, input: { weeklyDropCap: number; levelNeeds: number[]; classGoal: number; harvestBonusPoints: number }): Promise<Result> {
  if (!admin(staff)) return deny;
  const int = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!int(input.weeklyDropCap, 1, 100)) return fail("주간 물방울 한도는 1에서 100 사이로 적어 주세요");
  if (input.levelNeeds.length !== 6 || !input.levelNeeds.every((n) => int(n, 1, 100))) return fail("단계별 물방울은 1에서 100 사이 숫자 여섯 개로 적어 주세요");
  if (!int(input.classGoal, 1, 10000)) return fail("반 목표는 1 이상으로 적어 주세요");
  if (!int(input.harvestBonusPoints, 0, 10000)) return fail("수확 보너스는 0 이상으로 적어 주세요");
  const before = await getSettings(db);
  const set = (key: string, value: unknown) =>
    db.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, JSON.stringify(value)]);
  await set("weekly_drop_cap", input.weeklyDropCap);
  await set("level_needs", input.levelNeeds);
  await set("class_goal", input.classGoal);
  await set("harvest_bonus_points", input.harvestBonusPoints);
  await audit(db, staff.id, "settings_update", "settings", null, { before, after: input });
  return { ok: true };
}
