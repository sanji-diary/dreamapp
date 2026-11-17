import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

// A cookie jar standing in for the browser, so the real session and card code runs.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

import { GET as manifestGet } from "@/app/api/manifest/route";
import { kidLogin } from "@/lib/auth";
import { chooseCard, forgetCard, leaveCard, readCard, readCards, rememberCard } from "@/lib/card";
import { db, one, resetDbForTests } from "@/lib/db";
import { birthYearChoices, defaultBirthYear, usualGrade } from "@/lib/kid/birth";
import { rememberedFriends } from "@/lib/kid/friends";
import { chromeIntentUrl, classifyInstallPlatform } from "@/lib/kid/install-platform";
import { nameAlreadyJoined, SELF_JOIN_HOURLY_LIMIT, selfRegister, validateOnboarding, type OnboardingInput } from "@/lib/kid/onboarding";
import { ensureJoinCode, joinCodeOpen } from "@/lib/self-join";
import { readSession, setSession } from "@/lib/session";

const good: OnboardingInput = { name: " 새친구 ", gender: "F", birthYear: 2015, school: "꿈의숲초등학교", classId: null, pin: "4821", pin2: "4821" };

async function setup() {
  resetDbForTests();
  jar.clear();
  const cls = await db.query<{ id: number }>("insert into classes (name, grade, sort) values ('5학년 2반', 5, 1), ('6학년 1반', 6, 2) returning id");
  await db.query("insert into classes (name, archived) values ('지난 반', true)");
  const code = await ensureJoinCode();
  return { A: cls[0].id, B: cls[1].id, code };
}
const count = async () => (await one<{ n: number }>(db, "select count(*)::int as n from children"))!.n;
const child = (id: number) => one<Record<string, unknown>>(db, "select * from children where id = $1", [id]);

describe("self-join with the shared QR", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("makes a new child with a fresh card, a hashed PIN and a tree", async () => {
    const r = await selfRegister(s.code, { ...good, classId: s.A });
    if (!r.ok) throw new Error("self-join failed");
    expect(r.claimed).toBe(false);
    expect(r.token.length).toBeGreaterThanOrEqual(16);
    const c = await child(r.childId);
    expect(c).toMatchObject({ name: "새친구", gender: "F", birth_year: 2015, school: "꿈의숲초등학교", class_id: s.A, qr_token: r.token, self_joined: true, active: true, consent_on: null });
    expect(c).toMatchObject({ phone: null, guardian_phone: null, address: null, best_friend_id: null });
    expect(c!.onboarded_at).not.toBeNull();
    expect(c!.pin_hash).not.toBe("4821");
    expect(await db.query("select id from trees where child_id = $1 and harvested_at is null", [r.childId])).toHaveLength(1);
    // Skipping the class leaves it for a teacher; the same name again is simply another child.
    const again = await selfRegister(s.code, good);
    if (!again.ok) throw new Error("second self-join failed");
    expect(again.childId).not.toBe(r.childId);
    expect(again.token).not.toBe(r.token);
    expect(await child(again.childId)).toMatchObject({ class_id: null, self_joined: true });
  });

  it("signs in afterwards with the new card and the PIN", async () => {
    const r = await selfRegister(s.code, good);
    if (!r.ok) throw new Error("self-join failed");
    expect(await kidLogin(r.token, "0000")).toMatchObject({ ok: false, reason: "wrong" });
    expect(await readSession("kid")).toBeNull();
    expect(await kidLogin(r.token, "4821")).toEqual({ ok: true, childId: r.childId });
    expect(await readSession("kid")).toBe(r.childId);
  });

  it("fills in the one waiting child a teacher registered instead of making a duplicate", async () => {
    const pre = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token, guardian_phone) values ('새친구', $1, 'pre-card', '01011112222') returning id", [s.A]))[0].id;
    const before = await count();
    const r = await selfRegister(s.code, good); // class skipped
    expect(r).toEqual({ ok: true, childId: pre, token: "pre-card", claimed: true });
    expect(await count()).toBe(before);
    // The teacher's class and other entries stay; the paper card still belongs to this child.
    expect(await child(pre)).toMatchObject({ class_id: s.A, guardian_phone: "01011112222", gender: "F", birth_year: 2015, school: "꿈의숲초등학교", self_joined: true, qr_token: "pre-card" });
    expect(await db.query("select id from trees where child_id = $1 and harvested_at is null", [pre])).toHaveLength(1);
    expect(await kidLogin("pre-card", "4821")).toMatchObject({ ok: true, childId: pre });
    // That record is taken now: the next child with the same name is new, and cannot touch the first one's PIN.
    const next = await selfRegister(s.code, { ...good, pin: "1111", pin2: "1111" });
    expect(next).toMatchObject({ ok: true, claimed: false });
    expect(await count()).toBe(before + 1);
    expect(await kidLogin("pre-card", "4821")).toMatchObject({ ok: true });
  });

  it("a class the teacher already set stays, even when the child picks another", async () => {
    const pre = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('새친구', $1, 'pre-card') returning id", [s.A]))[0].id;
    expect(await selfRegister(s.code, { ...good, classId: s.B })).toMatchObject({ ok: true, childId: pre, claimed: true });
    expect(await child(pre)).toMatchObject({ class_id: s.A });
  });

  it("makes a new record when two waiting children share the name, or the namesake already started or left", async () => {
    await db.query("insert into children (name, class_id, qr_token) values ('새친구', $1, 'pre-1'), ('새친구', $2, 'pre-2')", [s.A, s.B]);
    const before = await count();
    const r = await selfRegister(s.code, good);
    expect(r).toMatchObject({ ok: true, claimed: false });
    expect(await count()).toBe(before + 1);
    expect(await db.query("select id from children where qr_token in ('pre-1','pre-2') and pin_hash is null and onboarded_at is null and not self_joined")).toHaveLength(2);

    await db.query("insert into children (name, qr_token, pin_hash, onboarded_at) values ('이미시작', 'started', 'hash', now()), ('명단제외', 'gone', null, null)");
    await db.query("update children set active = false where qr_token = 'gone'");
    expect(await selfRegister(s.code, { ...good, name: "이미시작" })).toMatchObject({ ok: true, claimed: false });
    expect(await selfRegister(s.code, { ...good, name: "명단제외" })).toMatchObject({ ok: true, claimed: false });
    expect(await one(db, "select pin_hash from children where qr_token = 'started'")).toEqual({ pin_hash: "hash" });
    expect(await one(db, "select pin_hash, active from children where qr_token = 'gone'")).toEqual({ pin_hash: null, active: false });
  });

  it("refuses a wrong code, a reissued code, and self-join switched off", async () => {
    const before = await count();
    for (const bad of ["", "nope", s.code + "x", s.code.slice(0, -1), s.code.toUpperCase() === s.code ? s.code.toLowerCase() : s.code.toUpperCase()]) {
      expect(await selfRegister(bad, good)).toEqual({ ok: false, reason: "closed" });
    }
    expect(await selfRegister(undefined as unknown as string, good)).toEqual({ ok: false, reason: "closed" });
    await db.query("update settings set value = 'false' where key = 'self_join_on'");
    expect(await joinCodeOpen(s.code)).toBe(false);
    expect(await selfRegister(s.code, good)).toEqual({ ok: false, reason: "closed" });
    await db.query("update settings set value = 'true' where key = 'self_join_on'");
    await db.query("update settings set value = $1 where key = 'join_code'", [JSON.stringify("a-brand-new-code")]);
    expect(await selfRegister(s.code, good)).toEqual({ ok: false, reason: "closed" });
    expect(await count()).toBe(before);
    expect(await selfRegister("a-brand-new-code", good)).toMatchObject({ ok: true });
  });

  it("checks every field again on the server", async () => {
    const before = await count();
    const bad: [Partial<OnboardingInput>, string][] = [
      [{ name: "가" }, "name"],
      [{ name: "열한글자가넘는긴이름이에요" }, "name"],
      [{ gender: "X" }, "gender"],
      [{ birthYear: 1999 }, "birth"],
      [{ birthYear: 2015.5 }, "birth"],
      [{ school: "가" }, "school"],
      [{ school: "가".repeat(41) }, "school"],
      [{ classId: 99999 }, "classId"],
      [{ classId: "1" as unknown as number }, "classId"],
      [{ pin: "12a4", pin2: "12a4" }, "pin"],
      [{ pin: "12345", pin2: "12345" }, "pin"],
      [{ pin2: "0000" }, "pin2"],
    ];
    for (const [over, field] of bad) {
      const r = await selfRegister(s.code, { ...good, ...over });
      expect(r, JSON.stringify(over)).toMatchObject({ ok: false, reason: "invalid" });
      if (!r.ok) expect(Object.keys(r.errors ?? {})).toEqual([field]);
    }
    // An archived class is not a class a child may join.
    const archived = (await one<{ id: number }>(db, "select id from classes where archived"))!.id;
    expect(await selfRegister(s.code, { ...good, classId: archived })).toMatchObject({ ok: false, reason: "invalid", errors: { classId: expect.any(String) } });
    expect(await selfRegister(s.code, null as unknown as OnboardingInput)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await count()).toBe(before);
  });

  it("stops after too many new children in one hour, but not for waiting children or older sign-ups", async () => {
    const fill = (n: number, age: string) =>
      db.query(`insert into children (name, qr_token, self_joined, onboarded_at, created_at) select '가입' || g, 'flood-${age.replace(/\W/g, "")}-' || g, true, now(), now() - interval '${age}' from generate_series(1, $1) g`, [n]);
    await fill(SELF_JOIN_HOURLY_LIMIT - 1, "5 minutes");
    await fill(30, "2 hours"); // older than the window: not counted
    expect(await selfRegister(s.code, good)).toMatchObject({ ok: true, claimed: false }); // the 40th within the hour
    const before = await count();
    expect(await selfRegister(s.code, { ...good, name: "한명더" })).toEqual({ ok: false, reason: "busy" });
    expect(await count()).toBe(before);
    // A child the teacher registered is not a new record, so they still get in.
    await db.query("insert into children (name, qr_token) values ('기다린아이', 'pre-wait')");
    expect(await selfRegister(s.code, { ...good, name: "기다린아이" })).toMatchObject({ ok: true, claimed: true });
    // Once the hour has passed, new children are welcome again.
    await db.query("update children set created_at = created_at - interval '1 hour' where self_joined");
    expect(await selfRegister(s.code, { ...good, name: "한명더" })).toMatchObject({ ok: true, claimed: false });
  });
});

const manifestReq = (card?: string) => new Request("http://localhost/api/manifest" + (card ? "?c=" + encodeURIComponent(card) : ""));

describe("the home-screen manifest", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("gives a signed-out visitor the generic manifest, never cached", async () => {
    const res = await manifestGet(manifestReq());
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-type")).toContain("application/manifest+json");
    expect(await res.json()).toMatchObject({ start_url: "/", display: "standalone", name: "꿈의숲키우기" });
  });

  it("names icons that exist at the size it says, the same ones in every manifest", async () => {
    const { icons } = await (await manifestGet(manifestReq())).json();
    // One as drawn, and one Android may cut to its own shape.
    expect(icons.map((i: { purpose: string }) => i.purpose)).toEqual(["any", "maskable"]);
    for (const icon of icons) {
      const png = readFileSync(join("public", icon.src));
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes); // width and height in the PNG header
    }
    for (const file of ["manifest.webmanifest", "manifest-staff.webmanifest"]) {
      expect(JSON.parse(readFileSync(join("public", file), "utf8")).icons).toEqual(icons);
    }
  });

  it("gives a signed-in child a start_url that is their own card entry", async () => {
    const r = await selfRegister(s.code, good);
    if (!r.ok) throw new Error("self-join failed");
    await setSession("kid", r.childId);
    const res = await manifestGet(manifestReq());
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe("Cookie");
    const m = await res.json();
    expect(m.start_url).toBe(`/join/${encodeURIComponent(r.token)}/card`);
    expect(m.id).toBe("/"); // the same app for every child; only the start differs
    // A teacher's session alone does not make it personal, and a child taken off the list falls back too.
    await db.query("update children set active = false where id = $1", [r.childId]);
    expect((await (await manifestGet(manifestReq())).json()).start_url).toBe("/");
    jar.clear();
    await setSession("staff", 1);
    expect((await (await manifestGet(manifestReq())).json()).start_url).toBe("/");
  });
});

describe("the manifest address carries the card, for browsers that fetch it without cookies", () => {
  it("answers with that child's card entry with no session at all, and ignores a card that is not on the list", async () => {
    const s = await setup();
    const r = await selfRegister(s.code, good);
    if (!r.ok) throw new Error("self-join failed");
    jar.clear(); // no cookies, like an iPhone fetching the manifest for the home screen
    const res = await manifestGet(manifestReq(r.token));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await res.json()).start_url).toBe(`/join/${encodeURIComponent(r.token)}/card`);
    expect((await (await manifestGet(manifestReq("no-such-card"))).json()).start_url).toBe("/");
    await db.query("update children set active = false where id = $1", [r.childId]);
    expect((await (await manifestGet(manifestReq(r.token))).json()).start_url).toBe("/");
  });
});

describe("a returning child at the shared sign-up", () => {
  it("is recognised by name once they have joined, so they are sent to their own card instead of joining twice", async () => {
    const s = await setup();
    expect(await nameAlreadyJoined(s.code, "새친구")).toBe(false);
    const r = await selfRegister(s.code, good);
    if (!r.ok) throw new Error("self-join failed");
    expect(await nameAlreadyJoined(s.code, " 새친구 ")).toBe(true);
    expect(await nameAlreadyJoined(s.code, "다른이름")).toBe(false);
    // Only someone holding the current join code gets an answer.
    expect(await nameAlreadyJoined("wrong-code", "새친구")).toBe(false);
    // A child a teacher registered but who has not started is not "already joined": they are claimed instead.
    await db.query("insert into children (name, qr_token) values ('기다리는아이', 'pre-wait')");
    expect(await nameAlreadyJoined(s.code, "기다리는아이")).toBe(false);
    // A child taken off the list does not count, and odd input is simply "no".
    await db.query("update children set active = false where id = $1", [r.childId]);
    expect(await nameAlreadyJoined(s.code, "새친구")).toBe(false);
    expect(await nameAlreadyJoined(s.code, 5 as unknown as string)).toBe(false);
  });

  it("does not block a namesake: saying 'first time' still makes a new record", async () => {
    const s = await setup();
    const first = await selfRegister(s.code, good);
    const second = await selfRegister(s.code, { ...good, pin: "1357", pin2: "1357" });
    if (!first.ok || !second.ok) throw new Error("self-join failed");
    expect(second.childId).not.toBe(first.childId);
  });
});

describe("friends remembered on this device", () => {
  it("keeps every card that was used, newest first, and 'someone else' forgets nothing", async () => {
    await setup();
    await db.query("insert into children (name, qr_token) values ('김하나', 'card-a'), ('이두리', 'card-b'), ('박세찬', 'card-c')");
    await rememberCard("card-a");
    await rememberCard("card-b");
    expect(await readCard()).toBe("card-b");
    expect((await rememberedFriends()).map((f) => f.name)).toEqual(["이두리", "김하나"]);

    // "다른 친구예요": nobody is current, but both names can still be picked.
    await leaveCard();
    expect(await readCard()).toBeNull();
    const friends = await rememberedFriends();
    expect(friends.map((f) => f.name)).toEqual(["이두리", "김하나"]);
    // The pick form carries a fingerprint, never the card itself.
    expect(friends.every((f) => f.key.length === 16 && !f.key.includes(f.token))).toBe(true);

    // Picking a remembered card makes it current again; a card this device never used is refused.
    expect(await chooseCard("card-a")).toBe(true);
    expect(await readCard()).toBe("card-a");
    expect(await chooseCard("card-c")).toBe(false);
    expect(await readCard()).toBe("card-a");
  });

  it("moves a card remembered before the list existed into the list, and drops cards that stopped working", async () => {
    await setup();
    await db.query("insert into children (name, qr_token) values ('김하나', 'card-a'), ('이두리', 'card-b')");
    jar.set("dream_card", "card-a"); // an older version stored only the current card
    expect((await rememberedFriends()).map((f) => f.name)).toEqual(["김하나"]);
    await leaveCard();
    expect((await rememberedFriends()).map((f) => f.name)).toEqual(["김하나"]);

    await rememberCard("card-b");
    await db.query("update children set active = false where qr_token = 'card-a'");
    expect((await rememberedFriends()).map((f) => f.name)).toEqual(["이두리"]);
    await forgetCard(); // the current card turned out to be invalid
    expect(await readCard()).toBeNull();
    expect(await readCards()).toEqual(["card-a"]);
  });

  it("remembers at most six cards and ignores anything in the cookie that is not a card", async () => {
    await setup();
    for (let i = 1; i <= 8; i++) await rememberCard("card-" + i);
    expect(await readCards()).toEqual(["card-8", "card-7", "card-6", "card-5", "card-4", "card-3"]);
    jar.set("dream_cards", "card-1.<script>.card-2..card-1");
    jar.delete("dream_card");
    expect(await readCards()).toEqual(["card-1", "card-2"]);
  });
});

describe("the birth-year wheel", () => {
  it("offers eleven years around the department's ages and the server accepts exactly those", () => {
    expect(birthYearChoices(2026)).toEqual([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020]);
    expect(defaultBirthYear(2026)).toBe(2015);
    for (const y of [2010, 2015, 2020]) expect(validateOnboarding({ ...good, birthYear: y }, "2026-11-17").ok).toBe(true);
    for (const y of [2009, 2021]) expect(validateOnboarding({ ...good, birthYear: y }, "2026-11-17")).toMatchObject({ ok: false, errors: { birth: expect.any(String) } });
  });

  it("tells a child which school year usually goes with a birth year", () => {
    expect(usualGrade(2016, 2026)).toBe("초등학교 4학년");
    expect(usualGrade(2015, 2026)).toBe("초등학교 5학년");
    expect(usualGrade(2014, 2026)).toBe("초등학교 6학년");
    expect(usualGrade(2013, 2026)).toBe("중학교 1학년");
    expect(usualGrade(2020, 2026)).toBeNull();
    expect(usualGrade(2010, 2026)).toBeNull();
  });
});

describe("which add-to-home-screen steps fit the browser", () => {
  const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
  const AND = "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko)";
  const cases: [string, string, ReturnType<typeof classifyInstallPlatform>][] = [
    ["iPhone Safari", `${IOS} Version/18.1 Mobile/15E148 Safari/604.1`, { kind: "ios-safari", os: "ios", app: null }],
    ["iPad Safari", "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", { kind: "ios-safari", os: "ios", app: null }],
    ["iPhone Chrome", `${IOS} CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1`, { kind: "ios-other", os: "ios", app: null }],
    ["iPhone Firefox", `${IOS} FxiOS/132.0 Mobile/15E148 Safari/605.1.15`, { kind: "ios-other", os: "ios", app: null }],
    ["iPhone Edge", `${IOS} Version/18.0 EdgiOS/131.0.2903.52 Mobile/15E148 Safari/605.1.15`, { kind: "ios-other", os: "ios", app: null }],
    ["Android Chrome", `${AND} Chrome/131.0.0.0 Mobile Safari/537.36`, { kind: "android", os: "android", app: null }],
    ["Android Samsung Internet", `${AND} SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36`, { kind: "android", os: "android", app: null }],
    ["KakaoTalk on iPhone", `${IOS} Mobile/15E148 KAKAOTALK/11.2.1 (INAPP)`, { kind: "inapp", os: "ios", app: "kakaotalk" }],
    ["KakaoTalk on Android", `${AND} Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36;KAKAOTALK 2411210`, { kind: "inapp", os: "android", app: "kakaotalk" }],
    ["Naver app on Android", `${AND} Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.9.5)`, { kind: "inapp", os: "android", app: "naver" }],
    ["Naver app on iPhone", `${IOS} Mobile/15E148 NAVER(inapp; search; 2000; 12.9.5; 15PRO)`, { kind: "inapp", os: "ios", app: "naver" }],
    ["Instagram on iPhone", `${IOS} Mobile/15E148 Instagram 356.0.0.24.107 (iPhone16,1; iOS 18_1; ko_KR)`, { kind: "inapp", os: "ios", app: "instagram" }],
    ["Facebook on iPhone", `${IOS} Mobile/15E148 [FBAN/FBIOS;FBAV/489.0.0.60.110;FBBV/664]`, { kind: "inapp", os: "ios", app: "facebook" }],
    ["Facebook on Android", `${AND} Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/489.0.0.60.110;]`, { kind: "inapp", os: "android", app: "facebook" }],
    ["Line on Android", `${AND} Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 Line/14.19.1/IAB`, { kind: "inapp", os: "android", app: "line" }],
    ["Line on iPhone", `${IOS} Mobile/15E148 Safari Line/14.19.0`, { kind: "inapp", os: "ios", app: "line" }],
    ["a computer", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", { kind: "other", os: "other", app: null }],
    ["a Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", { kind: "other", os: "other", app: null }],
  ];
  for (const [label, ua, want] of cases) {
    it(label, () => {
      expect(classifyInstallPlatform(ua)).toEqual(want);
    });
  }
  it("copes with a missing user agent, and does not mistake ordinary words for an in-app browser", () => {
    expect(classifyInstallPlatform(null)).toEqual({ kind: "other", os: "other", app: null });
    expect(classifyInstallPlatform("")).toEqual({ kind: "other", os: "other", app: null });
    expect(classifyInstallPlatform(`${AND} Chrome/131.0.0.0 Mobile Safari/537.36 Timeline/1.0`).kind).toBe("android");
  });
  it("builds a Chrome intent link only for https addresses", () => {
    expect(chromeIntentUrl("https://dream.example/join/abc_-1/install?x=1")).toBe(
      "intent://dream.example/join/abc_-1/install?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fdream.example%2Fjoin%2Fabc_-1%2Finstall%3Fx%3D1;end",
    );
    expect(chromeIntentUrl("http://localhost:3000/join/abc/install")).toBeNull();
    expect(chromeIntentUrl("javascript:alert(1)")).toBeNull();
    expect(chromeIntentUrl("not a url")).toBeNull();
  });
});
