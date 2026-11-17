import "server-only";
import { createHash } from "node:crypto";
import { one, type Queryable } from "./db";
import { addDays, todayKst, weekStart } from "./time";
import type { Mission, Verse } from "./types";
import { normalizeVerse, parseVerses } from "./verse";

/**
 * The mission plan: which missions are on in a given week.
 *
 * A mission is scheduled in one of three ways (missions.mode):
 *  - dated: between starts_on and ends_on
 *  - fixed: every week, whatever its dates say
 *  - pool:  a rotating mission, on only in the weeks whose rotation plan lists it
 * `active = false` switches any of them off. Everything that asks "is this mission open?" goes
 * through isOpenOn / isOpenInWeek below, so the three ways are decided in one place.
 */

export const ROTATING_PER_WEEK_DEFAULT = 3;
/** The most rotating missions one week may carry (by hand or by the setting). */
export const ROTATING_MAX = 10;

type Scheduled = Pick<Mission, "id" | "active" | "mode" | "starts_on" | "ends_on">;

/** Is the mission open on this day? `rotation` is the rotation plan of the day's week. */
export function isOpenOn(m: Scheduled, date: string, rotation: readonly number[]): boolean {
  if (!m.active) return false;
  if (m.mode === "fixed") return true;
  if (m.mode === "pool") return rotation.includes(m.id);
  return m.starts_on <= date && m.ends_on >= date;
}

/** Is the mission open on at least one day of the week that starts on `ws`? */
export function isOpenInWeek(m: Scheduled, ws: string, rotation: readonly number[]): boolean {
  if (!m.active) return false;
  if (m.mode === "fixed") return true;
  if (m.mode === "pool") return rotation.includes(m.id);
  return m.starts_on <= addDays(ws, 6) && m.ends_on >= ws;
}

export async function rotatingPerWeek(q: Queryable): Promise<number> {
  const r = await one<{ value: unknown }>(q, "select value from settings where key = 'rotating_per_week'");
  const n = Number(r?.value ?? ROTATING_PER_WEEK_DEFAULT);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, ROTATING_MAX) : ROTATING_PER_WEEK_DEFAULT;
}

/**
 * The automatic choice for a week: as many active rotating missions as the setting says, the ones
 * that have rested longest first (never used before anything else; only weeks before this one
 * count), then by the admin's pool order, then by id.
 */
export async function pickRotation(q: Queryable, ws: string): Promise<number[]> {
  const n = await rotatingPerWeek(q);
  if (n === 0) return [];
  const rows = await q.query<{ id: number }>(
    `select m.id,
            (select max(r.week_start) from rotation_weeks r where r.week_start < $1 and m.id = any(r.mission_ids)) as last_used
       from missions m
      where m.active and m.mode = 'pool'
      order by last_used asc nulls first, m.pool_order, m.id
      limit $2`,
    [ws, n],
  );
  return rows.map((r) => r.id);
}

export interface Rotation {
  ids: number[];
  /** Chosen by an admin rather than picked automatically. */
  manual: boolean;
  /** False when `ids` is only what would be picked (a week that has not begun) or nothing was kept. */
  stored: boolean;
}

function ids(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.map(Number).filter((n) => Number.isInteger(n)) : [];
}

/**
 * The rotation plan of the week that starts on `ws`.
 *  - A week with a row: that row.
 *  - This week without a row: picked now and kept (insert, then read, so two requests arriving
 *    together agree on one pick). An empty pick is not kept, so a pool filled later in the week
 *    still gets its turn.
 *  - A later week without a row: what would be picked today; nothing is kept.
 *  - An earlier week without a row: nothing, and no row is made.
 */
export async function rotationPlan(q: Queryable, ws: string, today: string = todayKst()): Promise<Rotation> {
  const read = () => one<{ mission_ids: unknown; manual: boolean }>(q, "select mission_ids, manual from rotation_weeks where week_start = $1", [ws]);
  const row = await read();
  if (row) return { ids: ids(row.mission_ids), manual: row.manual, stored: true };
  const thisWeek = weekStart(today);
  if (ws < thisWeek) return { ids: [], manual: false, stored: false };
  const pick = await pickRotation(q, ws);
  if (ws > thisWeek || pick.length === 0) return { ids: pick, manual: false, stored: false };
  await q.query("insert into rotation_weeks (week_start, mission_ids, manual) values ($1, $2::int[], false) on conflict (week_start) do nothing", [ws, pick]);
  const kept = await read();
  return { ids: kept ? ids(kept.mission_ids) : pick, manual: kept?.manual ?? false, stored: true };
}

/** Ids of the rotating missions that are on in the week that starts on `ws` (see rotationPlan). */
export async function rotationFor(q: Queryable, ws: string, today: string = todayKst()): Promise<number[]> {
  return (await rotationPlan(q, ws, today)).ids;
}

const MODE_RANK = { fixed: 0, pool: 1, dated: 2 } as const;

/** Fixed missions first, then this week's rotating ones in the order of the plan, then dated ones (the week's challenge first). */
function inPlanOrder(list: Mission[], rotation: readonly number[]): Mission[] {
  return [...list].sort((a, b) => {
    if (a.mode !== b.mode) return MODE_RANK[a.mode] - MODE_RANK[b.mode];
    if (a.mode === "pool") return rotation.indexOf(a.id) - rotation.indexOf(b.id) || a.id - b.id;
    if (a.mode === "dated" && a.is_challenge !== b.is_challenge) return a.is_challenge ? -1 : 1;
    return a.id - b.id;
  });
}

/** Every mission that is open on `date`, for everyone (target class and grade are the caller's business). */
export async function openMissions(q: Queryable, date: string, today: string = todayKst()): Promise<Mission[]> {
  const rotation = await rotationFor(q, weekStart(date), today);
  const rows = await q.query<Mission>("select * from missions where active and (mode <> 'dated' or (starts_on <= $1 and ends_on >= $1))", [date]);
  return inPlanOrder(rows.filter((m) => isOpenOn(m, date, rotation)), rotation);
}

/** Every mission that is open on at least one day of the week that starts on `ws`. */
export async function weekMissions(q: Queryable, ws: string, today: string = todayKst()): Promise<Mission[]> {
  const rotation = await rotationFor(q, ws, today);
  const rows = await q.query<Mission>("select * from missions where active and (mode <> 'dated' or (starts_on <= $2 and ends_on >= $1))", [ws, addDays(ws, 6)]);
  return inPlanOrder(rows.filter((m) => isOpenInWeek(m, ws, rotation)), rotation);
}

/* ---------- what a verse mission asks for ---------- */

export interface VerseContent {
  ref: string | null;
  verses: Verse[];
}

/** The verses a mission carries itself: its `verses` list, or the older single `verse_text`. */
export function ownVerses(m: Pick<Mission, "verses" | "verse_text" | "verse_ref">): VerseContent | null {
  const list = parseVerses(m.verses);
  if (list.length > 0) return { ref: m.verse_ref, verses: list };
  const text = (m.verse_text ?? "").replace(/\s+/g, " ").trim();
  return text ? { ref: m.verse_ref, verses: [{ n: null, text }] } : null;
}

/**
 * What each verse mission asks for in the week that starts on `ws`. A fixed verse mission
 * ("이번 주 말씀 쓰기") has different verses every week, kept in mission_weeks; without a row for the
 * week it has nothing to write and is missing from the result. Other verse missions carry their own.
 */
export async function verseContents(q: Queryable, missions: Mission[], ws: string): Promise<Map<number, VerseContent>> {
  const out = new Map<number, VerseContent>();
  const fixed = missions.filter((m) => m.kind === "verse" && m.mode === "fixed").map((m) => m.id);
  if (fixed.length > 0) {
    const rows = await q.query<{ mission_id: number; verse_ref: string | null; verses: unknown }>(
      "select mission_id, verse_ref, verses from mission_weeks where week_start = $1 and mission_id = any($2::int[])",
      [ws, fixed],
    );
    for (const r of rows) {
      const verses = parseVerses(r.verses);
      if (verses.length > 0) out.set(r.mission_id, { ref: r.verse_ref, verses });
    }
  }
  for (const m of missions) {
    if (m.kind !== "verse" || m.mode === "fixed") continue;
    const own = ownVerses(m);
    if (own) out.set(m.id, own);
  }
  return out;
}

/** The key a child's progress in a verse mission is kept under: this week, today, or once for all. */
export function versePeriod(repeat: Mission["repeat"], date: string): string {
  return repeat === "weekly" ? weekStart(date) : repeat === "daily" ? date : "once";
}

/** Fingerprint of the first `done` verses. Progress counts only while those verses are still the same. */
export function verseKey(verses: Verse[], done: number): string {
  return createHash("sha256")
    .update(JSON.stringify(verses.slice(0, done).map((v) => normalizeVerse(v.text))))
    .digest("hex")
    .slice(0, 16);
}
