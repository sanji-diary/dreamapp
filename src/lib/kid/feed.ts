import "server-only";
import { db, one } from "@/lib/db";
import { autoComplete, type CompleteResult } from "@/lib/game";

export const COMMENT_MAX = 100;

/** A short list of words children should not post. Teachers can still hide anything that slips through. */
const RUDE = ["시발", "씨발", "씨바", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "지랄", "ㅈㄹ", "개새끼", "새끼야", "ㅅㄲ", "꺼져", "닥쳐", "미친놈", "미친년", "좆", "존나", "ㅈㄴ", "등신", "멍청이", "바보", "찐따", "죽어라", "뒤져", "fuck", "shit"];

/** Spaces, digits and punctuation are ignored so 'ㅅ ㅂ' or '바.보' are still caught. */
export function hasRudeWord(text: string): boolean {
  const flat = text.toLowerCase().replace(/[^a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
  return RUDE.some((w) => flat.includes(w));
}

export interface FeedComment {
  id: number;
  body: string;
  author: string;
  avatarId: number;
  mine: boolean;
  byStaff: boolean;
  reported: boolean;
}

export interface FeedPost {
  id: number;
  body: string;
  image_url: string | null;
  comments_open: boolean;
  created_at: Date;
  likes: number;
  liked: boolean;
  comments: FeedComment[];
}

export async function feedFor(childId: number): Promise<FeedPost[]> {
  const posts = await db.query<Omit<FeedPost, "comments">>(
    `select p.id, p.body, p.image_url, p.comments_open, p.created_at,
            (select count(*)::int from post_likes l where l.post_id = p.id) as likes,
            exists (select 1 from post_likes l where l.post_id = p.id and l.child_id = $1) as liked
       from posts p order by p.created_at desc, p.id desc limit 30`,
    [childId],
  );
  if (posts.length === 0) return [];
  const rows = await db.query<{ id: number; post_id: number; body: string; child_id: number | null; child_name: string | null; staff_name: string | null; reported: boolean }>(
    `select c.id, c.post_id, c.body, c.child_id, k.name as child_name, s.name as staff_name,
            exists (select 1 from comment_reports r where r.comment_id = c.id and r.child_id = $1) as reported
       from comments c left join children k on k.id = c.child_id left join staff s on s.id = c.staff_id
      where c.hidden_at is null and c.post_id = any($2::int[]) order by c.created_at, c.id`,
    [childId, posts.map((p) => p.id)],
  );
  return posts.map((p) => ({
    ...p,
    comments: rows
      .filter((c) => c.post_id === p.id)
      .map((c) => ({
        id: c.id,
        body: c.body,
        author: c.child_name ?? (c.staff_name ? `${c.staff_name} 선생님` : "선생님"),
        avatarId: c.child_id ?? 0,
        mine: c.child_id === childId,
        byStaff: c.child_id === null,
        reported: c.reported,
      })),
  }));
}

export async function toggleLike(childId: number, postId: number): Promise<{ liked: boolean; likes: number } | null> {
  if (!Number.isInteger(postId)) return null;
  const post = await one(db, "select id from posts where id = $1", [postId]);
  if (!post) return null;
  const removed = await db.query("delete from post_likes where post_id = $1 and child_id = $2 returning post_id", [postId, childId]);
  if (removed.length === 0) await db.query("insert into post_likes (post_id, child_id) values ($1,$2) on conflict do nothing", [postId, childId]);
  const n = await one<{ n: number }>(db, "select count(*)::int as n from post_likes where post_id = $1", [postId]);
  return { liked: removed.length === 0, likes: n?.n ?? 0 };
}

export type AddCommentResult =
  | { ok: true; commentId: number; mission: CompleteResult | null }
  | { ok: false; reason: "empty" | "too_long" | "rude" | "closed" | "not_found" };

/** Adds a comment. The first one each week also completes the 'comment' mission if one is open. */
export async function addComment(childId: number, postId: number, text: unknown): Promise<AddCommentResult> {
  const body = typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
  if (!body) return { ok: false, reason: "empty" };
  if ([...body].length > COMMENT_MAX) return { ok: false, reason: "too_long" };
  if (hasRudeWord(body)) return { ok: false, reason: "rude" };
  if (!Number.isInteger(postId)) return { ok: false, reason: "not_found" };
  const post = await one<{ comments_open: boolean }>(db, "select comments_open from posts where id = $1", [postId]);
  if (!post) return { ok: false, reason: "not_found" };
  if (!post.comments_open) return { ok: false, reason: "closed" };
  const rows = await db.query<{ id: number }>("insert into comments (post_id, child_id, body) values ($1,$2,$3) returning id", [postId, childId, body]);
  const mission = await autoComplete(childId, "comment");
  return { ok: true, commentId: rows[0].id, mission };
}

/** Children delete only their own comments. */
export async function deleteComment(childId: number, commentId: number): Promise<boolean> {
  if (!Number.isInteger(commentId)) return false;
  const rows = await db.query("delete from comments where id = $1 and child_id = $2 returning id", [commentId, childId]);
  return rows.length > 0;
}

/** Reports someone else's visible comment to the teachers. Reporting twice does nothing. */
export async function reportComment(childId: number, commentId: number): Promise<boolean> {
  if (!Number.isInteger(commentId)) return false;
  const c = await one<{ child_id: number | null }>(db, "select child_id from comments where id = $1 and hidden_at is null", [commentId]);
  if (!c || c.child_id === childId) return false;
  await db.query("insert into comment_reports (comment_id, child_id) values ($1,$2) on conflict do nothing", [commentId, childId]);
  return true;
}
