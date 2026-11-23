import { describe, expect, it } from "vitest";
import { AUTO_LOOK, CHUSEOK, firstAdventSunday, homeLook, lookName, readLookChoice } from "@/lib/kid/home-look";

/** How the child's tree screen is dressed through a year (2027, the first full year of the app). */
const look = (date: string) => homeLook(date);
const festival = (date: string) => look(date).festival;

describe("the season on the tree screen", () => {
  it("follows the calendar, whatever special time it is", () => {
    expect(["2027-01-15", "2027-03-01", "2027-06-01", "2027-09-01", "2027-12-01"].map((d) => look(d).season)).toEqual(["winter", "spring", "summer", "autumn", "winter"]);
    // 설날 is in winter here (the forest shows it with its spring look; the tree screen keeps the snow).
    expect(look("2027-02-07")).toMatchObject({ season: "winter", festival: "seollal" });
  });

  it("has ordinary days with nothing special", () => {
    expect(["2027-01-20", "2027-04-20", "2027-06-15", "2027-08-20", "2027-10-10"].map(festival)).toEqual([null, null, null, null, null]);
  });
});

describe("special times in 2027", () => {
  it("opens the year with the new year's week", () => {
    expect(look("2027-01-01")).toMatchObject({ festival: "newyear", year: 2027 });
    expect(festival("2027-01-07")).toBe("newyear");
    expect(festival("2027-01-08")).toBeNull();
  });

  it("keeps 설날 three days either side", () => {
    expect(["2027-02-03", "2027-02-04", "2027-02-10", "2027-02-11"].map(festival)).toEqual([null, "seollal", "seollal", null]);
  });

  it("keeps Easter from Palm Sunday to the Saturday after", () => {
    expect(["2027-03-20", "2027-03-21", "2027-03-28", "2027-04-03", "2027-04-04"].map(festival)).toEqual([null, "easter", "easter", "easter", null]);
  });

  it("keeps Children's Day and Pentecost", () => {
    expect(["2027-04-30", "2027-05-01", "2027-05-05", "2027-05-06"].map(festival)).toEqual([null, "children", "children", null]);
    // Easter 2027 is March 28, so Pentecost is May 16.
    expect(["2027-05-15", "2027-05-16", "2027-05-22", "2027-05-23"].map(festival)).toEqual([null, "pentecost", "pentecost", null]);
  });

  it("keeps the summer Bible school, 추석 and Thanksgiving", () => {
    expect(["2027-07-19", "2027-07-20", "2027-08-10", "2027-08-11"].map(festival)).toEqual([null, "vbs", "vbs", null]);
    expect(CHUSEOK[2027]).toBe("2027-09-15");
    expect(["2027-09-12", "2027-09-13", "2027-09-17", "2027-09-18"].map(festival)).toEqual([null, "chuseok", "chuseok", null]);
    expect(["2027-11-14", "2027-11-15", "2027-11-21", "2027-11-27"].map(festival)).toEqual([null, "thanks", "thanks", "thanks"]);
  });
});

describe("Advent and Christmas", () => {
  it("finds the first Advent Sunday", () => {
    expect([2026, 2027, 2028, 2033].map(firstAdventSunday)).toEqual(["2026-11-29", "2027-11-28", "2028-12-03", "2033-11-27"]);
  });

  it("lights one more candle each Advent Sunday, and keeps all four to the end of the year", () => {
    const candles = (date: string) => {
      const l = look(date);
      return l.festival === "christmas" ? l.candles : null;
    };
    expect(["2027-11-27", "2027-11-28", "2027-12-04", "2027-12-05", "2027-12-12", "2027-12-19", "2027-12-25", "2027-12-31"].map(candles)).toEqual([null, 1, 1, 2, 3, 4, 4, 4]);
    // In a year when Advent starts in December, the first days of December wait with no candle lit.
    expect(["2028-11-30", "2028-12-01", "2028-12-02", "2028-12-03", "2028-12-24"].map(candles)).toEqual([null, 0, 0, 1, 4]);
    expect(look("2027-11-28").season).toBe("autumn"); // Advent can begin before the snow
  });
});

describe("a look chosen by hand", () => {
  it("changes only what was chosen; the rest follows the calendar", () => {
    // Late November 2026 is plain autumn by the calendar.
    expect(homeLook("2026-11-23")).toMatchObject({ season: "autumn", festival: null });
    expect(homeLook("2026-11-23", { season: "winter", festival: "auto" })).toMatchObject({ season: "winter", festival: null });
    // Advent still arrives on its own under a hand-set season.
    expect(homeLook("2026-11-29", { season: "winter", festival: "auto" })).toMatchObject({ season: "winter", festival: "christmas", candles: 1 });
    expect(homeLook("2027-06-15", { season: "auto", festival: "children" })).toMatchObject({ season: "summer", festival: "children" });
  });

  it("can show no special time at all", () => {
    expect(homeLook("2027-12-25", { season: "auto", festival: "none" })).toMatchObject({ season: "winter", festival: null, candles: 0 });
  });

  it("lights the Advent candles by the date, or all four outside Advent", () => {
    expect(homeLook("2027-12-06", { season: "auto", festival: "christmas" }).candles).toBe(2);
    expect(homeLook("2027-07-01", { season: "winter", festival: "christmas" })).toMatchObject({ season: "winter", festival: "christmas", candles: 4 });
  });

  it("shows the coming year on the new year's sign when chosen late in a year", () => {
    expect(homeLook("2026-12-28", { season: "auto", festival: "newyear" }).year).toBe(2027);
    expect(homeLook("2027-01-03", { season: "auto", festival: "newyear" }).year).toBe(2027);
  });

  it("reads a stored choice, and takes anything unknown as 자동", () => {
    expect(readLookChoice({ season: "winter", festival: "none" })).toEqual({ season: "winter", festival: "none" });
    expect(readLookChoice({ season: "monsoon", festival: 3 })).toEqual(AUTO_LOOK);
    expect(readLookChoice(null)).toEqual(AUTO_LOOK);
    expect(homeLook("2027-03-28", AUTO_LOOK)).toEqual(homeLook("2027-03-28"));
  });

  it("names the look for the admin", () => {
    expect(lookName(homeLook("2027-12-25"))).toBe("겨울 · 성탄절");
    expect(lookName(homeLook("2027-10-10"))).toBe("가을");
  });
});
