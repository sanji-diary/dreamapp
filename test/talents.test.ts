import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { ROLE_PRESETS } from "@/lib/authz";
import { db, resetDbForTests } from "@/lib/db";
import { pointBalance } from "@/lib/game";
import { adjustPoints } from "@/lib/staff/admin-misc";
import { cardToken, childByCard, eventBoard, eventLog, festivalChild, festivalKids, listEvents, previewRows, talentsCsv } from "@/lib/staff/festival";
import { summarize, talentsFor } from "@/lib/talent-math";
import { adjustTalents, closeEvent, createDraft, deleteDraft, kidTalents, lastPayment, openEvent, payTalents, startEvent, talentBalance, undoLastPayment, updateDraft } from "@/lib/talents";
import type { Role, Staff } from "@/lib/types";

async function setup() {
  resetDbForTests();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade, sort) values ('5학년 2반', 5, 1) returning id");
  const A = cls[0].id;
  const mk = async (name: string, role: Role): Promise<Staff> => {
    const p = ROLE_PRESETS[role];
    const r = await db.query<{ id: number }>(
      "insert into staff (name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries) values ($1,$2,$3,$4,$5,$6,$7) returning id",
      [name, role, p.can_attendance, p.can_visits, p.can_approve, p.can_view_all, p.can_read_pastor_worries],
    );
    return { id: r[0].id, name, role, ...p, active: true, class_ids: [] };
  };
  const kid = async (name: string, token: string, points: number, active = true) => {
    const r = await db.query<{ id: number }>("insert into children (name, class_id, qr_token, phone, address, memo, active) values ($1,$2,$3,'010-1111-2222','비밀 주소','비밀 메모',$4) returning id", [name, A, token, active]);
    if (points !== 0) await db.query("insert into point_ledger (child_id, delta, reason) values ($1,$2,'테스트')", [r[0].id, points]);
    return r[0].id;
  };
  return {
    admin: await mk("관리자", "admin"),
    homeroom: await mk("담임", "homeroom"),
    head: await mk("부장", "head"),
    basic: await mk("기본", "basic"),
    rich: await kid("가은", "token-rich", 1249),
    poor: await kid("나은", "token-poor", 9),
    minus: await kid("다은", "token-minus", -30),
    gone: await kid("라은", "token-gone", 500, false),
  };
}

let s: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  s = await setup();
});

/** Creates a draft at `rate` and opens it. */
async function open(rate = 10): Promise<number> {
  const d = await createDraft(s.admin, "2027 달란트 잔치", rate);
  if (!d.ok) throw new Error(d.error);
  const r = await startEvent(s.admin, d.id);
  if (!r.ok) throw new Error(r.error);
  return d.id;
}

describe("conversion", () => {
  it("floors to whole talents and never gives talents for a negative balance", () => {
    expect(talentsFor(1249, 10)).toBe(124);
    expect(talentsFor(1250, 10)).toBe(125);
    expect(talentsFor(9, 10)).toBe(0);
    expect(talentsFor(-30, 10)).toBe(0);
    expect(talentsFor(100, 3)).toBe(33);
    expect(talentsFor(100, 0)).toBe(0);
    expect(talentsFor(100, 1.5)).toBe(0);
  });

  it("summarises total, min, median and max", () => {
    expect(summarize([124, 0, 0])).toEqual({ count: 3, total: 124, min: 0, median: 0, max: 124 });
    expect(summarize([1, 2, 3, 10])).toEqual({ count: 4, total: 16, min: 1, median: 2.5, max: 10 });
    expect(summarize([])).toEqual({ count: 0, total: 0, min: 0, median: 0, max: 0 });
  });
});

describe("drafting", () => {
  it("only an admin can create, change, open or delete an event", async () => {
    for (const st of [s.homeroom, s.head, s.basic]) {
      expect((await createDraft(st, "잔치", 10)).ok).toBe(false);
      expect(await listEvents(st)).toBeNull();
      expect(await previewRows(st)).toBeNull();
    }
    const d = await createDraft(s.admin, "잔치", 10);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    for (const st of [s.homeroom, s.head, s.basic]) {
      expect((await updateDraft(st, d.id, "잔치", 5)).ok).toBe(false);
      expect((await startEvent(st, d.id)).ok).toBe(false);
      expect((await deleteDraft(st, d.id)).ok).toBe(false);
      expect(await eventBoard(st, d.id)).toBeNull();
    }
    expect((await listEvents(s.admin))!.map((e) => e.status)).toEqual(["draft"]);
  });

  it("rejects bad names and rates", async () => {
    expect((await createDraft(s.admin, "  ", 10)).ok).toBe(false);
    for (const rate of [0, -1, 1.5, 10001, Number.NaN]) expect((await createDraft(s.admin, "잔치", rate)).ok).toBe(false);
  });

  it("writes nothing for children while drafting, and the rate can change", async () => {
    const d = await createDraft(s.admin, "잔치", 10);
    if (!d.ok) throw new Error();
    expect((await updateDraft(s.admin, d.id, "잔치", 20)).ok).toBe(true);
    expect(await db.query("select 1 from talent_grants")).toEqual([]);
    expect(await db.query("select 1 from talent_ledger")).toEqual([]);
    expect(await kidTalents(s.rich)).toBeNull();
    expect((await previewRows(s.admin))!.map((r) => [r.name, r.points])).toEqual([
      ["가은", 1249],
      ["나은", 9],
      ["다은", -30],
    ]);
    expect((await deleteDraft(s.admin, d.id)).ok).toBe(true);
    expect(await listEvents(s.admin)).toEqual([]);
  });
});

describe("opening", () => {
  it("snapshots active children with floored talents and leaves points alone", async () => {
    const id = await open(10);
    const grants = await db.query<{ child_id: number; points_at_open: number; talents: number }>("select child_id, points_at_open, talents from talent_grants where event_id = $1 order by child_id", [id]);
    expect(grants).toEqual([
      { child_id: s.rich, points_at_open: 1249, talents: 124 },
      { child_id: s.poor, points_at_open: 9, talents: 0 },
      { child_id: s.minus, points_at_open: -30, talents: 0 },
    ]);
    expect(await pointBalance(db, s.rich)).toBe(1249);
    expect(await talentBalance(db, id, s.rich)).toBe(124);
    const log = await db.query<{ action: string }>("select action from audit_log where action like 'talent_%'");
    expect(log.map((l) => l.action)).toEqual(["talent_event_open"]);
  });

  it("uses the rate saved on the draft, and the rate is fixed afterwards", async () => {
    const d = await createDraft(s.admin, "잔치", 10);
    if (!d.ok) throw new Error();
    await updateDraft(s.admin, d.id, "잔치", 100);
    await startEvent(s.admin, d.id);
    expect(await talentBalance(db, d.id, s.rich)).toBe(12);
    expect((await updateDraft(s.admin, d.id, "잔치", 10)).ok).toBe(false);
    expect((await deleteDraft(s.admin, d.id)).ok).toBe(false);
    expect((await openEvent())!.points_per_talent).toBe(100);
  });

  it("cannot be opened twice, and a second event cannot open while one is open", async () => {
    const id = await open(10);
    expect((await startEvent(s.admin, id)).ok).toBe(false);
    const d2 = await createDraft(s.admin, "두 번째", 5);
    if (!d2.ok) throw new Error();
    expect((await startEvent(s.admin, d2.id)).ok).toBe(false);
    expect(await db.query("select 1 from talent_grants where event_id = $1", [d2.id])).toEqual([]);
    // The index is the last line of defence.
    await expect(db.query("update talent_events set status = 'open' where id = $1", [d2.id])).rejects.toThrow();
    expect((await db.query("select 1 from talent_grants where event_id = $1", [id])).length).toBe(3);
    // After closing the first, the second may open.
    expect((await closeEvent(s.admin, id)).ok).toBe(true);
    expect((await startEvent(s.admin, d2.id)).ok).toBe(true);
    expect((await openEvent())!.id).toBe(d2.id);
  });

  it("two simultaneous opens end with exactly one open event", async () => {
    const a = await createDraft(s.admin, "가", 10);
    const b = await createDraft(s.admin, "나", 10);
    if (!a.ok || !b.ok) throw new Error();
    const rs = await Promise.all([startEvent(s.admin, a.id), startEvent(s.admin, b.id)]);
    expect(rs.filter((r) => r.ok).length).toBe(1);
    expect((await db.query("select 1 from talent_events where status = 'open'")).length).toBe(1);
  });

  it("the snapshot stays the same when points change afterwards", async () => {
    const id = await open(10);
    expect((await adjustPoints(s.admin, s.rich, 5000, "나중에 받은 상")).ok).toBe(true);
    expect((await adjustPoints(s.admin, s.poor, -9, "정정")).ok).toBe(true);
    expect(await pointBalance(db, s.rich)).toBe(6249);
    expect(await talentBalance(db, id, s.rich)).toBe(124);
    expect(await talentBalance(db, id, s.poor)).toBe(0);
    const v = await kidTalents(s.rich);
    expect(v).toMatchObject({ pointsAtOpen: 1249, granted: 124, balance: 124, pointsPerTalent: 10 });
  });
});

describe("payments", () => {
  it("any active teacher may take a payment; the balance goes down by the amount", async () => {
    const id = await open(10);
    const r = await payTalents(s.basic, s.rich, 5, "떡볶이");
    expect(r).toMatchObject({ ok: true, amount: 5, balance: 119, childName: "가은" });
    expect((await payTalents(s.homeroom, s.rich, 19)).ok).toBe(true);
    expect(await talentBalance(db, id, s.rich)).toBe(100);
    const rows = await db.query<{ delta: number; kind: string; reason: string; staff_id: number }>("select delta, kind, reason, staff_id from talent_ledger order by id");
    expect(rows).toEqual([
      { delta: -5, kind: "payment", reason: "떡볶이", staff_id: s.basic.id },
      { delta: -19, kind: "payment", reason: "달란트 잔치 결제", staff_id: s.homeroom.id },
    ]);
    expect(await pointBalance(db, s.rich)).toBe(1249);
  });

  it("refuses bad amounts, unknown or inactive children and inactive teachers", async () => {
    await open(10);
    for (const amount of [0, -3, 1.5, 1001, Number.NaN]) expect((await payTalents(s.basic, s.rich, amount)).ok).toBe(false);
    expect((await payTalents(s.basic, 99999, 1)).ok).toBe(false);
    expect((await payTalents(s.basic, s.gone, 1)).ok).toBe(false);
    expect((await payTalents({ ...s.basic, active: false }, s.rich, 1)).ok).toBe(false);
    expect(await db.query("select 1 from talent_ledger")).toEqual([]);
  });

  it("never lets the balance go below zero", async () => {
    const id = await open(10);
    expect((await payTalents(s.basic, s.poor, 1)).ok).toBe(false);
    const over = await payTalents(s.basic, s.rich, 125);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain("124");
    expect((await payTalents(s.basic, s.rich, 124)).ok).toBe(true);
    expect((await payTalents(s.basic, s.rich, 1)).ok).toBe(false);
    expect(await talentBalance(db, id, s.rich)).toBe(0);
  });

  it("two teachers paying at the same moment cannot overdraw", async () => {
    const id = await open(10);
    const rs = await Promise.all([payTalents(s.basic, s.rich, 100), payTalents(s.homeroom, s.rich, 100), payTalents(s.head, s.rich, 100)]);
    expect(rs.filter((r) => r.ok).length).toBe(1);
    expect(await talentBalance(db, id, s.rich)).toBe(24);
    const many = await Promise.all(Array.from({ length: 30 }, (_, i) => payTalents(i % 2 ? s.basic : s.homeroom, s.rich, 1)));
    expect(many.filter((r) => r.ok).length).toBe(24);
    expect(await talentBalance(db, id, s.rich)).toBe(0);
  });

  it("is refused before the event opens and after it closes", async () => {
    const d = await createDraft(s.admin, "잔치", 10);
    if (!d.ok) throw new Error();
    expect((await payTalents(s.basic, s.rich, 1)).ok).toBe(false);
    await startEvent(s.admin, d.id);
    expect((await payTalents(s.basic, s.rich, 1)).ok).toBe(true);
    expect((await closeEvent(s.homeroom, d.id)).ok).toBe(false);
    expect((await closeEvent(s.admin, d.id)).ok).toBe(true);
    expect((await payTalents(s.basic, s.rich, 1)).ok).toBe(false);
    expect((await undoLastPayment(s.basic)).ok).toBe(false);
    expect((await adjustTalents(s.admin, s.rich, 1, "상")).ok).toBe(false);
    expect((await closeEvent(s.admin, d.id)).ok).toBe(false);
    expect(await talentBalance(db, d.id, s.rich)).toBe(123);
    expect(await kidTalents(s.rich)).toBeNull();
    expect(await festivalKids(s.basic)).toEqual([]);
    const log = await db.query<{ action: string }>("select action from audit_log where action like 'talent_%' order by id");
    expect(log.map((l) => l.action)).toEqual(["talent_event_open", "talent_event_close"]);
  });
});

describe("undo", () => {
  it("cancels the teacher's own last payment with a compensating row, once", async () => {
    const id = await open(10);
    await payTalents(s.basic, s.rich, 10, "첫 번째");
    await payTalents(s.basic, s.rich, 7, "두 번째");
    expect(await lastPayment(s.basic)).toMatchObject({ amount: 7, child_name: "가은" });
    const u = await undoLastPayment(s.basic);
    expect(u).toMatchObject({ ok: true, amount: 7, balance: 114, childId: s.rich });
    // Only the very last payment qualifies; the earlier one stays.
    expect(await lastPayment(s.basic)).toBeNull();
    expect((await undoLastPayment(s.basic)).ok).toBe(false);
    expect(await talentBalance(db, id, s.rich)).toBe(114);
    const rows = await db.query<{ delta: number; kind: string }>("select delta, kind from talent_ledger order by id");
    expect(rows).toEqual([
      { delta: -10, kind: "payment" },
      { delta: -7, kind: "payment" },
      { delta: 7, kind: "undo" },
    ]);
  });

  it("cannot cancel another teacher's payment or one older than five minutes", async () => {
    const id = await open(10);
    await payTalents(s.basic, s.rich, 10);
    expect((await undoLastPayment(s.homeroom)).ok).toBe(false);
    await db.query("update talent_ledger set created_at = now() - interval '6 minutes'");
    expect(await lastPayment(s.basic)).toBeNull();
    expect((await undoLastPayment(s.basic)).ok).toBe(false);
    expect(await talentBalance(db, id, s.rich)).toBe(114);
  });

  it("two simultaneous cancels give the talents back only once", async () => {
    const id = await open(10);
    await payTalents(s.basic, s.rich, 10);
    const rs = await Promise.all([undoLastPayment(s.basic), undoLastPayment(s.basic)]);
    expect(rs.filter((r) => r.ok).length).toBe(1);
    expect(await talentBalance(db, id, s.rich)).toBe(124);
    await expect(db.query("insert into talent_ledger (event_id, child_id, delta, kind, reason, undo_of) select event_id, child_id, 10, 'undo', 'x', id from talent_ledger where kind = 'payment'")).rejects.toThrow();
  });
});

describe("manual adjustment", () => {
  it("admins add or take talents with a reason; it is audited and cannot go below zero", async () => {
    const id = await open(10);
    for (const st of [s.homeroom, s.head, s.basic]) expect((await adjustTalents(st, s.poor, 5, "상")).ok).toBe(false);
    expect((await adjustTalents(s.admin, s.poor, 5, "")).ok).toBe(false);
    expect((await adjustTalents(s.admin, s.poor, 0, "상")).ok).toBe(false);
    expect(await adjustTalents(s.admin, s.poor, 5, "성경 퀴즈 1등")).toEqual({ ok: true, balance: 5 });
    expect((await adjustTalents(s.admin, s.poor, -6, "정정")).ok).toBe(false);
    expect(await adjustTalents(s.admin, s.poor, -2, "정정")).toEqual({ ok: true, balance: 3 });
    expect(await talentBalance(db, id, s.poor)).toBe(3);
    const log = await db.query<{ detail: { delta: number; reason: string } }>("select detail from audit_log where action = 'talent_adjust' order by id");
    expect(log.map((l) => [l.detail.delta, l.detail.reason])).toEqual([
      [5, "성경 퀴즈 1등"],
      [-2, "정정"],
    ]);
  });
});

describe("screens", () => {
  it("the payment screen gets only name, class, photo and balance", async () => {
    await open(10);
    const list = await festivalKids(s.basic);
    expect(list.map((k) => k.name)).toEqual(["가은", "나은", "다은"]);
    expect(Object.keys(list[0]).sort()).toEqual(["class_id", "class_name", "id", "name", "photo_url"]);
    const c = await festivalChild(s.basic, s.rich);
    expect(c).toEqual({ id: s.rich, name: "가은", class_name: "5학년 2반", photo_url: null, balance: 124 });
    expect(await festivalChild(s.basic, s.gone)).toBeNull();
    expect(await festivalChild({ ...s.basic, active: false }, s.rich)).toBeNull();
  });

  it("a scanned card is resolved on the server and returns no token", async () => {
    expect(cardToken("https://forest.example/join/token-rich")).toBe("token-rich");
    expect(cardToken("http://localhost:3112/join/demo-1?x=1")).toBe("demo-1");
    expect(cardToken("  token-rich \n")).toBe("token-rich");
    expect(cardToken("https://evil.example/other/path")).toBeNull();
    expect(cardToken("' or 1=1 --")).toBeNull();
    expect(await childByCard(s.basic, "https://forest.example/join/token-rich")).toBeNull(); // no event open yet
    await open(10);
    const c = await childByCard(s.basic, "https://forest.example/join/token-rich");
    expect(c).toEqual({ id: s.rich, name: "가은", class_name: "5학년 2반", photo_url: null, balance: 124 });
    expect(JSON.stringify(c)).not.toContain("token");
    expect(await childByCard(s.basic, "https://forest.example/join/token-gone")).toBeNull();
    expect(await childByCard(s.basic, "https://forest.example/join/nobody")).toBeNull();
    expect(await childByCard(s.basic, 12345)).toBeNull();
  });

  it("the child sees only their own balance and payments, and only while the event is open", async () => {
    const id = await open(10);
    await payTalents(s.basic, s.rich, 4, "솜사탕");
    await payTalents(s.basic, s.poor, 1);
    await adjustTalents(s.admin, s.poor, 3, "상");
    const mine = await kidTalents(s.rich);
    expect(mine).toMatchObject({ eventName: "2027 달란트 잔치", pointsAtOpen: 1249, granted: 124, balance: 120 });
    expect(mine!.rows.map((r) => [r.delta, r.reason])).toEqual([[-4, "솜사탕"]]);
    expect((await kidTalents(s.poor))!.rows.map((r) => r.delta)).toEqual([3]);
    await closeEvent(s.admin, id);
    expect(await kidTalents(s.rich)).toBeNull();
  });

  it("the admin board and the CSV files add up", async () => {
    const id = await open(10);
    await payTalents(s.basic, s.rich, 10, "떡볶이");
    await payTalents(s.basic, s.rich, 4, "=cmd");
    await undoLastPayment(s.basic);
    await adjustTalents(s.admin, s.poor, 5, "상");
    const board = (await eventBoard(s.admin, id))!;
    expect(board.rows.map((r) => [r.name, r.granted, r.spent, r.adjusted, r.balance])).toEqual([
      ["가은", 124, 10, 0, 114],
      ["나은", 0, 0, 5, 5],
      ["다은", 0, 0, 0, 0],
    ]);
    expect(board.totals).toEqual({ granted: 124, spent: 10, adjusted: 5, balance: 119 });
    expect((await eventLog(s.admin, id))!.map((l) => l.kind)).toEqual(["adjust", "undo", "payment", "payment"]);
    expect(await eventLog(s.basic, id)).toBeNull();
    expect(await talentsCsv(s.homeroom, id, "summary")).toBeNull();
    const summary = (await talentsCsv(s.admin, id, "summary"))!;
    expect(summary.charCodeAt(0)).toBe(0xfeff);
    expect(summary).toContain("5학년 2반,가은,1249,124,10,0,114\r\n");
    expect(summary).toContain("합계,,,124,10,5,119\r\n");
    const log = (await talentsCsv(s.admin, id, "log"))!;
    expect(log.split("\r\n").length).toBe(6 + 0); // header + 4 rows + trailing newline
    expect(log).toContain(",결제,-10,떡볶이,기본");
    expect(log).toContain(",결제,-4,'=cmd,기본"); // formula-looking text is neutralised
    expect(log).toContain(",결제 취소,4,");
    // Still readable after closing.
    await closeEvent(s.admin, id);
    expect((await eventBoard(s.admin, id))!.totals.balance).toBe(119);
  });
});
