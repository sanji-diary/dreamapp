import "server-only";
import { db, one, type Queryable } from "./db";
import { todayKst, weekStart } from "./time";
import type { Mission, Tree } from "./types";

/**
 * Drops grow the tree; points are the record that becomes 달란트 at year end.
 * Rules (confirmed in the plan): 12 drops a week at most, 40 drops per tree (2,4,6,8,10,10),
 * trees never wither, nothing is lost by resting.
 */
export interface Settings {
  weeklyDropCap: number;
  levelNeeds: number[];
  classGoal: number;
  harvestBonusPoints: number;
  welcomeBackDrops: number;
}

export async function getSettings(q: Queryable = db): Promise<Settings> {
  const rows = await q.query<{ key: string; value: unknown }>("select key, value from settings");
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return {
    weeklyDropCap: Number(m.get("weekly_drop_cap") ?? 12),
    levelNeeds: (m.get("level_needs") as number[] | undefined) ?? [2, 4, 6, 8, 10, 10],
    classGoal: Number(m.get("class_goal") ?? 30),
    harvestBonusPoints: Number(m.get("harvest_bonus_points") ?? 50),
    welcomeBackDrops: Number(m.get("welcome_back_drops") ?? 2),
  };
}

export async function dropBalance(q: Queryable, childId: number): Promise<number> {
  const r = await one<{ n: number }>(q, "select coalesce(sum(delta),0)::int as n from drop_ledger where child_id = $1", [childId]);
  return r?.n ?? 0;
}

export async function pointBalance(q: Queryable, childId: number): Promise<number> {
  const r = await one<{ n: number }>(q, "select coalesce(sum(delta),0)::int as n from point_ledger where child_id = $1", [childId]);
  return r?.n ?? 0;
}

/** Drops earned from missions in the given week (corrections included). Only these count toward the weekly cap. */
export async function weekDropsEarned(q: Queryable, childId: number, ws: string): Promise<number> {
  const r = await one<{ n: number }>(
    q,
    "select coalesce(sum(delta),0)::int as n from drop_ledger where child_id = $1 and week_start = $2 and ref_type = 'mission'",
    [childId, ws],
  );
  return r?.n ?? 0;
}

export async function ensureTree(q: Queryable, childId: number): Promise<Tree> {
  const t = await one<Tree>(q, "select * from trees where child_id = $1 and harvested_at is null", [childId]);
  if (t) return t;
  const seq = await one<{ n: number }>(q, "select coalesce(max(seq),0)::int + 1 as n from trees where child_id = $1", [childId]);
  const rows = await q.query<Tree>("insert into trees (child_id, seq) values ($1, $2) returning *", [childId, seq?.n ?? 1]);
  return rows[0];
}

export type MissionState = "available" | "pending" | "done";
export interface MissionForChild extends Mission {
  state: MissionState;
  /** Drops this mission would actually give now, after the weekly cap. */
  drops_now: number;
  done_this_week: number;
}

function matchesTarget(m: Mission, child: { class_id: number | null; grade: number | null }): boolean {
  if (m.target_class_id !== null && m.target_class_id !== child.class_id) return false;
  if (m.target_grade !== null && m.target_grade !== child.grade) return false;
  return true;
}

export async function missionsForChild(q: Queryable, childId: number, date: string = todayKst()): Promise<MissionForChild[]> {
  const ws = weekStart(date);
  const child = await one<{ class_id: number | null; grade: number | null }>(
    q,
    "select c.class_id, k.grade from children c left join classes k on k.id = c.class_id where c.id = $1",
    [childId],
  );
  if (!child) return [];
  const missions = await q.query<Mission>("select * from missions where active and starts_on <= $1 and ends_on >= $1 order by is_challenge desc, id", [date]);
  const done = await q.query<{ mission_id: number; status: string; done_on: string; week_start: string }>(
    "select mission_id, status, done_on, week_start from mission_completions where child_id = $1 and status <> 'rejected'",
    [childId],
  );
  const settings = await getSettings(q);
  const earned = await weekDropsEarned(q, childId, ws);
  const room = Math.max(0, settings.weeklyDropCap - earned);
  return missions
    .filter((m) => matchesTarget(m, child))
    .map((m) => {
      const mine = done.filter((d) => d.mission_id === m.id);
      const week = mine.filter((d) => d.week_start === ws);
      const today = mine.filter((d) => d.done_on === date);
      let state: MissionState = "available";
      if (m.repeat === "once" && mine.length > 0) state = mine.some((d) => d.status === "pending") ? "pending" : "done";
      else if (m.repeat === "weekly" && week.length > 0) state = week.some((d) => d.status === "pending") ? "pending" : "done";
      else if (m.repeat === "daily") {
        const limit = m.weekly_limit ?? 7;
        if (today.length > 0 || week.length >= limit) state = "done";
      }
      return { ...m, state, drops_now: Math.min(m.drops, room), done_this_week: week.length };
    });
}

/** Gives the drops (up to the weekly cap) and points for an approved completion. */
async function award(q: Queryable, completionId: number): Promise<{ drops: number; points: number }> {
  const c = await one<{ child_id: number; mission_id: number; week_start: string; drops: number; points: number; title: string }>(
    q,
    `select mc.child_id, mc.mission_id, mc.week_start, m.drops, m.points, m.title
       from mission_completions mc join missions m on m.id = mc.mission_id where mc.id = $1`,
    [completionId],
  );
  if (!c) throw new Error("completion not found");
  const settings = await getSettings(q);
  const earned = await weekDropsEarned(q, c.child_id, c.week_start);
  const drops = Math.max(0, Math.min(c.drops, settings.weeklyDropCap - earned));
  if (drops > 0) {
    await q.query("insert into drop_ledger (child_id, delta, reason, ref_type, ref_id, week_start) values ($1,$2,$3,'mission',$4,$5)", [
      c.child_id,
      drops,
      c.title,
      completionId,
      c.week_start,
    ]);
  }
  if (c.points > 0) {
    await q.query("insert into point_ledger (child_id, delta, reason, ref_type, ref_id) values ($1,$2,$3,'mission',$4)", [c.child_id, c.points, c.title, completionId]);
  }
  await q.query("update mission_completions set drops_awarded = $2, points_awarded = $3 where id = $1", [completionId, drops, c.points]);
  return { drops, points: c.points };
}

export type CompleteResult =
  | { ok: true; status: "approved" | "pending"; drops: number; points: number; completionId: number }
  | { ok: false; reason: "not_found" | "not_available" | "already_done" | "invalid" };

/**
 * Records that a child did a mission. Photo and teacher-check missions wait for a teacher
 * unless a teacher enters them on the child's behalf (children without a phone).
 *
 * - `viaQr`: the code the child scanned. It lets a child finish a 'qr' mission (or an attendance
 *   mission set up for QR self check-in) only when it equals that mission's own qr_code.
 * - `verified`: the caller has already checked the work on the server (quiz answers scored from the
 *   recorded attempt, or a game start token). Quiz and game missions need it; it must never be set
 *   from something the browser merely claims.
 */
export async function completeMission(
  childId: number,
  missionId: number,
  input: { text?: string; photoUrl?: string; byStaffId?: number; date?: string; auto?: boolean; viaQr?: string; verified?: boolean } = {},
): Promise<CompleteResult> {
  const date = input.date ?? todayKst();
  return db.tx(async (q) => {
    const list = await missionsForChild(q, childId, date);
    const m = list.find((x) => x.id === missionId);
    if (!m) return { ok: false, reason: "not_found" } as const;
    if (m.state !== "available") return { ok: false, reason: "already_done" } as const;
    // A child cannot finish these directly: they are completed by a teacher or by the action they belong to.
    const indirect = m.kind === "attendance" || m.kind === "qr" || m.kind === "teacher" || m.kind === "worry" || m.kind === "comment";
    const scanned = (m.kind === "qr" || m.kind === "attendance") && typeof input.viaQr === "string" && input.viaQr !== "" && m.qr_code !== null && input.viaQr === m.qr_code;
    if (indirect && m.kind !== "teacher" && !input.byStaffId && !input.auto && !scanned) return { ok: false, reason: "not_available" } as const;
    // Quizzes and games count only after the server has checked the answers or the game token.
    if ((m.kind === "quiz" || m.kind === "game") && !input.byStaffId && input.verified !== true) return { ok: false, reason: "not_available" } as const;
    if (m.kind === "verse" && !input.byStaffId) {
      if ((input.text ?? "").trim() !== (m.verse_text ?? "").trim()) return { ok: false, reason: "invalid" } as const;
    }
    if (m.kind === "text" && !input.byStaffId && !(input.text ?? "").trim()) return { ok: false, reason: "invalid" } as const;
    const needsReview = (m.kind === "photo" || m.kind === "teacher") && !input.byStaffId;
    const status = needsReview ? "pending" : "approved";
    const rows = await q.query<{ id: number }>(
      `insert into mission_completions (mission_id, child_id, status, text_content, photo_url, done_on, week_start, entered_by_staff_id, reviewed_by, reviewed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8, case when $8::int is null then null else now() end) returning id`,
      [missionId, childId, status, m.kind === "verse" ? null : (input.text ?? null), input.photoUrl ?? null, date, weekStart(date), input.byStaffId ?? null],
    );
    const id = rows[0].id;
    if (status === "pending") return { ok: true, status, drops: 0, points: 0, completionId: id } as const;
    const a = await award(q, id);
    return { ok: true, status, ...a, completionId: id } as const;
  });
}

export async function reviewCompletion(staffId: number, completionId: number, approve: boolean): Promise<boolean> {
  return db.tx(async (q) => {
    const c = await one<{ status: string }>(q, "select status from mission_completions where id = $1", [completionId]);
    if (!c || c.status !== "pending") return false;
    await q.query("update mission_completions set status = $2, reviewed_by = $3, reviewed_at = now() where id = $1", [completionId, approve ? "approved" : "rejected", staffId]);
    if (approve) await award(q, completionId);
    return true;
  });
}

/** Completes the first available mission of a kind (attendance, worry, comment) if one is open this week. */
export async function autoComplete(childId: number, kind: Mission["kind"], opts: { byStaffId?: number; date?: string } = {}): Promise<CompleteResult | null> {
  const date = opts.date ?? todayKst();
  const list = await missionsForChild(db, childId, date);
  const m = list.find((x) => x.kind === kind && x.state === "available");
  if (!m) return null;
  return completeMission(childId, m.id, { byStaffId: opts.byStaffId, date, auto: true });
}

export type WaterResult =
  | { ok: true; tree: Tree; leveledUp: boolean; ripe: boolean; drops: number }
  | { ok: false; reason: "no_drops" | "ripe" };

export async function waterTree(childId: number): Promise<WaterResult> {
  return db.tx(async (q) => {
    const settings = await getSettings(q);
    const tree = await ensureTree(q, childId);
    const need = settings.levelNeeds[tree.level - 1];
    if (tree.level >= 6 && tree.given >= need) return { ok: false, reason: "ripe" } as const;
    const balance = await dropBalance(q, childId);
    if (balance <= 0) return { ok: false, reason: "no_drops" } as const;
    await q.query("insert into drop_ledger (child_id, delta, reason, ref_type, ref_id) values ($1,-1,'나무에 물 주기','tree',$2)", [childId, tree.id]);
    let level = tree.level;
    let given = tree.given + 1;
    let leveledUp = false;
    if (given >= need && level < 6) {
      level += 1;
      given = 0;
      leveledUp = true;
    }
    const rows = await q.query<Tree>("update trees set level = $2, given = $3 where id = $1 returning *", [tree.id, level, given]);
    const ripe = level >= 6 && given >= settings.levelNeeds[5];
    return { ok: true, tree: rows[0], leveledUp, ripe, drops: balance - 1 } as const;
  });
}

export type HarvestResult = { ok: true; bonus: number; treeCount: number; newTree: Tree } | { ok: false; reason: "not_ripe" };

export async function harvestTree(childId: number): Promise<HarvestResult> {
  return db.tx(async (q) => {
    const settings = await getSettings(q);
    const tree = await ensureTree(q, childId);
    if (!(tree.level >= 6 && tree.given >= settings.levelNeeds[5])) return { ok: false, reason: "not_ripe" } as const;
    await q.query("update trees set harvested_at = now() where id = $1", [tree.id]);
    await q.query("insert into point_ledger (child_id, delta, reason, ref_type, ref_id) values ($1,$2,'열매 수확 보너스','harvest',$3)", [childId, settings.harvestBonusPoints, tree.id]);
    await q.query("insert into badges (child_id, code) values ($1,'first_tree') on conflict do nothing", [childId]);
    const newTree = await ensureTree(q, childId);
    const n = await one<{ n: number }>(q, "select count(*)::int as n from trees where child_id = $1 and harvested_at is not null", [childId]);
    return { ok: true, bonus: settings.harvestBonusPoints, treeCount: n?.n ?? 1, newTree } as const;
  });
}

/**
 * Takes back what an attendance mission gave when the attendance turns out to be wrong
 * (a mistaken tap). The ledgers stay append-only: the award is cancelled with opposite rows.
 */
async function revokeAttendanceAward(staffId: number | null, childId: number, date: string) {
  await db.tx(async (q) => {
    const rows = await q.query<{ id: number; drops_awarded: number; points_awarded: number; week_start: string }>(
      `select mc.id, mc.drops_awarded, mc.points_awarded, mc.week_start
         from mission_completions mc join missions m on m.id = mc.mission_id
        where mc.child_id = $1 and mc.done_on = $2 and m.kind = 'attendance' and mc.status = 'approved'`,
      [childId, date],
    );
    for (const c of rows) {
      await q.query("update mission_completions set status = 'rejected', reviewed_by = $2, reviewed_at = now() where id = $1", [c.id, staffId]);
      if (c.drops_awarded > 0) {
        await q.query("insert into drop_ledger (child_id, delta, reason, ref_type, ref_id, week_start, staff_id) values ($1,$2,'출석 정정','mission',$3,$4,$5)", [childId, -c.drops_awarded, c.id, c.week_start, staffId]);
      }
      if (c.points_awarded > 0) {
        await q.query("insert into point_ledger (child_id, delta, reason, ref_type, ref_id, staff_id) values ($1,$2,'출석 정정','mission',$3,$4)", [childId, -c.points_awarded, c.id, staffId]);
      }
    }
  });
}

/**
 * Saves attendance. Present or late completes this week's attendance mission; changing to
 * absent or clearing the mark takes that award back. An omitted note keeps the existing one.
 * A null staff id means the child checked in alone by scanning the attendance QR.
 */
export async function recordAttendance(staffId: number | null, childId: number, date: string, status: "present" | "late" | "absent" | null, note?: string) {
  if (status === null) {
    await db.query("delete from attendance where child_id = $1 and date = $2", [childId, date]);
    await revokeAttendanceAward(staffId, childId, date);
    return;
  }
  await db.query(
    `insert into attendance (child_id, date, status, note, staff_id) values ($1,$2,$3,$4,$5)
     on conflict (child_id, date) do update set status = excluded.status, staff_id = excluded.staff_id,
       note = case when $6::boolean then excluded.note else attendance.note end`,
    [childId, date, status, note ?? null, staffId, note !== undefined],
  );
  if (status === "absent") await revokeAttendanceAward(staffId, childId, date);
  else await autoComplete(childId, "attendance", { byStaffId: staffId ?? undefined, date });
}
