import "server-only";
import { db, one, type Queryable } from "./db";
import { dropCapForWeek, extraAttendanceDay, parseEventPeriod, type EventPeriod } from "./event";
import { openMissions, ROTATING_PER_WEEK_DEFAULT, verseContents, verseKey, versePeriod } from "./plan";
import { isSunday, todayKst, weekStart } from "./time";
import type { Mission, Tree, Verse } from "./types";

/**
 * Drops grow the tree; points are the record that becomes 달란트 at year end.
 * Rules (confirmed in the plan): 12 drops a week at most (an admin can change the number, and set
 * a higher one for the weeks of an event period), 40 drops per tree (2,4,6,8,10,10),
 * trees never wither, nothing is lost by resting.
 */
export interface Settings {
  weeklyDropCap: number;
  levelNeeds: number[];
  classGoal: number;
  harvestBonusPoints: number;
  /** Given once to a child who comes back after missing two Sundays in a row; not part of the weekly cap. */
  welcomeBackDrops: number;
  /** How many rotating missions are picked for a week when nobody chooses them by hand. */
  rotatingPerWeek: number;
  /** 행사 기간 (src/lib/event.ts): extra attendance days and a higher weekly cap, or null when none is set. */
  event: EventPeriod | null;
}

/** The weekly drop cap of the week that starts on `ws`: the usual one, or the event period's. */
export function weekCap(settings: Settings, ws: string): number {
  return dropCapForWeek(settings.weeklyDropCap, settings.event, ws);
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
    rotatingPerWeek: Number(m.get("rotating_per_week") ?? ROTATING_PER_WEEK_DEFAULT),
    event: parseEventPeriod(m.get("event_period")),
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

/**
 * Makes everything that changes one child's drops, points or tree wait its turn: two quick taps,
 * or a teacher and the child at the same moment, run one after the other instead of both seeing
 * "not done yet". Call it first inside the transaction.
 */
export async function lockChild(q: Queryable, childId: number): Promise<void> {
  await q.query("select id from children where id = $1 for update", [childId]);
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
  /** A teacher looked at the child's latest try (a photo or a request to check) and asked for it again. */
  returned: boolean;
  /** Verse missions: the verses to copy now (this week's, for a fixed mission). Null when there is nothing to write. */
  verse_list: Verse[] | null;
  /** Verse missions: how many of those verses the child has already written this time round. */
  verse_done: number;
}

function matchesTarget(m: Mission, child: { class_id: number | null; grade: number | null }): boolean {
  if (m.target_class_id !== null && m.target_class_id !== child.class_id) return false;
  if (m.target_grade !== null && m.target_grade !== child.grade) return false;
  return true;
}

/**
 * The missions a child can see on `date`, in the order of the plan (fixed, rotating, dated), each
 * with where the child stands. A fixed verse mission whose verses for the week are not entered yet
 * is left out. For a verse mission `verse_ref` is the reference of the verses to write now.
 */
export async function missionsForChild(q: Queryable, childId: number, date: string = todayKst()): Promise<MissionForChild[]> {
  const ws = weekStart(date);
  const child = await one<{ class_id: number | null; grade: number | null }>(
    q,
    "select c.class_id, k.grade from children c left join classes k on k.id = c.class_id where c.id = $1",
    [childId],
  );
  if (!child) return [];
  const missions = (await openMissions(q, date)).filter((m) => matchesTarget(m, child));
  // Every try, oldest first, including the ones sent back: the latest one decides `returned`.
  const tries = await q.query<{ mission_id: number; status: string; done_on: string; week_start: string }>(
    "select mission_id, status, done_on, week_start from mission_completions where child_id = $1 order by id",
    [childId],
  );
  const verseMissions = missions.filter((m) => m.kind === "verse");
  const contents = verseMissions.length > 0 ? await verseContents(q, verseMissions, ws) : null;
  const progress =
    verseMissions.length > 0
      ? await q.query<{ mission_id: number; period: string; done: number; done_key: string }>("select mission_id, period, done, done_key from verse_progress where child_id = $1", [childId])
      : [];
  const settings = await getSettings(q);
  const earned = await weekDropsEarned(q, childId, ws);
  const room = Math.max(0, weekCap(settings, ws) - earned);
  // On an extra attendance day of the event period the attendance mission is open once more, for that day.
  const extraDay = extraAttendanceDay(settings.event, date);
  const out: MissionForChild[] = [];
  for (const m of missions) {
    const all = tries.filter((d) => d.mission_id === m.id);
    const mine = all.filter((d) => d.status !== "rejected");
    const week = mine.filter((d) => d.week_start === ws);
    const today = mine.filter((d) => d.done_on === date);
    let state: MissionState = "available";
    if (m.repeat === "once" && mine.length > 0) state = mine.some((d) => d.status === "pending") ? "pending" : "done";
    else if (m.repeat === "weekly" && m.kind === "attendance" && m.qr_code !== null && extraDay) state = today.length > 0 ? "done" : "available";
    else if (m.repeat === "weekly" && week.length > 0) state = week.some((d) => d.status === "pending") ? "pending" : "done";
    else if (m.repeat === "daily") {
      const limit = m.weekly_limit ?? 7;
      // Today's try may still be waiting for a teacher (a daily photo mission): that is not "done" yet.
      if (today.some((d) => d.status === "pending")) state = "pending";
      else if (today.length > 0 || week.length >= limit) state = "done";
    }

    // Only photos and requests to check are sent back by a teacher. An attendance correction also
    // marks its completion 'rejected', but that is the teacher fixing a tap, not asking the child for anything.
    let returned = false;
    if (state === "available" && (m.kind === "photo" || m.kind === "teacher")) {
      const period = m.repeat === "once" ? all : m.repeat === "weekly" ? all.filter((d) => d.week_start === ws) : all.filter((d) => d.done_on === date);
      returned = period.length > 0 && period[period.length - 1].status === "rejected";
    }

    let verseList: Verse[] | null = null;
    let verseRef = m.verse_ref;
    let verseDone = 0;
    if (m.kind === "verse") {
      const content = contents?.get(m.id) ?? null;
      if (!content && m.mode === "fixed") continue;
      if (content) {
        verseList = content.verses;
        verseRef = content.ref;
        const period = versePeriod(m.repeat, date);
        const p = progress.find((x) => x.mission_id === m.id && x.period === period);
        if (p && p.done > 0 && p.done < content.verses.length && p.done_key === verseKey(content.verses, p.done)) verseDone = p.done;
      }
    }
    out.push({ ...m, verse_ref: verseRef, state, drops_now: Math.min(m.drops, room), done_this_week: week.length, returned, verse_list: verseList, verse_done: verseDone });
  }
  return out;
}

/**
 * Gives the drops (up to the weekly cap) and points for an approved completion.
 *
 * When an earlier completion of the same mission on the same day was taken back (an attendance
 * mark corrected and then set again), the child may still hold some of those drops: only what was
 * actually taken back is given again, so one attendance never adds up to more than the mission's
 * drops. `drops_awarded` records the whole amount this completion now stands for.
 */
async function award(q: Queryable, completionId: number): Promise<{ drops: number; points: number }> {
  const c = await one<{ child_id: number; mission_id: number; done_on: string; week_start: string; drops: number; points: number; title: string }>(
    q,
    `select mc.child_id, mc.mission_id, mc.done_on, mc.week_start, m.drops, m.points, m.title
       from mission_completions mc join missions m on m.id = mc.mission_id where mc.id = $1`,
    [completionId],
  );
  if (!c) throw new Error("completion not found");
  const settings = await getSettings(q);
  const earned = await weekDropsEarned(q, c.child_id, c.week_start);
  const held = await one<{ n: number }>(
    q,
    `select coalesce(sum(d.delta),0)::int as n
       from drop_ledger d join mission_completions mc on mc.id = d.ref_id
      where d.ref_type = 'mission' and d.child_id = $1 and mc.child_id = $1 and mc.mission_id = $2 and mc.done_on = $3
        and mc.status = 'rejected' and mc.id <> $4`,
    [c.child_id, c.mission_id, c.done_on, completionId],
  );
  const kept = Math.max(0, held?.n ?? 0);
  const drops = Math.max(0, Math.min(c.drops - kept, weekCap(settings, c.week_start) - earned));
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
  await q.query("update mission_completions set drops_awarded = $2, points_awarded = $3 where id = $1", [completionId, drops + kept, c.points]);
  return { drops, points: c.points };
}

export type CompleteResult =
  | { ok: true; status: "approved" | "pending"; drops: number; points: number; completionId: number }
  | { ok: false; reason: "not_found" | "not_available" | "already_done" | "invalid" };

export interface CompleteInput {
  text?: string;
  photoUrl?: string;
  byStaffId?: number;
  date?: string;
  auto?: boolean;
  viaQr?: string;
  verified?: boolean;
}

/** Records the completion of a mission already looked up for this child. The child must be locked. */
async function finishMission(q: Queryable, childId: number, m: MissionForChild, input: CompleteInput, date: string): Promise<CompleteResult> {
  if (m.state !== "available") return { ok: false, reason: "already_done" };
  // A child cannot finish these directly: they are completed by a teacher or by the action they belong to.
  const indirect = m.kind === "attendance" || m.kind === "qr" || m.kind === "teacher" || m.kind === "worry" || m.kind === "comment";
  const scanned = (m.kind === "qr" || m.kind === "attendance") && typeof input.viaQr === "string" && input.viaQr !== "" && m.qr_code !== null && input.viaQr === m.qr_code;
  if (indirect && m.kind !== "teacher" && !input.byStaffId && !input.auto && !scanned) return { ok: false, reason: "not_available" };
  // Quizzes, games and verses count only after the server has checked the answers, the game token or the writing.
  if ((m.kind === "quiz" || m.kind === "game" || m.kind === "verse") && !input.byStaffId && input.verified !== true) return { ok: false, reason: "not_available" };
  if (m.kind === "text" && !input.byStaffId && !(input.text ?? "").trim()) return { ok: false, reason: "invalid" };
  const needsReview = (m.kind === "photo" || m.kind === "teacher") && !input.byStaffId;
  const status = needsReview ? "pending" : "approved";
  const rows = await q.query<{ id: number }>(
    `insert into mission_completions (mission_id, child_id, status, text_content, photo_url, done_on, week_start, entered_by_staff_id, reviewed_by, reviewed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$8, case when $8::int is null then null else now() end) returning id`,
    [m.id, childId, status, m.kind === "verse" ? null : (input.text ?? null), input.photoUrl ?? null, date, weekStart(date), input.byStaffId ?? null],
  );
  const id = rows[0].id;
  if (status === "pending") return { ok: true, status, drops: 0, points: 0, completionId: id };
  const a = await award(q, id);
  return { ok: true, status, ...a, completionId: id };
}

/** completeMission inside a transaction that is already open (see completeMission for the rules). */
export async function completeMissionIn(q: Queryable, childId: number, missionId: number, input: CompleteInput = {}): Promise<CompleteResult> {
  const date = input.date ?? todayKst();
  await lockChild(q, childId);
  const m = (await missionsForChild(q, childId, date)).find((x) => x.id === missionId);
  if (!m) return { ok: false, reason: "not_found" };
  return finishMission(q, childId, m, input, date);
}

/**
 * Records that a child did a mission. Photo and teacher-check missions wait for a teacher
 * unless a teacher enters them on the child's behalf (children without a phone).
 *
 * - `viaQr`: the code the child scanned. It lets a child finish a 'qr' mission (or an attendance
 *   mission set up for QR self check-in) only when it equals that mission's own qr_code.
 * - `verified`: the caller has already checked the work on the server (quiz answers scored from the
 *   recorded attempt, a game start token, or every verse of a verse mission compared with what the
 *   child wrote). Quiz, game and verse missions need it; it must never be set from something the
 *   browser merely claims.
 *
 * The child is locked for the length of the transaction, so two requests arriving together
 * cannot both find the mission still open.
 */
export async function completeMission(childId: number, missionId: number, input: CompleteInput = {}): Promise<CompleteResult> {
  return db.tx((q) => completeMissionIn(q, childId, missionId, input));
}

export async function reviewCompletion(staffId: number, completionId: number, approve: boolean): Promise<boolean> {
  return db.tx(async (q) => {
    // The completion first, then the child: two teachers deciding at once take turns here.
    const c = await one<{ status: string; child_id: number }>(q, "select status, child_id from mission_completions where id = $1 for update", [completionId]);
    if (!c || c.status !== "pending") return false;
    await lockChild(q, c.child_id);
    await q.query("update mission_completions set status = $2, reviewed_by = $3, reviewed_at = now() where id = $1", [completionId, approve ? "approved" : "rejected", staffId]);
    if (approve) await award(q, completionId);
    return true;
  });
}

async function autoCompleteIn(q: Queryable, childId: number, kind: Mission["kind"], opts: { byStaffId?: number; date?: string }): Promise<CompleteResult | null> {
  const date = opts.date ?? todayKst();
  await lockChild(q, childId);
  const m = (await missionsForChild(q, childId, date)).find((x) => x.kind === kind && x.state === "available");
  if (!m) return null;
  return finishMission(q, childId, m, { byStaffId: opts.byStaffId, date, auto: true }, date);
}

/** Completes the first available mission of a kind (attendance, worry, comment) if one is open this week. */
export async function autoComplete(childId: number, kind: Mission["kind"], opts: { byStaffId?: number; date?: string } = {}): Promise<CompleteResult | null> {
  return db.tx((q) => autoCompleteIn(q, childId, kind, opts));
}

export type WaterResult =
  | { ok: true; tree: Tree; leveledUp: boolean; ripe: boolean; drops: number }
  | { ok: false; reason: "no_drops" | "ripe" };

export async function waterTree(childId: number): Promise<WaterResult> {
  return db.tx(async (q) => {
    await lockChild(q, childId);
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
    await lockChild(q, childId);
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
 *
 * Drops are taken back only as far as the child still has them: watered drops stay in the tree and
 * the balance never goes below zero. Points are taken back in full. The child must be locked.
 */
async function revokeAttendanceAward(q: Queryable, staffId: number | null, childId: number, date: string) {
  const rows = await q.query<{ id: number; drops_awarded: number; points_awarded: number; week_start: string }>(
    `select mc.id, mc.drops_awarded, mc.points_awarded, mc.week_start
       from mission_completions mc join missions m on m.id = mc.mission_id
      where mc.child_id = $1 and mc.done_on = $2 and m.kind = 'attendance' and mc.status = 'approved'
      order by mc.id`,
    [childId, date],
  );
  for (const c of rows) {
    await q.query("update mission_completions set status = 'rejected', reviewed_by = $2, reviewed_at = now() where id = $1", [c.id, staffId]);
    const take = Math.min(c.drops_awarded, Math.max(0, await dropBalance(q, childId)));
    if (take > 0) {
      await q.query("insert into drop_ledger (child_id, delta, reason, ref_type, ref_id, week_start, staff_id) values ($1,$2,'출석 정정','mission',$3,$4,$5)", [childId, -take, c.id, c.week_start, staffId]);
    }
    if (c.points_awarded > 0) {
      await q.query("insert into point_ledger (child_id, delta, reason, ref_type, ref_id, staff_id) values ($1,$2,'출석 정정','mission',$3,$4)", [childId, -c.points_awarded, c.id, staffId]);
    }
  }
}

/* ---------- welcome-back drops ("반가워 물방울") ---------- */

/** Welcome-back drops the child holds for the Sunday `date` (what was given minus what was taken back). */
async function welcomeHeld(q: Queryable, childId: number, date: string): Promise<number> {
  const r = await one<{ n: number }>(q, "select coalesce(sum(delta),0)::int as n from drop_ledger where child_id = $1 and ref_type = 'welcome' and week_start = $2", [childId, date]);
  return r?.n ?? 0;
}

/**
 * A child who is here on Sunday `date` after missing the two Sundays before it gets the
 * welcome-back drops. They are a greeting, not a mission: they sit outside the weekly cap.
 *
 * - The two Sundays looked at are the two most recent earlier Sundays on which attendance was
 *   taken at all (at least one mark for anyone), counting only Sundays since the child was
 *   registered. A new child, and the first weeks of the app, therefore never get them.
 * - "Missed" means no present or late mark for the child: marked absent, or not marked.
 * - At most once per Sunday: only what the child does not already hold for that Sunday is given.
 *
 * The child must be locked. Returns the drops given now.
 */
async function grantWelcomeBack(q: Queryable, childId: number, date: string): Promise<number> {
  if (!isSunday(date)) return 0;
  const { welcomeBackDrops } = await getSettings(q);
  if (!(welcomeBackDrops > 0)) return 0;
  const child = await one<{ joined: string }>(q, "select (created_at at time zone 'Asia/Seoul')::date as joined from children where id = $1", [childId]);
  if (!child) return 0;
  const sundays = await q.query<{ date: string }>(
    "select distinct date from attendance where date < $1 and date >= $2 and extract(dow from date) = 0 order by date desc limit 2",
    [date, child.joined],
  );
  if (sundays.length < 2) return 0;
  const came = await one(q, "select 1 as x from attendance where child_id = $1 and date in ($2, $3) and status in ('present','late') limit 1", [childId, sundays[0].date, sundays[1].date]);
  if (came) return 0;
  const give = welcomeBackDrops - (await welcomeHeld(q, childId, date));
  if (give <= 0) return 0;
  await q.query("insert into drop_ledger (child_id, delta, reason, ref_type, week_start) values ($1,$2,'반가워 물방울','welcome',$3)", [childId, give, date]);
  return give;
}

/** Takes the welcome-back drops of that Sunday back, as far as the child still has them. The child must be locked. */
async function revokeWelcomeBack(q: Queryable, staffId: number | null, childId: number, date: string) {
  const held = await welcomeHeld(q, childId, date);
  const take = Math.min(held, Math.max(0, await dropBalance(q, childId)));
  if (take > 0) {
    await q.query("insert into drop_ledger (child_id, delta, reason, ref_type, week_start, staff_id) values ($1,$2,'출석 정정','welcome',$3,$4)", [childId, -take, date, staffId]);
  }
}

/**
 * For the child's home screen: welcome-back drops given today (Korea time) that the child still
 * holds and has not watered with yet. 0 once the child waters the tree or the day is over.
 */
export async function welcomeBackToday(q: Queryable, childId: number, today: string = todayKst()): Promise<number> {
  const given = await one<{ id: number; week_start: string }>(
    q,
    `select id, week_start from drop_ledger
      where child_id = $1 and ref_type = 'welcome' and delta > 0
        and created_at >= ($2::date)::timestamp at time zone 'Asia/Seoul'
        and created_at < ($2::date + 1)::timestamp at time zone 'Asia/Seoul'
      order by id desc limit 1`,
    [childId, today],
  );
  if (!given) return 0;
  const watered = await one(q, "select 1 as x from drop_ledger where child_id = $1 and ref_type = 'tree' and id > $2 limit 1", [childId, given.id]);
  if (watered) return 0;
  return Math.max(0, await welcomeHeld(q, childId, given.week_start));
}

/**
 * Saves attendance. Present or late completes this week's attendance mission and, for a child
 * coming back after two missed Sundays, gives the welcome-back drops; changing to absent or
 * clearing the mark takes both back. An omitted note keeps the existing one.
 * A null staff id means the child checked in alone by scanning the attendance QR.
 *
 * `markOnly`: write the mark without completing an attendance mission. The QR scan uses it: the scan
 * has already completed the mission that owns the code, and must not also finish another attendance
 * mission that happens to be open on the same day (that one is for the teacher's roll call).
 *
 * This function does not ask what day it is: the teacher's screen (saveAttendance) and the QR scan
 * (scanQr) are the ones that keep attendance to Sundays.
 */
export async function recordAttendance(staffId: number | null, childId: number, date: string, status: "present" | "late" | "absent" | null, note?: string, opts: { markOnly?: boolean } = {}) {
  await db.tx(async (q) => {
    await lockChild(q, childId);
    if (status === null) {
      await q.query("delete from attendance where child_id = $1 and date = $2", [childId, date]);
    } else {
      await q.query(
        `insert into attendance (child_id, date, status, note, staff_id) values ($1,$2,$3,$4,$5)
         on conflict (child_id, date) do update set status = excluded.status, staff_id = excluded.staff_id,
           note = case when $6::boolean then excluded.note else attendance.note end`,
        [childId, date, status, note ?? null, staffId, note !== undefined],
      );
    }
    if (status === null || status === "absent") {
      await revokeAttendanceAward(q, staffId, childId, date);
      await revokeWelcomeBack(q, staffId, childId, date);
      return;
    }
    if (!opts.markOnly) await autoCompleteIn(q, childId, "attendance", { byStaffId: staffId ?? undefined, date });
    await grantWelcomeBack(q, childId, date);
  });
}
