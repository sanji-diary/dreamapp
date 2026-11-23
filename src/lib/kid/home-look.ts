import { easterSunday, eventOn, SEASON_NAMES, seasonOn, type Season } from "@/lib/forest";
import { addDays } from "@/lib/time";

/**
 * How the child's own tree screen is dressed today: the season, and a special time if there is one.
 * Only the picture changes. Nothing here gives or takes anything, and nothing has to be done.
 *
 * - 새해: January 1 to 7
 * - 설날: three days either side (the forest's rule)
 * - 부활절: Palm Sunday to the Saturday after Easter (the forest's rule)
 * - 어린이날: May 1 to 5
 * - 성령강림절: Pentecost Sunday (seven weeks after Easter) and the six days after it
 * - 여름성경학교: July 20 to August 10 (the forest's rule)
 * - 추석: two days either side
 * - 추수감사절: the week either side of the third Sunday of November (the forest's rule)
 * - 대림절과 성탄절: from the first Advent Sunday (or December 1, whichever comes first) to December 31;
 *   one more candle is lit each Advent Sunday
 *
 * An admin may set the season or the special time by hand ("첫 화면 모습"); what is left on 자동 follows
 * the calendar as above. A hand-set look stays until the admin changes it back.
 */
export type Festival = "newyear" | "seollal" | "easter" | "children" | "pentecost" | "vbs" | "chuseok" | "thanks" | "christmas";

export interface HomeLook {
  season: Season;
  festival: Festival | null;
  /** Advent candles lit (0 to 4). Only meaningful during "christmas". */
  candles: number;
  /** The year, for the new year's sign. */
  year: number;
}

export const FESTIVALS: Festival[] = ["newyear", "seollal", "easter", "children", "pentecost", "vbs", "chuseok", "thanks", "christmas"];
export const FESTIVAL_NAMES: Record<Festival, string> = {
  newyear: "새해", seollal: "설날", easter: "부활절", children: "어린이날", pentecost: "성령강림절",
  vbs: "여름성경학교", chuseok: "추석", thanks: "추수감사절", christmas: "성탄절",
};
export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

/** What the admin chose for the tree screen. "auto" follows the calendar; "none" shows no special time. */
export interface LookChoice {
  season: Season | "auto";
  festival: Festival | "auto" | "none";
}
export const AUTO_LOOK: LookChoice = { season: "auto", festival: "auto" };

/** Reads a stored or posted choice. Anything it does not know becomes "auto". */
export function readLookChoice(value: unknown): LookChoice {
  const v = (value && typeof value === "object" ? value : {}) as { season?: unknown; festival?: unknown };
  const season = SEASONS.find((s) => s === v.season) ?? "auto";
  const festival = v.festival === "none" ? "none" : (FESTIVALS.find((f) => f === v.festival) ?? "auto");
  return { season, festival };
}

/** "겨울 · 성탄절", "가을", … for the look that is showing. */
export function lookName(look: HomeLook): string {
  return look.festival ? `${SEASON_NAMES[look.season]} · ${FESTIVAL_NAMES[look.festival]}` : SEASON_NAMES[look.season];
}

/** 추석 (the 15th day of the 8th lunar month in Korea). Add years here before they come. */
export const CHUSEOK: Record<number, string> = {
  2026: "2026-09-25", 2027: "2027-09-15", 2028: "2028-10-03", 2029: "2029-09-22", 2030: "2030-09-12",
  2031: "2031-10-01", 2032: "2032-09-19", 2033: "2033-09-08", 2034: "2034-09-27", 2035: "2035-09-16",
};

/** The first of the four Advent Sundays before Christmas. */
export function firstAdventSunday(year: number): string {
  const christmas = `${year}-12-25`;
  const dow = new Date(christmas + "T00:00:00Z").getUTCDay();
  const fourth = addDays(christmas, -(dow === 0 ? 7 : dow)); // the last Sunday before Christmas Day
  return addDays(fourth, -21);
}

const daysFrom = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/** The look the calendar gives. */
function calendarLook(date: string): HomeLook {
  const year = Number(date.slice(0, 4));
  const md = date.slice(5);
  const season = seasonOn(date);
  const advent = firstAdventSunday(year);
  const base = { season, year, candles: 0 };

  if (md >= "12-01" || date >= advent) return { ...base, festival: "christmas", candles: date < advent ? 0 : Math.min(4, Math.floor(daysFrom(advent, date) / 7) + 1) };
  const forest = eventOn(date);
  if (forest === "thanks" || forest === "vbs" || forest === "easter" || forest === "seollal") return { ...base, festival: forest };
  if (md <= "01-07") return { ...base, festival: "newyear" };
  if (md >= "05-01" && md <= "05-05") return { ...base, festival: "children" };
  const pentecost = addDays(easterSunday(year), 49);
  if (date >= pentecost && date <= addDays(pentecost, 6)) return { ...base, festival: "pentecost" };
  const chuseok = CHUSEOK[year];
  if (chuseok && date >= addDays(chuseok, -2) && date <= addDays(chuseok, 2)) return { ...base, festival: "chuseok" };
  return { ...base, festival: null };
}

export function homeLook(date: string, choice: LookChoice = AUTO_LOOK): HomeLook {
  const auto = calendarLook(date);
  const season = choice.season === "auto" ? auto.season : choice.season;
  if (choice.festival === "auto") return { ...auto, season };
  if (choice.festival === "none") return { ...auto, season, festival: null, candles: 0 };
  // Set by hand: 성탄절 outside Advent shows all four candles; 새해 chosen late in a year is for the year to come.
  const candles = choice.festival !== "christmas" ? 0 : auto.festival === "christmas" ? auto.candles : 4;
  const year = choice.festival === "newyear" && date.slice(5) >= "07-01" ? auto.year + 1 : auto.year;
  return { season, festival: choice.festival, candles, year };
}
