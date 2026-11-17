import "server-only";
import { canApprove, canModerateComments, canReadWorry, worryCondition } from "@/lib/authz";
import { db, one } from "@/lib/db";
import { reviewCompletion } from "@/lib/game";
import type { Staff, WorryAudience } from "@/lib/types";
import { approveScope, audit, scopeSql } from "./access";
import { clean, deny, fail, kstDate, type Result } from "./util";

/* ---------- mission submissions waiting for a teacher ---------- */

export interface PendingItem {
  id: number;
  child_id: number;
  child_name: string;
  class_name: string | null;
  title: string;
  icon: string;
  kind: string;
  photo_url: string | null;
  text_content: string | null;
  done_on: string;
}

export async function pendingCompletions(staff: Staff): Promise<PendingItem[]> {
  const sc = scopeSql(approveScope(staff), "c.class_id", 1);
  return db.query<PendingItem>(
    `select mc.id, c.id as child_id, c.name as child_name, k.name as class_name, m.title, m.icon, m.kind, mc.photo_url, mc.text_content, mc.done_on
       from mission_completions mc
       join children c on c.id = mc.child_id and c.active
       join missions m on m.id = mc.mission_id
       left join classes k on k.id = c.class_id
      where mc.status = 'pending' and ${sc.sql}
      order by mc.created_at, mc.id`,
    sc.params,
  );
}

export async function pendingCount(staff: Staff): Promise<number> {
  const sc = scopeSql(approveScope(staff), "c.class_id", 1);
  const r = await one<{ n: number }>(db, `select count(*)::int as n from mission_completions mc join children c on c.id = mc.child_id and c.active where mc.status = 'pending' and ${sc.sql}`, sc.params);
  return r?.n ?? 0;
}

export async function reviewSubmission(staff: Staff, completionId: number, approve: boolean): Promise<Result> {
  const row = await one<{ class_id: number | null }>(db, "select c.class_id from mission_completions mc join children c on c.id = mc.child_id where mc.id = $1", [completionId]);
  if (!row || !canApprove(staff, row.class_id)) return deny;
  const done = await reviewCompletion(staff.id, completionId, approve);
  return done ? { ok: true } : fail("이미 처리된 제출이에요");
}

/* ---------- reported comments (any teacher) ---------- */

export interface ReportedComment {
  comment_id: number;
  body: string;
  author: string;
  author_id: number | null;
  post_body: string;
  reports: number;
  last_reported: string | null;
}

export async function reportedComments(staff: Staff): Promise<ReportedComment[]> {
  if (!canModerateComments(staff)) return [];
  const rows = await db.query<Omit<ReportedComment, "last_reported"> & { last_at: Date }>(
    `select cm.id as comment_id, cm.body, coalesce(c.name, s.name, '알 수 없음') as author, c.id as author_id, p.body as post_body,
            count(r.id)::int as reports, max(r.created_at) as last_at
       from comment_reports r
       join comments cm on cm.id = r.comment_id
       join posts p on p.id = cm.post_id
       left join children c on c.id = cm.child_id
       left join staff s on s.id = cm.staff_id
      where r.resolved_at is null and cm.hidden_at is null
      group by cm.id, cm.body, c.name, s.name, c.id, p.body
      order by max(r.created_at) desc`,
  );
  return rows.map(({ last_at, ...r }) => ({ ...r, last_reported: kstDate(last_at) }));
}

/** Hides a comment from the feed. Works with or without a report; open reports on it are closed. */
export async function hideComment(staff: Staff, commentId: number): Promise<Result> {
  if (!canModerateComments(staff)) return deny;
  return db.tx(async (q) => {
    const rows = await q.query("update comments set hidden_at = now(), hidden_by = $2 where id = $1 and hidden_at is null returning id", [commentId, staff.id]);
    if (rows.length === 0) return fail("이미 지워졌거나 없는 댓글이에요");
    await q.query("update comment_reports set resolved_at = now() where comment_id = $1 and resolved_at is null", [commentId]);
    await audit(q, staff.id, "comment_hide", "comment", commentId);
    return { ok: true } as const;
  });
}

/** Keeps the comment and closes its open reports. Who did it goes to the audit log. */
export async function dismissReports(staff: Staff, commentId: number): Promise<Result> {
  if (!canModerateComments(staff)) return deny;
  return db.tx(async (q) => {
    const rows = await q.query("update comment_reports set resolved_at = now() where comment_id = $1 and resolved_at is null returning id", [commentId]);
    if (rows.length === 0) return fail("이미 처리된 신고예요");
    await audit(q, staff.id, "report_dismiss", "comment", commentId, { reports: rows.length });
    return { ok: true } as const;
  });
}

/* ---------- worries ---------- */

export const AUDIENCE_LABEL: Record<WorryAudience, string> = { teacher: "선생님께", pastor: "전도사님께", both: "선생님과 전도사님께" };

export interface WorryListItem {
  id: number;
  child_name: string;
  audience: WorryAudience;
  written_on: string | null;
  unread: boolean;
  replies: number;
}

/** The list never carries the worry text; that is only on the detail page. */
export async function listWorries(staff: Staff): Promise<WorryListItem[]> {
  const cond = worryCondition(staff, 2);
  const rows = await db.query<Omit<WorryListItem, "written_on"> & { created_at: Date }>(
    `select w.id, c.name as child_name, w.audience, w.created_at,
            not exists (select 1 from worry_reads r where r.worry_id = w.id and r.staff_id = $1) as unread,
            (select count(*)::int from worry_replies p where p.worry_id = w.id) as replies
       from worries w join children c on c.id = w.child_id
      where w.deleted_at is null and ${cond.sql}
      order by w.created_at desc, w.id desc`,
    [staff.id, ...cond.params],
  );
  return rows.map(({ created_at, ...r }) => ({ ...r, written_on: kstDate(created_at) }));
}

export async function unreadWorryCount(staff: Staff): Promise<number> {
  const cond = worryCondition(staff, 2);
  const r = await one<{ n: number }>(
    db,
    `select count(*)::int as n from worries w where w.deleted_at is null and ${cond.sql}
        and not exists (select 1 from worry_reads r where r.worry_id = w.id and r.staff_id = $1)`,
    [staff.id, ...cond.params],
  );
  return r?.n ?? 0;
}

export interface WorryDetail {
  id: number;
  child_name: string;
  class_name: string | null;
  audience: WorryAudience;
  content: string;
  written_on: string | null;
  replies: { id: number; staff_name: string | null; content: string; written_on: string | null; mine: boolean }[];
}

async function readableWorry(staff: Staff, id: number) {
  const w = await one<{ id: number; child_name: string; class_name: string | null; audience: WorryAudience; class_id_at_write: number | null; content: string; created_at: Date }>(
    db,
    `select w.id, c.name as child_name, k.name as class_name, w.audience, w.class_id_at_write, w.content, w.created_at
       from worries w join children c on c.id = w.child_id left join classes k on k.id = w.class_id_at_write
      where w.id = $1 and w.deleted_at is null`,
    [id],
  );
  return w && canReadWorry(staff, w) ? w : null;
}

/** Opens a worry and records that this teacher read it. Returns null when it is not theirs to read. */
export async function openWorry(staff: Staff, id: number): Promise<WorryDetail | null> {
  const w = await readableWorry(staff, id);
  if (!w) return null;
  await db.query("insert into worry_reads (worry_id, staff_id) select $1, $2 where not exists (select 1 from worry_reads where worry_id = $1 and staff_id = $2)", [id, staff.id]);
  const replies = await db.query<{ id: number; staff_id: number | null; staff_name: string | null; content: string; created_at: Date }>(
    "select p.id, p.staff_id, s.name as staff_name, p.content, p.created_at from worry_replies p left join staff s on s.id = p.staff_id where p.worry_id = $1 order by p.created_at, p.id",
    [id],
  );
  return {
    id: w.id,
    child_name: w.child_name,
    class_name: w.class_name,
    audience: w.audience,
    content: w.content,
    written_on: kstDate(w.created_at),
    replies: replies.map((r) => ({ id: r.id, staff_name: r.staff_name, content: r.content, written_on: kstDate(r.created_at), mine: r.staff_id === staff.id })),
  };
}

export async function replyWorry(staff: Staff, id: number, content: string): Promise<Result> {
  const w = await readableWorry(staff, id);
  if (!w) return deny;
  const text = clean(content, 2000);
  if (!text) return fail("답장 내용을 적어 주세요");
  await db.query("insert into worry_replies (worry_id, staff_id, content) values ($1,$2,$3)", [id, staff.id, text]);
  return { ok: true };
}
