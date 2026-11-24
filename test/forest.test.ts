import { beforeEach, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = "memory";
process.env.DREAM_SEED = "off";

import { db, resetDbForTests } from "@/lib/db";
import { auroraNight, bonusFor, easterSunday, eventOn, FOREST_ITEMS, FOREST_SIZE, forestState, iga, seasonOn, thanksgivingSunday, timeOfDay } from "@/lib/forest";
import { applyForestControl, AUTO_FOREST, isAutoForest, readForestControl } from "@/lib/forest-control";
import { forestView, getForestControl, saveForestControl } from "@/lib/forest-setting";
import { addDays } from "@/lib/time";
import type { Staff } from "@/lib/types";

describe("forest rules", () => {
  it("has 64 things, each named once", () => {
    expect(FOREST_SIZE).toBe(64);
    expect(new Set(FOREST_ITEMS).size).toBe(64);
  });

  it("adds one more thing from 3 missions per child and two from 5", () => {
    expect([0, 2.9, 3, 4.9, 5, 9].map(bonusFor)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("follows the calendar seasons", () => {
    expect(["2027-02-28", "2027-03-01", "2027-06-01", "2027-09-01", "2027-12-01"].map(seasonOn)).toEqual(["winter", "spring", "summer", "autumn", "winter"]);
  });

  it("knows Easter and the third Sunday of November", () => {
    expect([2026, 2027, 2028, 2029, 2030].map(easterSunday)).toEqual(["2026-04-05", "2027-03-28", "2028-04-16", "2029-04-01", "2030-04-21"]);
    expect([2026, 2027, 2028].map(thanksgivingSunday)).toEqual(["2026-11-15", "2027-11-21", "2028-11-19"]);
  });

  it("dresses the forest for special days and leaves ordinary days alone", () => {
    expect(eventOn("2027-02-07")).toBe("seollal");
    expect(eventOn("2027-02-04")).toBe("seollal");
    expect(eventOn("2027-02-11")).toBeNull();
    expect(eventOn("2027-03-21")).toBe("easter"); // Palm Sunday
    expect(eventOn("2027-04-03")).toBe("easter");
    expect(eventOn("2027-04-04")).toBeNull();
    expect(eventOn("2027-07-20")).toBe("vbs");
    expect(eventOn("2027-08-10")).toBe("vbs");
    expect(eventOn("2027-08-11")).toBeNull();
    expect(eventOn("2026-11-15")).toBe("thanks");
    expect(eventOn("2026-11-09")).toBe("thanks");
    expect(eventOn("2026-11-22")).toBeNull();
    expect(eventOn("2026-12-01")).toBe("christmas");
    expect(eventOn("2026-12-31")).toBe("christmas");
    expect(eventOn("2027-01-01")).toBeNull();
    expect(eventOn("2026-10-05")).toBeNull();
  });

  it("tells day, evening and night by the Korean clock and the season", () => {
    const at = (kst: string) => new Date(kst + "+09:00");
    expect(timeOfDay(at("2027-07-01T18:30:00"), "summer")).toBe("day");
    expect(timeOfDay(at("2027-07-01T19:30:00"), "summer")).toBe("evening");
    expect(timeOfDay(at("2027-12-01T17:30:00"), "winter")).toBe("evening");
    expect(timeOfDay(at("2027-12-01T06:30:00"), "winter")).toBe("night");
    expect(timeOfDay(at("2027-10-01T12:00:00"), "autumn")).toBe("day");
    expect(timeOfDay(at("2027-10-01T23:00:00"), "autumn")).toBe("night");
  });

  it("greets friends with the right particle", () => {
    expect(iga("파랑새")).toBe("파랑새가");
    expect(iga("아기 양")).toBe("아기 양이");
    expect(iga("거북이")).toBe("거북이가");
  });
});

describe("the forest's weeks", () => {
  const START = "2026-11-22"; // a Sunday
  let kids: number[] = [];
  let mission = 0;

  beforeEach(async () => {
    resetDbForTests();
    const cls = await db.query<{ id: number }>("insert into classes (name, grade) values ('5학년 2반', 5) returning id");
    kids = (await db.query<{ id: number }>("insert into children (name, class_id, qr_token) values ('가', $1, 'f1'), ('나', $1, 'f2') returning id", [cls[0].id])).map((r) => r.id);
    mission = (await db.query<{ id: number }>("insert into missions (title, kind, repeat, starts_on, ends_on) values ('미션', 'self', 'daily', '2026-01-01', '2027-12-31') returning id"))[0].id;
  });

  const done = async (week: string, perChild: number) => {
    for (const kid of kids) for (let i = 0; i < perChild; i++) await db.query("insert into mission_completions (mission_id, child_id, done_on, week_start) values ($1, $2, $3, $3)", [mission, kid, week]);
  };

  it("starts with its first thing the first time anyone looks", async () => {
    const s = await forestState(db, addDays(START, 3));
    expect(s).toMatchObject({ count: 1, fresh: 1, rain: false, freshNames: ["풀밭"] });
    expect(await forestState(db, addDays(START, 5))).toMatchObject({ count: 1, fresh: 1 });
  });

  it("grows one thing every Sunday, and more after a busy week, with rain", async () => {
    await forestState(db, START);
    await done(START, 3); // 3 per child: one more
    const second = await forestState(db, addDays(START, 7));
    expect(second).toMatchObject({ count: 3, fresh: 2, rain: true, freshNames: ["풀잎 덤불", "작은 돌"] });
    await done(addDays(START, 7), 5); // 5 per child: two more
    expect(await forestState(db, addDays(START, 14))).toMatchObject({ count: 6, fresh: 3, rain: true });
    expect(await forestState(db, addDays(START, 21))).toMatchObject({ count: 7, fresh: 1, rain: false, freshNames: ["민들레"] });
  });

  it("fills in the weeks nobody looked, and never shrinks", async () => {
    await forestState(db, START);
    await done(addDays(START, 7), 3);
    const later = await forestState(db, addDays(START, 28));
    expect(later.count).toBe(1 + 1 + 2 + 1 + 1);
    await db.query("delete from mission_completions");
    await db.query("delete from children");
    expect((await forestState(db, addDays(START, 28))).count).toBe(later.count);
  });

  it("only counts approved missions", async () => {
    await forestState(db, START);
    await done(START, 3);
    await db.query("update mission_completions set status = 'pending'");
    expect(await forestState(db, addDays(START, 7))).toMatchObject({ count: 2, rain: false });
  });

  it("stops at 64 things and then only the seasons change", async () => {
    await forestState(db, START);
    for (let w = 0; w < 30; w++) await done(addDays(START, w * 7), 5);
    const full = await forestState(db, addDays(START, 7 * 30));
    expect(full.count).toBe(64);
    const after = await forestState(db, addDays(START, 7 * 31));
    expect(after).toMatchObject({ count: 64, fresh: 0, rain: false, freshNames: [] });
  });

  it("dresses for the day it is", async () => {
    expect(await forestState(db, "2026-12-24")).toMatchObject({ event: "christmas", season: "winter" });
    // Sunday opens the church doors; the northern lights come on some winter nights only.
    expect(await forestState(db, "2026-12-27")).toMatchObject({ sunday: true, aurora: true });
    expect(await forestState(db, "2026-12-28")).toMatchObject({ sunday: false, aurora: false });
    expect(["2027-01-03", "2027-01-04", "2027-01-06"].map((d) => auroraNight(d, "winter"))).toEqual([true, false, true]);
    expect(auroraNight("2027-07-03", "summer")).toBe(false);
    expect(await forestState(db, "2027-02-07")).toMatchObject({ event: "seollal", season: "spring" });
  });
});

describe("the forest set by hand (운영 > 우리 숲)", () => {
  const SUN = "2026-11-22"; // a Sunday in autumn, in the week of 추수감사절
  const WED = "2027-01-13"; // an ordinary winter Wednesday
  const admin: Staff = { id: 0, name: "관리자", role: "admin", can_attendance: true, can_visits: true, can_approve: true, can_view_all: true, can_read_pastor_worries: true, active: true, class_ids: [] };

  beforeEach(async () => {
    resetDbForTests();
    admin.id = (await db.query<{ id: number }>("insert into staff (name, role) values ('관리자','admin') returning id"))[0].id;
  });

  it("reads only what it knows; everything else is auto", () => {
    expect(readForestControl(null)).toEqual(AUTO_FOREST);
    expect(readForestControl({ count: "40", fresh: 2, rain: "on", season: "winter", event: "christmas", time: "night", sunday: "on", aurora: "off" })).toEqual({
      count: 40, fresh: 2, rain: "on", season: "winter", event: "christmas", time: "night", sunday: "on", aurora: "off",
    });
    expect(readForestControl({ count: 65, fresh: 4, rain: "storm", season: "monsoon", event: "halloween", time: "noon", sunday: "off", aurora: 1 })).toEqual(AUTO_FOREST);
    expect(readForestControl({ count: "", fresh: "auto", count_mode: "hand" })).toEqual(AUTO_FOREST);
    expect(readForestControl({ count: 0, fresh: 0 })).toMatchObject({ count: 0, fresh: 0 });
    expect(isAutoForest(AUTO_FOREST)).toBe(true);
    expect(isAutoForest({ ...AUTO_FOREST, time: "night" })).toBe(false);
  });

  it("with nothing set, the children see the forest by its own rules", async () => {
    const own = await forestState(db, SUN);
    expect(await forestView(db, SUN)).toEqual({ ...own, timeFixed: null });
    expect(applyForestControl(own, AUTO_FOREST, SUN)).toEqual({ ...own, timeFixed: null });
  });

  it("puts each part set by hand over the forest, and leaves the rest alone", async () => {
    const own = await forestState(db, WED); // count 1, fresh 1, winter, no special day
    expect(own).toMatchObject({ count: 1, fresh: 1, season: "winter", event: null, sunday: false });

    // The size alone: nothing is new unless that is set as well, and it does not rain.
    expect(applyForestControl(own, { ...AUTO_FOREST, count: 40 }, WED)).toMatchObject({ count: 40, fresh: 0, freshNames: [], rain: false, season: "winter" });
    expect(applyForestControl(own, { ...AUTO_FOREST, count: 40, rain: "on" }, WED).rain).toBe(false);
    // The last things as new, with rain.
    expect(applyForestControl(own, { ...AUTO_FOREST, count: 40, fresh: 2, rain: "on" }, WED)).toMatchObject({ count: 40, fresh: 2, freshNames: ["꽃 아치", "통나무 의자"], rain: true });
    // Never more new things than there are things.
    expect(applyForestControl(own, { ...AUTO_FOREST, count: 1, fresh: 3 }, WED)).toMatchObject({ count: 1, fresh: 1, freshNames: ["풀밭"] });
    expect(applyForestControl(own, { ...AUTO_FOREST, count: 0, fresh: 3, rain: "on" }, WED)).toMatchObject({ count: 0, fresh: 0, freshNames: [], rain: false });
    // Only "new this week" set: the forest's own size, and its own rain is not carried over.
    expect(applyForestControl(own, { ...AUTO_FOREST, fresh: 0 }, WED)).toMatchObject({ count: 1, fresh: 0, rain: false });
    expect(applyForestControl({ ...own, rain: true }, { ...AUTO_FOREST, rain: "off" }, WED).rain).toBe(false);
    expect(applyForestControl({ ...own, rain: true }, AUTO_FOREST, WED).rain).toBe(true);

    // A special day brings its season; a season set by hand comes first; "none" takes the day away.
    expect(applyForestControl(own, { ...AUTO_FOREST, event: "easter" }, WED)).toMatchObject({ event: "easter", season: "spring" });
    expect(applyForestControl(own, { ...AUTO_FOREST, event: "easter", season: "summer" }, WED)).toMatchObject({ event: "easter", season: "summer" });
    expect(applyForestControl(await forestState(db, SUN), { ...AUTO_FOREST, event: "none" }, SUN)).toMatchObject({ event: null, season: "autumn" });

    // Time of day, the Sunday look and the northern lights.
    expect(applyForestControl(own, { ...AUTO_FOREST, time: "night" }, WED).timeFixed).toBe("night");
    expect(applyForestControl(own, { ...AUTO_FOREST, sunday: "on" }, WED).sunday).toBe(true);
    expect(applyForestControl(own, AUTO_FOREST, WED).aurora).toBe(false); // the 13th is not a third day
    expect(applyForestControl(own, { ...AUTO_FOREST, aurora: "on" }, WED).aurora).toBe(true);
    expect(applyForestControl(own, { ...AUTO_FOREST, aurora: "off" }, "2027-01-12").aurora).toBe(false);
  });

  it("is saved by admins only, shown to the children, and the real forest keeps growing underneath", async () => {
    await forestState(db, SUN);
    expect(await saveForestControl({ ...admin, role: "head" }, { count: 40 })).toMatchObject({ ok: false });
    expect(await getForestControl()).toEqual(AUTO_FOREST);
    expect(await saveForestControl(admin, { count: "40", fresh: "2", rain: "on", season: "auto", event: "christmas", time: "night", sunday: "auto", aurora: "on" })).toMatchObject({ ok: true });
    expect(await getForestControl()).toEqual({ count: 40, fresh: 2, rain: "on", season: "auto", event: "christmas", time: "night", sunday: "auto", aurora: "on" });

    const later = addDays(SUN, 14);
    expect(await forestView(db, later)).toMatchObject({ count: 40, fresh: 2, rain: true, event: "christmas", season: "winter", timeFixed: "night", aurora: true });
    // The weeks were recorded all the same: back on auto, the forest stands where it really is.
    expect(await db.query("select week_start from forest_weeks")).toHaveLength(3);
    expect(await saveForestControl(admin, {})).toMatchObject({ ok: true });
    expect(await forestView(db, later)).toEqual({ ...(await forestState(db, later)), timeFixed: null });
    expect((await forestView(db, later)).count).toBe(3);
    // Every change is on record.
    expect(await db.query("select id from audit_log where action = 'forest_control_update'")).toHaveLength(2);
  });
});
