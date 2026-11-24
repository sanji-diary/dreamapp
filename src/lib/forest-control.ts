import { auroraNight, EVENTS, eventOn, FOREST_ITEMS, FOREST_SIZE, seasonOn, type ForestEvent, type ForestState, type Season, type TimeOfDay } from "@/lib/forest";

/**
 * 우리 숲 관리: what an admin set by hand for the shared forest (운영 > 우리 숲), kept in settings as
 * 'forest_control'. Every part is "auto" (or null) until it is set: then the forest follows its own
 * rules for that part (it grows on Sundays, the season follows the calendar, night comes by the clock).
 * A part set by hand stays that way for every child until it is put back to auto.
 *
 * The forest's own record of how far it has grown (forest_weeks) is never touched: it keeps growing
 * underneath, and putting 숲의 크기 back to auto shows the real forest again.
 */
export interface ForestControl {
  /** How many of the 64 things are shown, or null to follow the forest's growth. */
  count: number | null;
  /** How many of the last things are shown as "new this week" (0 to 3), or null to follow the forest. */
  fresh: number | null;
  rain: "auto" | "on" | "off";
  season: "auto" | Season;
  event: "auto" | "none" | ForestEvent;
  time: "auto" | TimeOfDay;
  /** The Sunday look: the church doors stand open. */
  sunday: "auto" | "on";
  aurora: "auto" | "on" | "off";
}

export const AUTO_FOREST: ForestControl = { count: null, fresh: null, rain: "auto", season: "auto", event: "auto", time: "auto", sunday: "auto", aurora: "auto" };

export const FOREST_SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];
export const FOREST_EVENTS = Object.keys(EVENTS) as ForestEvent[];
export const FOREST_TIMES: readonly TimeOfDay[] = ["day", "evening", "night"];
export const TIME_NAMES: Record<TimeOfDay, string> = { day: "낮", evening: "저녁", night: "밤" };
/** The most things that can be shown as new at once: a week brings one, and up to two more. */
export const FRESH_MAX = 3;

function whole(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], otherwise: T): T => (allowed.some((a) => a === v) ? (v as T) : otherwise);

/** Reads what is stored (or what the board posts). Anything unknown counts as auto. */
export function readForestControl(value: unknown): ForestControl {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return {
    count: whole(v.count, 0, FOREST_SIZE),
    fresh: whole(v.fresh, 0, FRESH_MAX),
    rain: oneOf(v.rain, ["auto", "on", "off"], "auto"),
    season: oneOf(v.season, ["auto", ...FOREST_SEASONS], "auto"),
    event: oneOf(v.event, ["auto", "none", ...FOREST_EVENTS], "auto"),
    time: oneOf(v.time, ["auto", ...FOREST_TIMES], "auto"),
    sunday: oneOf(v.sunday, ["auto", "on"], "auto"),
    aurora: oneOf(v.aurora, ["auto", "on", "off"], "auto"),
  };
}

export function isAutoForest(c: ForestControl): boolean {
  return (Object.keys(AUTO_FOREST) as (keyof ForestControl)[]).every((k) => c[k] === AUTO_FOREST[k]);
}

/** The forest as it is shown, and the time of day when an admin fixed it (null: by the clock). */
export interface ForestView extends ForestState {
  timeFixed: TimeOfDay | null;
}

/**
 * The forest the children see: the forest by its own rules (`auto`, for the day `today`), with the
 * parts an admin set by hand put over it.
 *
 * - A size set by hand shows nothing as new unless "new this week" is set as well.
 * - A special day set by hand brings its season with it, unless the season is set too.
 * - Rain needs something new to fall on, as in the forest's own rules.
 */
export function applyForestControl(auto: ForestState, c: ForestControl, today: string): ForestView {
  const count = c.count ?? auto.count;
  const fresh = Math.min(count, c.fresh ?? (c.count === null ? auto.fresh : 0));
  const event = c.event === "auto" ? eventOn(today) : c.event === "none" ? null : c.event;
  const season = c.season !== "auto" ? c.season : event ? EVENTS[event].season : seasonOn(today);
  const rain = fresh > 0 && (c.rain === "on" || (c.rain === "auto" && c.count === null && c.fresh === null && auto.rain));
  return {
    count,
    fresh,
    rain,
    season,
    event,
    freshNames: FOREST_ITEMS.slice(count - fresh, count),
    sunday: c.sunday === "on" || auto.sunday,
    aurora: c.aurora === "on" || (c.aurora === "auto" && auroraNight(today, season)),
    timeFixed: c.time === "auto" ? null : c.time,
  };
}
