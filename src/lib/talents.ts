import "server-only";
import { db, one, type Queryable } from "./db";
import { audit } from "./staff/access";
import { clean, deny, fail, type Result } from "./staff/util";
import { MAX_RATE, MAX_TALENT_AMOUNT, MIN_RATE, UNDO_MINUTES } from "./talent-math";
import type { Staff } from "./types";

/**
 * 달란트 잔치 money rules.
 *
 * - While an event is a draft nothing is written for children; the rate can still change.
 * - Opening snapshots every active child's points into talent_grants in one transaction.
 *   Points are not deducted: they stay as the year's record.
 * - talent_ledger is append-only. Balance = grant + sum(delta). A cancelled payment is a new
 *   row with the opposite amount, never a delete.
 * - Every change to a child's balance first locks that child's row, so two teachers paying at
 *   the same moment are handled one after the other and the balance cannot go below zero.
 * - Admins open, adjust and close. Any active teacher may take payments while an event is open.
 */

export type TalentStatus = "draft" | "open" | "closed";

export interface TalentEvent {
  id: number;
  name: string;
  points_per_talent: number;
  status: TalentStatus;
  opened_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
}

const EVENT_COLS = "id, name, points_per_talent, status, opened_at, closed_at, created_at";
const NO_EVENT = "지금 열린 달란트 잔치가 없어요. 잔치를 마친 뒤에는 결제할 수 없어요";

const isAdmin = (s: Staff) => s.active && s.role === "admin";

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "23505" || /duplicate key|unique constraint/i.test(err?.message ?? "");
}

export async function getEvent(id: number, q: Queryable = db): Promise<TalentEvent | null> {
  return one<TalentEvent>(q, `select ${EVENT_COLS} from talent_events where id = $1`, [id]);
}

/** The event that is open right now, if any. There is never more than one. */
export async function openEvent(q: Queryable = db): Promise<TalentEvent | null> {
  return one<TalentEvent>(q, `select ${EVENT_COLS} from talent_events where status = 'open'`);
}

export async function talentBalance(q: Queryable, eventId: number, childId: number): Promise<number> {
  const r = await one<{ n: number }>(
    q,
    `select (coalesce((select talents from talent_grants where event_id = $1 and child_id = $2), 0)
           + coalesce((select sum(delta) from talent_ledger where event_id = $1 and child_id = $2), 0))::int as n`,
    [eventId, childId],
  );
  return r?.n ?? 0;
}

/* ---------- drafting ---------- */

function checkDraft(name: string, rate: number): Result<{ name: string }> {
  const n = clean(name, 30);
  if (!n) return fail("잔치 이름을 적어 주세요");
  if (!Number.isInteger(rate) || rate < MIN_RATE || rate > MAX_RATE) return fail(`달란트 1개에 필요한 포인트는 ${MIN_RATE}에서 ${MAX_RATE} 사이 숫자로 적어 주세요`);
  return { ok: true, name: n };
}

export async function createDraft(staff: Staff, name: string, rate: number): Promise<Result<{ id: number }>> {
  if (!isAdmin(staff)) return deny;
  const c = checkDraft(name, rate);
  if (!c.ok) return c;
  const rows = await db.query<{ id: number }>("insert into talent_events (name, points_per_talent, created_by) values ($1,$2,$3) returning id", [c.name, rate, staff.id]);
  return { ok: true, id: rows[0].id };
}

/** The name and the rate can change only until the event opens. */
export async function updateDraft(staff: Staff, id: number, name: string, rate: number): Promise<Result> {
  if (!isAdmin(staff)) return deny;
  const c = checkDraft(name, rate);
  if (!c.ok) return c;
  const rows = await db.query("update talent_events set name = $2, points_per_talent = $3 where id = $1 and status = 'draft' returning id", [id, c.name, rate]);
  return rows.length > 0 ? { ok: true } : fail("이미 시작한 잔치는 고칠 수 없어요");
}

/** Only a draft can be removed: nothing has been written for children yet. */
export async function deleteDraft(staff: Staff, id: number): Promise<Result> {
  if (!isAdmin(staff)) return deny;
  const rows = await db.query("delete from talent_events where id = $1 and status = 'draft' returning id", [id]);
  return rows.length > 0 ? { ok: true } : fail("이미 시작한 잔치는 지울 수 없어요");
}

/* ---------- open and close ---------- */

/** Opens a draft: fixes the rate and snapshots every active child's points and talents. */
export async function startEvent(staff: Staff, id: number): Promise<Result<{ children: number; talents: number }>> {
  if (!isAdmin(staff)) return deny;
  const already = fail("이미 열려 있는 달란트 잔치가 있어요. 먼저 그 잔치를 마쳐 주세요");
  try {
    return await db.tx(async (q) => {
      if (await one(q, "select 1 as x from talent_events where status = 'open'")) return already;
      // The unique index refuses a second open event even if two requests get past the check above.
      const ev = await q.query<{ points_per_talent: number; name: string }>(
        "update talent_events set status = 'open', opened_at = now() where id = $1 and status = 'draft' returning points_per_talent, name",
        [id],
      );
      if (ev.length === 0) return fail("시작할 수 있는 잔치가 아니에요");
      const rate = ev[0].points_per_talent;
      const grants = await q.query<{ talents: number }>(
        `insert into talent_grants (event_id, child_id, points_at_open, talents)
         select $1, c.id, p.points, (greatest(p.points, 0) / $2::int)::int
           from children c
          cross join lateral (select coalesce(sum(delta), 0)::int as points from point_ledger where child_id = c.id) p
          where c.active
         returning talents`,
        [id, rate],
      );
      const talents = grants.reduce((a, g) => a + g.talents, 0);
      await audit(q, staff.id, "talent_event_open", "talent_event", id, { name: ev[0].name, points_per_talent: rate, children: grants.length, talents });
      return { ok: true, children: grants.length, talents } as const;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return already;
    throw e;
  }
}

/** Closes the open event. Waits for payments that are being written, then no more are accepted. */
export async function closeEvent(staff: Staff, id: number): Promise<Result> {
  if (!isAdmin(staff)) return deny;
  return db.tx(async (q) => {
    const rows = await q.query("update talent_events set status = 'closed', closed_at = now() where id = $1 and status = 'open' returning id", [id]);
    if (rows.length === 0) return fail("열려 있는 잔치가 아니에요");
    await audit(q, staff.id, "talent_event_close", "talent_event", id);
    return { ok: true } as const;
  });
}

/* ---------- payments ---------- */

/**
 * Inside a transaction: makes sure an event is open (and keeps it from closing until we finish),
 * then locks the child's row so that balance changes for one child happen one at a time.
 */
async function lockOpenEventAndChild(q: Queryable, childId: number, activeOnly: boolean): Promise<Result<{ eventId: number; childName: string }>> {
  const ev = await one<{ id: number }>(q, "select id from talent_events where status = 'open' for share");
  if (!ev) return fail(NO_EVENT);
  const kid = await one<{ name: string }>(q, `select name from children where id = $1 ${activeOnly ? "and active" : ""} for no key update`, [childId]);
  if (!kid) return fail("아이를 찾을 수 없어요");
  return { ok: true, eventId: ev.id, childName: kid.name };
}

const validAmount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_TALENT_AMOUNT;

export type PayResult = Result<{ paymentId: number; childName: string; amount: number; balance: number }>;

/** Takes `amount` talents from a child. Refused when the balance is too small or no event is open. */
export async function payTalents(staff: Staff, childId: number, amount: number, note: string = ""): Promise<PayResult> {
  if (!staff.active) return deny;
  if (!Number.isInteger(childId)) return fail("아이를 찾을 수 없어요");
  if (!validAmount(amount)) return fail(`달란트는 1에서 ${MAX_TALENT_AMOUNT} 사이 숫자로 적어 주세요`);
  const reason = clean(note, 40) || "달란트 잔치 결제";
  return db.tx(async (q) => {
    const lock = await lockOpenEventAndChild(q, childId, true);
    if (!lock.ok) return lock;
    const balance = await talentBalance(q, lock.eventId, childId);
    if (amount > balance) return fail(`달란트가 모자라요. 남은 달란트는 ${balance}개예요`);
    const rows = await q.query<{ id: number }>("insert into talent_ledger (event_id, child_id, delta, kind, reason, staff_id) values ($1,$2,$3,'payment',$4,$5) returning id", [
      lock.eventId,
      childId,
      -amount,
      reason,
      staff.id,
    ]);
    return { ok: true, paymentId: rows[0].id, childName: lock.childName, amount, balance: balance - amount } as const;
  });
}

export interface LastPayment {
  id: number;
  child_id: number;
  child_name: string;
  amount: number;
  reason: string;
  /** Seconds left in which it can still be cancelled. */
  seconds_left: number;
}

const LAST_PAYMENT_SQL = `
  select l.id, l.child_id, c.name as child_name, -l.delta as amount, l.reason,
         greatest(0, ${UNDO_MINUTES * 60} - extract(epoch from (now() - l.created_at)))::int as seconds_left,
         exists (select 1 from talent_ledger u where u.undo_of = l.id) as undone
    from talent_ledger l join children c on c.id = l.child_id
   where l.event_id = $1 and l.staff_id = $2 and l.kind = 'payment'
   order by l.id desc limit 1`;

/** This teacher's most recent payment in the open event, while it can still be cancelled. */
export async function lastPayment(staff: Staff, q: Queryable = db): Promise<LastPayment | null> {
  const ev = await openEvent(q);
  if (!ev) return null;
  const p = await one<LastPayment & { undone: boolean }>(q, LAST_PAYMENT_SQL, [ev.id, staff.id]);
  if (!p || p.undone || p.seconds_left <= 0) return null;
  return { id: p.id, child_id: p.child_id, child_name: p.child_name, amount: p.amount, reason: p.reason, seconds_left: p.seconds_left };
}

export type UndoResult = Result<{ childId: number; childName: string; amount: number; balance: number }>;

/**
 * Cancels the teacher's own most recent payment, within UNDO_MINUTES, by adding a row that gives
 * the talents back. Only the very last payment qualifies and it can be cancelled once.
 */
export async function undoLastPayment(staff: Staff): Promise<UndoResult> {
  if (!staff.active) return deny;
  const gone = fail("취소할 수 있는 결제가 없어요. 결제하고 5분이 지나면 취소할 수 없어요");
  try {
    return await db.tx(async (q) => {
      const ev = await one<{ id: number }>(q, "select id from talent_events where status = 'open' for share");
      if (!ev) return fail(NO_EVENT);
      const p = await one<LastPayment & { undone: boolean }>(q, LAST_PAYMENT_SQL, [ev.id, staff.id]);
      if (!p || p.undone || p.seconds_left <= 0) return gone;
      const lock = await lockOpenEventAndChild(q, p.child_id, false);
      if (!lock.ok) return lock;
      await q.query("insert into talent_ledger (event_id, child_id, delta, kind, reason, undo_of, staff_id) values ($1,$2,$3,'undo',$4,$5,$6)", [
        ev.id,
        p.child_id,
        p.amount,
        `결제 취소: ${p.reason}`.slice(0, 60),
        p.id,
        staff.id,
      ]);
      return { ok: true, childId: p.child_id, childName: p.child_name, amount: p.amount, balance: await talentBalance(q, ev.id, p.child_id) } as const;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return gone;
    throw e;
  }
}

/** A manual correction by an admin (a prize, a mistake). Written to the ledger and the audit log. */
export async function adjustTalents(staff: Staff, childId: number, delta: number, reason: string): Promise<Result<{ balance: number }>> {
  if (!isAdmin(staff)) return deny;
  if (!Number.isInteger(childId)) return fail("아이를 골라 주세요");
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_TALENT_AMOUNT) return fail(`달란트는 0이 아닌 숫자로 적어 주세요 (최대 ${MAX_TALENT_AMOUNT})`);
  const why = clean(reason, 60);
  if (!why) return fail("이유를 적어 주세요");
  return db.tx(async (q) => {
    const lock = await lockOpenEventAndChild(q, childId, false);
    if (!lock.ok) return lock;
    const balance = await talentBalance(q, lock.eventId, childId);
    if (balance + delta < 0) return fail(`남은 달란트보다 많이 뺄 수 없어요. 남은 달란트는 ${balance}개예요`);
    await q.query("insert into talent_ledger (event_id, child_id, delta, kind, reason, staff_id) values ($1,$2,$3,'adjust',$4,$5)", [lock.eventId, childId, delta, why, staff.id]);
    await audit(q, staff.id, "talent_adjust", "child", childId, { event_id: lock.eventId, delta, reason: why });
    return { ok: true, balance: balance + delta } as const;
  });
}

/* ---------- child side ---------- */

export interface KidTalents {
  eventName: string;
  pointsPerTalent: number;
  pointsAtOpen: number;
  granted: number;
  balance: number;
  rows: { id: number; delta: number; kind: "payment" | "undo" | "adjust"; reason: string; created_at: Date }[];
}

/** What one child sees on /me while an event is open: only their own numbers. */
export async function kidTalents(childId: number): Promise<KidTalents | null> {
  const ev = await openEvent();
  if (!ev) return null;
  const [grant, balance, rows] = await Promise.all([
    one<{ points_at_open: number; talents: number }>(db, "select points_at_open, talents from talent_grants where event_id = $1 and child_id = $2", [ev.id, childId]),
    talentBalance(db, ev.id, childId),
    db.query<KidTalents["rows"][number]>("select id, delta, kind, reason, created_at from talent_ledger where event_id = $1 and child_id = $2 order by id desc limit 30", [ev.id, childId]),
  ]);
  return { eventName: ev.name, pointsPerTalent: ev.points_per_talent, pointsAtOpen: grant?.points_at_open ?? 0, granted: grant?.talents ?? 0, balance, rows };
}
