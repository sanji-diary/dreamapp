import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { canReadWorry } from "@/lib/authz";
import { db, one, resetDbForTests } from "@/lib/db";
import { dropBalance, pointBalance } from "@/lib/game";
import { addComment, deleteComment, feedFor, hasRudeWord, reportComment, toggleLike } from "@/lib/kid/feed";
import { callName, formatBirth, formatPhone, ordinal, parseBirth, phoneDigits } from "@/lib/kid/korean";
import { saveNewPin, saveOnboarding, validateOnboarding, type OnboardingInput } from "@/lib/kid/onboarding";
import { attendanceStreak, lockMinutes, weekPoints } from "@/lib/kid/queries";
import { deleteWorry, markRepliesRead, myWorries, submitWorry, unreadReplyCount, worryReaders } from "@/lib/kid/worries";
import { verifyPin } from "@/lib/pin";
import { addDays, todayKst, weekStart } from "@/lib/time";
import type { Staff } from "@/lib/types";

const TODAY = todayKst();
const WS = weekStart(TODAY);

async function setup() {
  resetDbForTests();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade) values ('5학년 2반', 5), ('6학년 1반', 6) returning id");
  const st = await db.query<{ id: number }>(
    "insert into staff (name, role, can_read_pastor_worries) values ('김인성','admin',true), ('박지현','homeroom',false), ('이부장','head',false) returning id",
  );
  await db.query("insert into staff_classes (staff_id, class_id) values ($1,$2)", [st[1].id, cls[0].id]);
  const kids = await db.query<{ id: number }>(
    `insert into children (name, class_id, qr_token, consent_on) values
       ('정시우', $1, 'card-new', $3), ('김하준', $1, 'card-a', $3), ('서준우', $2, 'card-b', $3), ('무동의', $1, 'card-noconsent', null) returning id`,
    [cls[0].id, cls[1].id, TODAY],
  );
  const mission = async (title: string, kind: string, drops: number, points: number) => {
    const r = await db.query<{ id: number }>("insert into missions (title, kind, drops, points, repeat, starts_on, ends_on) values ($1,$2,$3,$4,'weekly',$5,$6) returning id", [title, kind, drops, points, WS, addDays(WS, 6)]);
    return r[0].id;
  };
  return { classId: cls[0].id, otherClassId: cls[1].id, adminId: st[0].id, teacherId: st[1].id, headId: st[2].id, newKid: kids[0].id, kidA: kids[1].id, kidB: kids[2].id, mission };
}

const good: OnboardingInput = {
  name: " 새친구 ",
  birthYear: 2015,
  gender: "M",
  school: " 꿈의숲초등학교 ",
  schoolClass: "5학년 3반",
  hasPhone: true,
  phone: "010-1234-5678",
  guardianPhone: "01098765432",
  address: "꿈동 숲아파트 101동",
  friendId: null,
  friendName: "",
  pin: "4821",
  pin2: "4821",
};

describe("korean helpers", () => {
  it("picks 아 or 야 from the last sound of the given name", () => {
    expect(callName("김하준")).toBe("하준아");
    expect(callName("이서아")).toBe("서아야");
    expect(callName("최지우")).toBe("지우야");
    expect(callName("김솔")).toBe("솔아");
  });
  it("formats and checks phone numbers and birth dates", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(phoneDigits("010-1234-5678")).toBe("01012345678");
    expect(phoneDigits("1234")).toBeNull();
    expect(formatBirth("20150509")).toBe("2015.05.09");
    expect(parseBirth("2015.05.09", "2026-11-17")).toBe("2015-05-09");
    expect(parseBirth("2015.02.30", "2026-11-17")).toBeNull(); // not a real day
    expect(parseBirth("2015.13.01", "2026-11-17")).toBeNull();
    expect(parseBirth("1990.05.09", "2026-11-17")).toBeNull(); // an adult's year
    expect(parseBirth("2026.01.01", "2026-11-17")).toBeNull(); // a baby
    expect(ordinal(1)).toBe("첫 번째");
    expect(ordinal(2)).toBe("두 번째");
  });
});

describe("onboarding", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("accepts a complete answer set and normalizes it", () => {
    const v = validateOnboarding(good, "2026-11-17");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.data).toMatchObject({ name: "새친구", birthYear: 2015, school: "꿈의숲초등학교", phone: "01012345678", guardianPhone: "01098765432", friendId: null, friendName: null });
  });

  it("rejects bad dates, PINs and phone numbers on the server", () => {
    const v = validateOnboarding({ ...good, birthYear: 1999, pin: "12a4", phone: "12345", gender: "X", school: "" }, "2026-11-17");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["birth", "gender", "phone", "pin", "school"]);
    const mismatch = validateOnboarding({ ...good, pin2: "0000" }, "2026-11-17");
    expect(mismatch).toMatchObject({ ok: false, errors: { pin2: expect.any(String) } });
  });

  it("lets a child without a phone skip the number, and skip guardian phone and address", () => {
    const v = validateOnboarding({ ...good, hasPhone: false, phone: "", guardianPhone: "", address: "" }, "2026-11-17");
    expect(v).toMatchObject({ ok: true, data: { hasPhone: false, phone: null, guardianPhone: null, address: null } });
  });

  it("saves everything once, hashes the PIN and plants a tree", async () => {
    await db.query("update children set guardian_phone = '01011112222', address = '선생님이 적은 주소' where id = $1", [s.newKid]);
    const r = await saveOnboarding("card-new", { ...good, guardianPhone: "", address: "", friendId: s.kidA });
    expect(r).toEqual({ ok: true, childId: s.newKid });
    const c = await one<Record<string, unknown>>(db, "select * from children where id = $1", [s.newKid]);
    expect(c).toMatchObject({ name: "새친구", birth_year: 2015, birth_date: null, gender: "M", school: "꿈의숲초등학교", school_class: "5학년 3반", phone: "01012345678", has_phone: true, best_friend_id: s.kidA, best_friend_name: null });
    // Skipped answers keep what the teacher had entered.
    expect(c).toMatchObject({ guardian_phone: "01011112222", address: "선생님이 적은 주소" });
    expect(c!.onboarded_at).not.toBeNull();
    expect(c!.pin_hash).not.toBe("4821");
    expect(await verifyPin("4821", c!.pin_hash as string)).toBe(true);
    expect(await one(db, "select id from trees where child_id = $1 and harvested_at is null", [s.newKid])).not.toBeNull();
    // The same card cannot be registered a second time (someone else holding the card cannot take it over).
    expect(await saveOnboarding("card-new", { ...good, pin: "0000", pin2: "0000" })).toMatchObject({ ok: false, reason: "already" });
    expect(await verifyPin("4821", (await one<{ pin_hash: string }>(db, "select pin_hash from children where id = $1", [s.newKid]))!.pin_hash)).toBe(true);
  });

  it("refuses unknown cards, missing consent, and a friend that is not a real other child", async () => {
    expect(await saveOnboarding("nope", good)).toMatchObject({ ok: false, reason: "not_found" });
    expect(await saveOnboarding("card-noconsent", good)).toMatchObject({ ok: false, reason: "no_consent" });
    expect(await saveOnboarding("card-new", { ...good, friendId: s.newKid })).toMatchObject({ ok: false, reason: "invalid", errors: { friend: expect.any(String) } });
    expect(await saveOnboarding("card-new", { ...good, friendId: 99999 })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await one(db, "select id from children where id = $1 and pin_hash is not null", [s.newKid])).toBeNull();
  });

  it("stores a typed friend name when the friend is not in the list", async () => {
    await saveOnboarding("card-new", { ...good, friendName: " 동네 친구 " });
    expect(await one(db, "select best_friend_id, best_friend_name from children where id = $1", [s.newKid])).toEqual({ best_friend_id: null, best_friend_name: "동네 친구" });
  });

  it("only sets a new PIN for a child who joined before and has no PIN now", async () => {
    expect(await saveNewPin("card-new", "1111", "1111")).toMatchObject({ ok: false, reason: "already" }); // never joined: must do the full setup
    await saveOnboarding("card-new", good);
    expect(await saveNewPin("card-new", "1111", "1111")).toMatchObject({ ok: false, reason: "already" }); // has a PIN
    await db.query("update children set pin_hash = null, pin_locked_until = now() + interval '5 minutes' where id = $1", [s.newKid]);
    expect(await lockMinutes("card-new")).toBeGreaterThan(0);
    expect(await saveNewPin("card-new", "1111", "2222")).toMatchObject({ ok: false, reason: "invalid" });
    expect(await saveNewPin("card-new", "1111", "1111")).toEqual({ ok: true, childId: s.newKid });
    expect(await lockMinutes("card-new")).toBe(0);
  });
});

describe("worries", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });
  const staff = (over: Partial<Staff>): Staff => ({ id: 1, name: "", role: "basic", can_attendance: false, can_visits: false, can_approve: false, can_view_all: false, can_read_pastor_worries: false, active: true, class_ids: [], ...over });

  it("names the real readers: homeroom teachers of the class and the pastor", async () => {
    expect(await worryReaders(s.kidA)).toEqual({ teachers: ["박지현"], pastors: [{ name: "김인성", isAdmin: true }] });
    expect((await worryReaders(s.kidB)).teachers).toEqual([]); // 6학년 1반 has no homeroom teacher yet
  });

  it("stores the chosen audience and the class at the time of writing", async () => {
    const r = await submitWorry(s.kidA, "  친구랑 다퉜어요  ", "teacher");
    expect(r.ok).toBe(true);
    const w = await one<{ content: string; audience: string; class_id_at_write: number }>(db, "select content, audience, class_id_at_write from worries where child_id = $1", [s.kidA]);
    expect(w).toEqual({ content: "친구랑 다퉜어요", audience: "teacher", class_id_at_write: s.classId });
    // Moving class later does not hand the worry to the new class's teacher.
    await db.query("update children set class_id = $2 where id = $1", [s.kidA, s.otherClassId]);
    expect(canReadWorry(staff({ role: "homeroom", class_ids: [s.classId] }), w!)).toBe(true);
    expect(canReadWorry(staff({ role: "homeroom", class_ids: [s.otherClassId] }), w!)).toBe(false);
    expect(canReadWorry(staff({ role: "admin", can_read_pastor_worries: true }), w!)).toBe(false); // teacher-only
    expect(canReadWorry(staff({ role: "head", can_view_all: true }), w!)).toBe(false);
  });

  it("has no default audience and rejects empty text or an audience nobody can read", async () => {
    expect(await submitWorry(s.kidA, "걱정", "")).toMatchObject({ ok: false, reason: "audience" });
    expect(await submitWorry(s.kidA, "걱정", undefined)).toMatchObject({ ok: false, reason: "audience" });
    expect(await submitWorry(s.kidA, "걱정", "everyone")).toMatchObject({ ok: false, reason: "audience" });
    expect(await submitWorry(s.kidA, "   ", "both")).toMatchObject({ ok: false, reason: "empty" });
    expect(await submitWorry(s.kidA, "가".repeat(1001), "both")).toMatchObject({ ok: false, reason: "too_long" });
    expect(await submitWorry(s.kidB, "걱정", "teacher")).toMatchObject({ ok: false, reason: "no_reader" });
    expect(await one(db, "select id from worries")).toBeNull();
  });

  it("completes the weekly worry mission once", async () => {
    await s.mission("내 고민 적기", "worry", 1, 10);
    const first = await submitWorry(s.kidA, "첫 번째", "pastor");
    expect(first).toMatchObject({ ok: true, mission: { ok: true, drops: 1, points: 10 } });
    const second = await submitWorry(s.kidA, "두 번째", "both");
    expect(second).toMatchObject({ ok: true, mission: null });
    expect(await dropBalance(db, s.kidA)).toBe(1);
    expect(await pointBalance(db, s.kidA)).toBe(10);
    expect(await weekPoints(s.kidA)).toBe(10);
    // The worry text is not copied into the mission record.
    expect(await one(db, "select id from mission_completions where text_content is not null")).toBeNull();
  });

  it("shows a child only their own worries, marks replies read, and soft-deletes", async () => {
    const a = await submitWorry(s.kidA, "하준이의 고민", "both");
    await submitWorry(s.kidB, "준우의 고민", "pastor");
    if (!a.ok) throw new Error("expected ok");
    await db.query("insert into worry_replies (worry_id, staff_id, content) values ($1,$2,'같이 기도할게')", [a.worryId, s.adminId]);
    const mine = await myWorries(s.kidA);
    expect(mine.map((w) => w.content)).toEqual(["하준이의 고민"]);
    expect(mine[0].replies).toMatchObject([{ content: "같이 기도할게", author: "김인성 전도사님", unread: true }]);
    expect(await unreadReplyCount(s.kidA)).toBe(1);
    await markRepliesRead(s.kidB); // another child opening their list changes nothing here
    expect(await unreadReplyCount(s.kidA)).toBe(1);
    await markRepliesRead(s.kidA);
    expect(await unreadReplyCount(s.kidA)).toBe(0);
    expect(await deleteWorry(s.kidB, a.worryId)).toBe(false); // not theirs
    expect(await deleteWorry(s.kidA, a.worryId)).toBe(true);
    expect(await myWorries(s.kidA)).toEqual([]);
    expect(await one(db, "select deleted_at is not null as gone from worries where id = $1", [a.worryId])).toEqual({ gone: true });
  });
});

describe("feed", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  let postId: number;
  beforeEach(async () => {
    s = await setup();
    postId = (await db.query<{ id: number }>("insert into posts (body, staff_id) values ('추수감사절 소식', $1) returning id", [s.adminId]))[0].id;
  });

  it("catches rude words even when they are spaced out", () => {
    expect(hasRudeWord("넌 바 보 야")).toBe(true);
    expect(hasRudeWord("ㅅ.ㅂ")).toBe(true);
    expect(hasRudeWord("동생이 건강해져서 감사해요")).toBe(false);
    expect(hasRudeWord("시바견이 귀여워요")).toBe(false);
  });

  it("enforces length, wording and closed posts", async () => {
    expect(await addComment(s.kidA, postId, "  ")).toMatchObject({ ok: false, reason: "empty" });
    expect(await addComment(s.kidA, postId, "가".repeat(101))).toMatchObject({ ok: false, reason: "too_long" });
    expect((await addComment(s.kidA, postId, "가".repeat(100))).ok).toBe(true);
    expect(await addComment(s.kidA, postId, "너 바보")).toMatchObject({ ok: false, reason: "rude" });
    expect(await addComment(s.kidA, 99999, "안녕")).toMatchObject({ ok: false, reason: "not_found" });
    await db.query("update posts set comments_open = false where id = $1", [postId]);
    expect(await addComment(s.kidA, postId, "안녕")).toMatchObject({ ok: false, reason: "closed" });
  });

  it("gives the comment mission reward for the first comment of the week only", async () => {
    await s.mission("숲 소식에 댓글 달기", "comment", 1, 5);
    expect(await addComment(s.kidA, postId, "감사해요")).toMatchObject({ ok: true, mission: { ok: true, drops: 1, points: 5 } });
    expect(await addComment(s.kidA, postId, "또 감사해요")).toMatchObject({ ok: true, mission: null });
    expect(await dropBalance(db, s.kidA)).toBe(1);
  });

  it("hides hidden comments, and lets a child delete only their own", async () => {
    const mine = await addComment(s.kidA, postId, "내 댓글");
    const theirs = await addComment(s.kidB, postId, "친구 댓글");
    if (!mine.ok || !theirs.ok) throw new Error("expected ok");
    const hidden = await db.query<{ id: number }>("insert into comments (post_id, child_id, body, hidden_at) values ($1,$2,'숨긴 댓글', now()) returning id", [postId, s.kidB]);
    const feed = await feedFor(s.kidA);
    expect(feed[0].comments.map((c) => [c.body, c.mine])).toEqual([
      ["내 댓글", true],
      ["친구 댓글", false],
    ]);
    expect(await deleteComment(s.kidA, theirs.commentId)).toBe(false);
    expect(await deleteComment(s.kidA, mine.commentId)).toBe(true);
    expect((await feedFor(s.kidA))[0].comments.map((c) => c.body)).toEqual(["친구 댓글"]);
    expect(await reportComment(s.kidA, hidden[0].id)).toBe(false); // already hidden
  });

  it("reports someone else's comment once, never one's own", async () => {
    const mine = await addComment(s.kidA, postId, "내 댓글");
    const theirs = await addComment(s.kidB, postId, "친구 댓글");
    if (!mine.ok || !theirs.ok) throw new Error("expected ok");
    expect(await reportComment(s.kidA, mine.commentId)).toBe(false);
    expect(await reportComment(s.kidA, theirs.commentId)).toBe(true);
    expect(await reportComment(s.kidA, theirs.commentId)).toBe(true);
    expect(await one(db, "select count(*)::int as n from comment_reports")).toEqual({ n: 1 });
    expect((await feedFor(s.kidA))[0].comments.find((c) => c.id === theirs.commentId)?.reported).toBe(true);
    expect((await feedFor(s.kidB))[0].comments.find((c) => c.id === theirs.commentId)?.reported).toBe(false);
  });

  it("toggles a like per child", async () => {
    expect(await toggleLike(s.kidA, postId)).toEqual({ liked: true, likes: 1 });
    expect(await toggleLike(s.kidB, postId)).toEqual({ liked: true, likes: 2 });
    expect(await toggleLike(s.kidA, postId)).toEqual({ liked: false, likes: 1 });
    expect(await toggleLike(s.kidA, 99999)).toBeNull();
    expect((await feedFor(s.kidB))[0]).toMatchObject({ likes: 1, liked: true });
  });
});

describe("attendance streak", () => {
  it("counts weeks in a row and does not break on a week with no roll call yet", async () => {
    const s = await setup();
    const add = (date: string, status: string) => db.query("insert into attendance (child_id, date, status) values ($1,$2,$3)", [s.kidA, date, status]);
    expect(await attendanceStreak(s.kidA, TODAY)).toBe(0);
    await add(addDays(WS, -7), "present");
    await add(addDays(WS, -14), "late");
    await add(addDays(WS, -21), "absent");
    await add(addDays(WS, -28), "present");
    expect(await attendanceStreak(s.kidA, TODAY)).toBe(2);
    await add(WS, "present");
    expect(await attendanceStreak(s.kidA, TODAY)).toBe(3);
    await db.query("update attendance set status = 'absent' where child_id = $1 and date = $2", [s.kidA, WS]);
    expect(await attendanceStreak(s.kidA, TODAY)).toBe(0);
  });
});
