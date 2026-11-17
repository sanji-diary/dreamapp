import "server-only";
import { db, one } from "@/lib/db";
import { getSettings } from "@/lib/game";
import { findGame } from "@/games/registry";
import { newToken } from "@/lib/pin";
import { parseQuiz, validateQuiz } from "@/lib/quiz";
import { addDays, todayKst, weekEnd, weekStart } from "@/lib/time";
import type { Mission, QuizQuestion, Staff } from "@/lib/types";
import { KIND_NAMES } from "@/lib/types";
import { listClasses } from "./access";
import { clean, cleanOrNull, deny, fail, isDate, type Result } from "./util";

export const MISSION_ICONS = ["bible", "stamp", "house", "bubble", "pray", "drop", "can", "persimmon", "badge", "pouch"] as const;

export interface MissionInput {
  title: string;
  description: string;
  kind: string;
  icon: string;
  points: number;
  drops: number;
  repeat: string;
  weekly_limit: number | null;
  verse_text: string | null;
  verse_ref: string | null;
  target_grade: number | null;
  target_class_id: number | null;
  starts_on: string;
  ends_on: string;
  is_challenge: boolean;
  /** Attendance missions only: children may check in alone by scanning a QR. ('qr' missions always have a code.) */
  qr_self: boolean;
  /** Quiz missions only. Checked by validateQuiz before saving. */
  quiz: QuizQuestion[] | null;
  quiz_pass: number | null;
  /** Game missions only: an id from src/games/registry.ts. */
  game_id: string | null;
}

export async function listMissions(staff: Staff): Promise<{ current: Mission[]; upcoming: Mission[]; past: Mission[] } | null> {
  if (staff.role !== "admin") return null;
  const today = todayKst();
  const all = await db.query<Mission>("select * from missions order by starts_on desc, is_challenge desc, id");
  return {
    current: all.filter((m) => m.active && m.starts_on <= today && m.ends_on >= today),
    upcoming: all.filter((m) => m.active && m.starts_on > today),
    past: all.filter((m) => !m.active || m.ends_on < today).slice(0, 60),
  };
}

export async function getMission(staff: Staff, id: number): Promise<Mission | null> {
  if (staff.role !== "admin") return null;
  return one<Mission>(db, "select * from missions where id = $1", [id]);
}

export function defaultMissionInput(): MissionInput {
  return {
    title: "", description: "", kind: "self", icon: "stamp", points: 10, drops: 1, repeat: "weekly", weekly_limit: null,
    verse_text: null, verse_ref: null, target_grade: null, target_class_id: null, starts_on: weekStart(), ends_on: weekEnd(), is_challenge: false,
    qr_self: false, quiz: null, quiz_pass: null, game_id: null,
  };
}

async function validate(input: MissionInput): Promise<Result<{ v: MissionInput }>> {
  const title = clean(input.title, 40);
  if (!title) return fail("미션 이름을 적어 주세요");
  if (!(input.kind in KIND_NAMES)) return fail("확인 방법을 골라 주세요");
  if (!["once", "daily", "weekly"].includes(input.repeat)) return fail("반복을 골라 주세요");
  if (!Number.isInteger(input.points) || input.points < 0 || input.points > 1000) return fail("포인트는 0에서 1000 사이로 적어 주세요");
  if (!Number.isInteger(input.drops) || input.drops < 0 || input.drops > 12) return fail("물방울은 0에서 12 사이로 적어 주세요");
  if (!isDate(input.starts_on) || !isDate(input.ends_on) || input.ends_on < input.starts_on) return fail("기간이 올바르지 않아요");
  const verseText = input.kind === "verse" ? cleanOrNull(input.verse_text, 300) : null;
  if (input.kind === "verse" && !verseText) return fail("따라 쓸 말씀을 적어 주세요");
  let quiz: QuizQuestion[] | null = null;
  let quizPass: number | null = null;
  if (input.kind === "quiz") {
    const qz = validateQuiz(input.quiz, input.quiz_pass);
    if (!qz.ok) return fail(qz.error);
    quiz = qz.quiz;
    quizPass = qz.pass;
  }
  const game = input.kind === "game" ? findGame(input.game_id) : null;
  if (input.kind === "game" && !game) return fail("어떤 게임인지 골라 주세요");
  let limit: number | null = null;
  if (input.repeat === "daily" && input.weekly_limit !== null) {
    if (!Number.isInteger(input.weekly_limit) || input.weekly_limit < 1 || input.weekly_limit > 7) return fail("주간 횟수는 1에서 7 사이로 적어 주세요");
    limit = input.weekly_limit;
  }
  let grade = input.target_grade;
  let classId = input.target_class_id;
  if (classId !== null) {
    grade = null;
    if (!(await one(db, "select 1 as x from classes where id = $1", [classId]))) classId = null;
  }
  if (grade !== null && (!Number.isInteger(grade) || grade < 1 || grade > 6)) grade = null;
  return {
    ok: true,
    v: {
      title,
      description: clean(input.description, 80),
      kind: input.kind,
      icon: (MISSION_ICONS as readonly string[]).includes(input.icon) ? input.icon : "stamp",
      points: input.points,
      drops: input.drops,
      repeat: input.repeat,
      weekly_limit: limit,
      verse_text: verseText,
      verse_ref: input.kind === "verse" ? cleanOrNull(input.verse_ref, 40) : null,
      target_grade: grade,
      target_class_id: classId,
      starts_on: input.starts_on,
      ends_on: input.ends_on,
      is_challenge: input.is_challenge === true,
      qr_self: input.kind === "attendance" && input.qr_self === true,
      quiz,
      quiz_pass: quizPass,
      game_id: game?.id ?? null,
    },
  };
}

export async function saveMission(staff: Staff, id: number | null, input: MissionInput): Promise<Result<{ id: number }>> {
  if (staff.role !== "admin") return deny;
  const r = await validate(input);
  if (!r.ok) return r;
  const v = r.v;
  // jsonb is sent as text and cast: node-postgres would turn a JS array into a Postgres array otherwise.
  const vals = [v.title, v.description, v.kind, v.icon, v.verse_text, v.verse_ref, v.points, v.drops, v.repeat, v.weekly_limit, v.target_grade, v.target_class_id, v.starts_on, v.ends_on, v.is_challenge, v.quiz ? JSON.stringify(v.quiz) : null, v.quiz_pass, v.game_id];
  // A QR mission always has a code; an attendance mission has one only when self check-in is switched on.
  const wantsQr = v.kind === "qr" || v.qr_self;
  if (id === null) {
    const rows = await db.query<{ id: number }>(
      `insert into missions (title, description, kind, icon, verse_text, verse_ref, points, drops, repeat, weekly_limit, target_grade, target_class_id, starts_on, ends_on, is_challenge, quiz, quiz_pass, game_id, qr_code, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20) returning id`,
      [...vals, wantsQr ? newToken(9) : null, staff.id],
    );
    return { ok: true, id: rows[0].id };
  }
  const rows = await db.query<{ id: number }>(
    `update missions set title=$1, description=$2, kind=$3, icon=$4, verse_text=$5, verse_ref=$6, points=$7, drops=$8, repeat=$9, weekly_limit=$10,
            target_grade=$11, target_class_id=$12, starts_on=$13, ends_on=$14, is_challenge=$15, quiz=$16::jsonb, quiz_pass=$17, game_id=$18,
            qr_code = case when $19::boolean then coalesce(qr_code, $20) else null end
      where id = $21 returning id`,
    [...vals, wantsQr, newToken(9), id],
  );
  if (rows.length === 0) return fail("미션을 찾을 수 없어요");
  // Half-finished quiz tries were answering the old questions; children simply start again.
  await db.query("delete from quiz_attempts where mission_id = $1 and finished_at is null", [id]);
  return { ok: true, id };
}

export async function setMissionActive(staff: Staff, id: number, active: boolean): Promise<Result> {
  if (staff.role !== "admin") return deny;
  await db.query("update missions set active = $2 where id = $1", [id, active]);
  return { ok: true };
}

/** Copies a mission to the following week (same weekday span, seven days later). */
export async function duplicateToNextWeek(staff: Staff, id: number): Promise<Result<{ id: number }>> {
  if (staff.role !== "admin") return deny;
  const m = await one<Mission>(db, "select * from missions where id = $1", [id]);
  if (!m) return fail("미션을 찾을 수 없어요");
  const rows = await db.query<{ id: number }>(
    `insert into missions (title, description, kind, icon, verse_text, verse_ref, points, drops, repeat, weekly_limit, target_grade, target_class_id, starts_on, ends_on, is_challenge, quiz, quiz_pass, game_id, qr_code, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20) returning id`,
    // The copy gets its own QR code, so last week's poster stops working when that mission ends.
    [m.title, m.description, m.kind, m.icon, m.verse_text, m.verse_ref, m.points, m.drops, m.repeat, m.weekly_limit, m.target_grade, m.target_class_id, addDays(m.starts_on, 7), addDays(m.ends_on, 7), m.is_challenge,
      m.quiz ? JSON.stringify(parseQuiz(m.quiz)) : null, m.quiz_pass, m.game_id, m.kind === "qr" || m.qr_code !== null ? newToken(9) : null, staff.id],
  );
  return { ok: true, id: rows[0].id };
}

/** The most drops one child could earn from a mission in a week. */
export function weeklyDrops(m: Pick<Mission, "drops" | "repeat" | "weekly_limit">): number {
  return m.repeat === "daily" ? m.drops * (m.weekly_limit ?? 7) : m.drops;
}

export interface DropCheck {
  cap: number;
  /** Per class: the most a child in it can earn this week. */
  classes: { name: string; total: number }[];
  over: boolean;
  under: boolean;
}

/** Compares this week's active missions with the weekly cap, class by class (missions can target a grade or a class). */
export async function weeklyDropCheck(staff: Staff, week: string = weekStart()): Promise<DropCheck | null> {
  if (staff.role !== "admin") return null;
  const cap = (await getSettings(db)).weeklyDropCap;
  const missions = await db.query<Mission>("select * from missions where active and starts_on <= $2 and ends_on >= $1", [week, addDays(week, 6)]);
  const classes = await listClasses(db);
  const totals = classes.map((c) => ({
    name: c.name,
    total: missions
      .filter((m) => (m.target_class_id === null || m.target_class_id === c.id) && (m.target_grade === null || m.target_grade === c.grade))
      .reduce((sum, m) => sum + weeklyDrops(m), 0),
  }));
  return { cap, classes: totals, over: totals.some((t) => t.total > cap), under: totals.some((t) => t.total < cap) };
}
