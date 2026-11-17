import "server-only";
import { canWriteVisits, detailScope, worryCondition } from "@/lib/authz";
import { db, one } from "@/lib/db";
import { getSettings } from "@/lib/game";
import { addDays, todayKst, weekLabel, weekStart } from "@/lib/time";
import type { Staff, WorryAudience } from "@/lib/types";
import { attendanceScope, hasScope, scopeSql } from "./access";
import { uncheckedCount } from "./attendance";
import { joinersToSettle, longAbsent } from "./children";
import { overduePending, pendingCompletions, reportedComments, type Overdue } from "./review";
import { isDate } from "./util";

/**
 * Everything the teacher home (phones) and dashboard (wide screens) show.
 * All numbers follow the teacher's detail scope from lib/authz: a homeroom teacher gets their own
 * classes, 부장 and 교역자 get every class, and a teacher without a class (교사 기본) gets none.
 * Worries are counted only through worryCondition, so a worry the child did not address to this
 * teacher never adds to a number here.
 */

/** class = a homeroom teacher's own classes, all = the whole department, none = no class to look after. */
export type HomeKind = "class" | "all" | "none";

export function homeKind(staff: Staff): HomeKind {
  const scope = detailScope(staff);
  return scope === null ? "all" : scope.length > 0 ? "class" : "none";
}

/* ---------- which week ---------- */

export interface WeekRef {
  /** The week's Sunday. */
  start: string;
  /** '11월 3주차' */
  label: string;
  /** True for the week we are in. */
  current: boolean;
  /** Sunday of the week before, for the ‹ button. */
  prev: string | null;
  /** Sunday of the week after; null on the current week (there is no going into the future). */
  next: string | null;
}

const MAX_WEEKS_BACK = 104;

/** Reads a `?w=YYYY-MM-DD` value. Anything that is not a date in the past two years means this week. */
export function resolveWeek(param: unknown, today: string = todayKst()): WeekRef {
  const thisWeek = weekStart(today);
  const oldest = addDays(thisWeek, -7 * MAX_WEEKS_BACK);
  let start = thisWeek;
  if (isDate(param)) {
    const ws = weekStart(param);
    if (ws <= thisWeek && ws >= oldest) start = ws;
  }
  return { start, label: weekLabel(start), current: start === thisWeek, prev: start > oldest ? addDays(start, -7) : null, next: start < thisWeek ? addDays(start, 7) : null };
}

/* ---------- per class ---------- */

export interface ClassStat {
  id: number;
  name: string;
  /** '5-2' for '5학년 2반'; the full name when it has another shape. */
  short: string;
  /** Children in the class now. */
  kids: number;
  /** Children with an attendance mark on the week's Sunday. */
  recorded: number;
  /** Of those, the ones who came (late counts). */
  present: number;
  /** Drops the class earned from missions that week. */
  drops: number;
  /** Missions approved that week. */
  approved: number;
}

export type Totals = Pick<ClassStat, "kids" | "recorded" | "present" | "drops" | "approved">;

export function shortClassName(name: string): string {
  const m = /^(\d+)학년\s*(\d+)반$/.exec(name.trim());
  return m ? `${m[1]}-${m[2]}` : name;
}

/** One row per class in the teacher's detail scope, for the week that starts on `ws`. */
export async function classStats(staff: Staff, ws: string): Promise<ClassStat[]> {
  const sc = scopeSql(detailScope(staff), "k.id", 2);
  const rows = await db.query<Omit<ClassStat, "short">>(
    `select k.id, k.name,
            (select count(*)::int from children c where c.class_id = k.id and c.active) as kids,
            (select count(*)::int from attendance a join children c on c.id = a.child_id where c.class_id = k.id and c.active and a.date = $1) as recorded,
            (select count(*)::int from attendance a join children c on c.id = a.child_id where c.class_id = k.id and c.active and a.date = $1 and a.status in ('present','late')) as present,
            (select coalesce(sum(d.delta),0)::int from drop_ledger d join children c on c.id = d.child_id where c.class_id = k.id and c.active and d.week_start = $1 and d.ref_type = 'mission') as drops,
            (select count(*)::int from mission_completions mc join children c on c.id = mc.child_id where c.class_id = k.id and c.active and mc.week_start = $1 and mc.status = 'approved') as approved
       from classes k
      where not k.archived and ${sc.sql}
      order by k.sort, k.id`,
    [ws, ...sc.params],
  );
  return rows.map((r) => ({ ...r, short: shortClassName(r.name) }));
}

export function sumStats(list: ClassStat[]): Totals {
  const t: Totals = { kids: 0, recorded: 0, present: 0, drops: 0, approved: 0 };
  for (const c of list) {
    t.kids += c.kids;
    t.recorded += c.recorded;
    t.present += c.present;
    t.drops += c.drops;
    t.approved += c.approved;
  }
  return t;
}

/**
 * How big a class's tree stands in the picture: the more of the weekly goal the class has
 * gathered, the bigger. 1 = seed (nothing yet) … 6 = fruit (goal reached).
 */
export function forestLevel(drops: number, goal: number): number {
  if (drops <= 0 || goal <= 0) return 1;
  const r = drops / goal;
  if (r >= 1) return 6;
  if (r >= 0.85) return 5;
  if (r >= 0.6) return 4;
  if (r >= 1 / 3) return 3;
  return 2;
}

/* ---------- trees in the picture ---------- */

export interface KidTree {
  id: number;
  name: string;
  level: number;
}

/** Every child in the teacher's detail scope with the level of the tree they are growing. */
async function scopeTrees(staff: Staff): Promise<KidTree[]> {
  const sc = scopeSql(detailScope(staff), "c.class_id", 1);
  return db.query<KidTree>(
    `select c.id, c.name, coalesce(t.level, 1)::int as level
       from children c left join trees t on t.child_id = c.id and t.harvested_at is null
      where c.active and ${sc.sql}
      order by c.name, c.id`,
    sc.params,
  );
}

/**
 * At most `max` trees for the picture, keeping the widest range of sizes: all of them when they
 * fit, otherwise evenly spaced picks from smallest to biggest (both ends included). Sorted small to big.
 */
export function pickTrees<T extends { level: number }>(trees: T[], max = 8): T[] {
  const sorted = [...trees].sort((a, b) => a.level - b.level);
  if (sorted.length <= max) return sorted;
  return Array.from({ length: max }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (max - 1))]);
}

/* ---------- things waiting ---------- */

export interface UnreadWorry {
  id: number;
  child_name: string;
  audience: WorryAudience;
}

/** Worries this teacher may read and has not opened yet, newest first. Never the text. */
export async function unreadWorries(staff: Staff): Promise<UnreadWorry[]> {
  const cond = worryCondition(staff, 2);
  return db.query<UnreadWorry>(
    `select w.id, c.name as child_name, w.audience
       from worries w join children c on c.id = w.child_id
      where w.deleted_at is null and ${cond.sql}
        and not exists (select 1 from worry_reads r where r.worry_id = w.id and r.staff_id = $1)
      order by w.created_at desc, w.id desc`,
    [staff.id, ...cond.params],
  );
}

/** Children in scope who have joined (set up their card), and how many of them did a mission in the week. */
async function participation(staff: Staff, ws: string): Promise<{ joined: number; did: number }> {
  const sc = scopeSql(detailScope(staff), "c.class_id", 2);
  const r = await one<{ joined: number; did: number }>(
    db,
    `select count(*) filter (where c.onboarded_at is not null)::int as joined,
            count(*) filter (where exists (select 1 from mission_completions mc where mc.child_id = c.id and mc.week_start = $1 and mc.status <> 'rejected'))::int as did
       from children c
      where c.active and ${sc.sql}`,
    [ws, ...sc.params],
  );
  return r ?? { joined: 0, did: 0 };
}

export interface AbsentKid {
  id: number;
  name: string;
  class_name: string | null;
  weeks: number;
  /** This teacher may write a visit note for the child. */
  canWriteVisit: boolean;
}

export interface HomeData {
  kind: HomeKind;
  /** The week chosen with ?w=. */
  week: WeekRef;
  /** Sunday of the week we are in: the most recent Sunday. */
  thisWeek: string;
  /** The class goal from the settings, and the goal for everything in scope (one goal per class). */
  classGoal: number;
  goal: number;
  /** This week, one row per class in scope, and their sum. */
  classes: ClassStat[];
  totals: Totals;
  /** How many came the Sunday before; null when nothing was recorded then. */
  lastWeekPresent: number | null;
  /** Children in scope. Each is growing a tree. */
  trees: number;
  /** A homeroom teacher's children with their tree levels (empty for the other kinds). */
  kidTrees: KidTree[];
  participants: { joined: number; did: number };
  /** Mission submissions waiting for this teacher. */
  pending: { total: number; photos: number };
  /** For teachers who see every class: submissions that have waited three days or more (a homeroom teacher has not looked). */
  overdue: Overdue;
  /** Reported comments (any teacher may handle them). */
  reports: number;
  /** Unread worries addressed to this teacher. */
  worries: UnreadWorry[];
  /** Children absent two or more recorded Sundays in a row. */
  absent: AbsentKid[];
  /** Children who registered themselves and still need a class or a consent form (teachers who see every class only). */
  joiners: number;
  /** May take attendance for at least one class, and how many of those children have no mark for the most recent Sunday. */
  canAttend: boolean;
  unchecked: number;
  /** The chosen week's numbers when it is a past week; null on the current week. */
  past: Totals | null;
}

const NO_OVERDUE: Overdue = { count: 0, oldest: null, classes: [] };

export async function homeData(staff: Staff, opts: { week?: unknown; today?: string } = {}): Promise<HomeData> {
  const today = opts.today ?? todayKst();
  const thisWeek = weekStart(today);
  const week = resolveWeek(opts.week, today);
  const kind = homeKind(staff);
  const canAttend = hasScope(attendanceScope(staff));
  const [settings, classes, before, kids, participants, pending, overdue, reports, worries, absent, joiners, unchecked, past] = await Promise.all([
    getSettings(),
    classStats(staff, thisWeek),
    classStats(staff, addDays(thisWeek, -7)),
    scopeTrees(staff),
    participation(staff, thisWeek),
    pendingCompletions(staff),
    kind === "all" ? overduePending(staff, today) : NO_OVERDUE,
    reportedComments(staff),
    unreadWorries(staff),
    longAbsent(staff),
    joinersToSettle(staff),
    canAttend ? uncheckedCount(staff, thisWeek) : 0,
    week.current ? null : classStats(staff, week.start),
  ]);
  const lastWeek = sumStats(before);
  return {
    kind,
    week,
    thisWeek,
    classGoal: settings.classGoal,
    goal: settings.classGoal * classes.length,
    classes,
    totals: sumStats(classes),
    lastWeekPresent: lastWeek.recorded > 0 ? lastWeek.present : null,
    trees: kids.length,
    kidTrees: kind === "class" ? kids : [],
    participants,
    pending: { total: pending.length, photos: pending.filter((p) => p.photo_url).length },
    overdue,
    reports: reports.length,
    worries,
    absent: absent.map((k) => ({ id: k.id, name: k.name, class_name: k.class_name, weeks: k.weeks, canWriteVisit: canWriteVisits(staff, k.class_id) })),
    joiners,
    canAttend,
    unchecked,
    past: past ? sumStats(past) : null,
  };
}
