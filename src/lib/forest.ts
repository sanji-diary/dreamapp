import type { Queryable } from "@/lib/db";
import { addDays, todayKst, weekStart } from "@/lib/time";

/**
 * The shared forest ("우리 숲"): one island where the whole department's forest grows round the church.
 * Every Sunday one more thing appears; after a week when the children did many missions together,
 * one or two more appear and drops of rain fall. Children never see numbers: only what is new.
 */

/** The 64 things, in the order they appear: 8 chapters of 8. The 3D scene draws them by position. */
export const FOREST_ITEMS = [
  "풀밭", "풀잎 덤불", "작은 돌", "하얀 들꽃", "버섯", "풀숲", "민들레", "이끼 바위",
  "분홍 꽃", "튤립", "수국 덤불", "해바라기", "꽃덤불", "보라 꽃", "꽃나무", "꽃이 가득한 들판",
  "샘물", "시냇물", "징검다리", "연못", "연잎", "개구리", "물고기", "나무다리",
  "파랑새", "새집", "나비", "잠자리", "꿀벌", "다람쥐", "달팽이", "노랑나비",
  "오솔길", "나무 의자", "반 색깔 깃발", "등불", "꿈의숲 팻말", "작은 우물", "꽃 아치", "통나무 의자",
  "토끼", "고슴도치", "아기 사슴", "부엉이", "오리 가족", "거북이", "참새 떼", "아기 양",
  "큰 구름", "작은 구름", "해님", "무지개", "연", "반짝 별", "반딧불이", "열기구",
  "그네", "열매 바구니", "작은 정자", "폭포", "소풍 돗자리", "나무 위 오두막", "별빛 등 줄", "언덕 위 큰 나무",
] as const;
export const FOREST_SIZE = FOREST_ITEMS.length;

/** Friends that "come to visit": the screen greets them by name. */
export const FOREST_FRIENDS = new Set<string>(["파랑새", "나비", "잠자리", "꿀벌", "다람쥐", "달팽이", "노랑나비", "개구리", "물고기", "토끼", "고슴도치", "아기 사슴", "부엉이", "오리 가족", "거북이", "참새 떼", "아기 양"]);

/**
 * A busy week, measured as approved missions per active child over the week (Sunday to Saturday):
 * from the first number on, one more thing appears the next Sunday; from the second, two more.
 */
export const BUSY_STEPS = [3, 5] as const;

export function bonusFor(missionsPerChild: number): number {
  return missionsPerChild >= BUSY_STEPS[1] ? 2 : missionsPerChild >= BUSY_STEPS[0] ? 1 : 0;
}

export type Season = "spring" | "summer" | "autumn" | "winter";
export type ForestEvent = "seollal" | "easter" | "vbs" | "thanks" | "christmas";
export type TimeOfDay = "day" | "evening" | "night";

export const SEASON_NAMES: Record<Season, string> = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };

export const EVENTS: Record<ForestEvent, { name: string; season: Season; note: string }> = {
  seollal: { name: "설날", season: "spring", note: "새해 복 많이 받으세요! 숲에 복주머니와 방패연이 생겼어요." },
  easter: { name: "부활절", season: "spring", note: "예수님이 다시 살아나셨어요! 숲 곳곳에 부활절 달걀이 숨어 있어요." },
  vbs: { name: "여름성경학교", season: "summer", note: "여름성경학교가 열렸어요! 교회 마당에 천막과 풍선이 생겼어요." },
  thanks: { name: "추수감사절", season: "autumn", note: "감사가 가득한 추수감사절이에요. 숲에 호박과 열매가 가득해요." },
  christmas: { name: "성탄절", season: "winter", note: "메리 크리스마스! 예수님 오신 날을 함께 기뻐해요." },
};

/** Season by the calendar in Korea: March to May is spring, and so on. */
export function seasonOn(date: string): Season {
  const m = Number(date.slice(5, 7));
  return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
}

/** Easter Sunday (Western, as Korean Protestant churches keep it), by the anonymous Gregorian algorithm. */
export function easterSunday(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 설날 (the lunar new year's day in Korea). Add years here before they come. */
export const SEOLLAL: Record<number, string> = {
  2026: "2026-02-17", 2027: "2027-02-07", 2028: "2028-01-27", 2029: "2029-02-13", 2030: "2030-02-03",
  2031: "2031-01-23", 2032: "2032-02-11", 2033: "2033-01-31", 2034: "2034-02-19", 2035: "2035-02-08",
};

/** The third Sunday of November, when Korean churches keep 추수감사절. */
export function thanksgivingSunday(year: number): string {
  const first = `${year}-11-01`;
  const dow = new Date(first + "T00:00:00Z").getUTCDay();
  return addDays(first, ((7 - dow) % 7) + 14);
}

/** Day, evening or night by the clock in Korea; the sun sets later in summer and earlier in winter. */
export function timeOfDay(now: Date, season: Season): TimeOfDay {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }).format(now));
  const [morning, dusk, dark] = season === "summer" ? [6, 19, 20] : season === "winter" ? [7, 17, 18] : [6, 18, 19];
  return hour >= morning && hour < dusk ? "day" : hour >= dusk && hour < dark ? "evening" : "night";
}

const within = (date: string, center: string, before: number, after: number) => date >= addDays(center, -before) && date <= addDays(center, after);

/**
 * Which special day the forest is dressed for, if any:
 * 설날 three days either side, 부활절 from Palm Sunday to the Saturday after, 여름성경학교 from July 20 to August 10,
 * 추수감사절 the week before and after its Sunday, 성탄절 all of December.
 */
export function eventOn(date: string): ForestEvent | null {
  const year = Number(date.slice(0, 4));
  const md = date.slice(5);
  if (md >= "12-01") return "christmas";
  if (within(date, thanksgivingSunday(year), 6, 6)) return "thanks";
  if (md >= "07-20" && md <= "08-10") return "vbs";
  if (within(date, easterSunday(year), 7, 6)) return "easter";
  const lunar = SEOLLAL[year];
  if (lunar && within(date, lunar, 3, 3)) return "seollal";
  return null;
}

export interface ForestState {
  /** How many of the 64 things are there. */
  count: number;
  /** How many of them came this week (the last ones). */
  fresh: number;
  /** This week's extra things came from a busy week: rain falls. */
  rain: boolean;
  /** The forest's look: the calendar season, or the season a special day is kept in. */
  season: Season;
  event: ForestEvent | null;
  /** Names of this week's new things, for the screen. */
  freshNames: string[];
}

/** How busy a finished week was: 0, 1 or 2 extra things. */
async function busyBonus(q: Queryable, week: string): Promise<number> {
  const rows = await q.query<{ done: number; kids: number }>(
    `select (select count(*) from mission_completions where week_start = $1 and status = 'approved')::int as done,
            (select count(*) from children where active)::int as kids`,
    [week],
  );
  const { done, kids } = rows[0] ?? { done: 0, kids: 0 };
  return kids > 0 ? bonusFor(done / kids) : 0;
}

/** At most this many weeks are filled in at once (more than a year away from the screen starts nothing odd). */
const MAX_FILL = 60;

/**
 * Writes the weeks the forest has grown up to the week of `today` (each one once), then says where it stands.
 * The first time anyone looks, the forest starts this week with its first thing.
 */
export async function forestState(q: Queryable, today: string = todayKst()): Promise<ForestState> {
  const ws = weekStart(today);
  const last = await q.query<{ week_start: string }>("select week_start from forest_weeks order by week_start desc limit 1");
  if (last.length === 0) {
    await q.query("insert into forest_weeks (week_start, gained, bonus) values ($1, 1, 0) on conflict (week_start) do nothing", [ws]);
  } else {
    let w = addDays(last[0].week_start, 7);
    for (let i = 0; w <= ws && i < MAX_FILL; i++, w = addDays(w, 7)) {
      const bonus = await busyBonus(q, addDays(w, -7));
      await q.query("insert into forest_weeks (week_start, gained, bonus) values ($1, $2, $3) on conflict (week_start) do nothing", [w, 1 + bonus, bonus]);
    }
  }
  const rows = await q.query<{ week_start: string; gained: number; bonus: number }>("select week_start, gained, bonus from forest_weeks where week_start <= $1 order by week_start", [ws]);
  const total = rows.reduce((n, r) => n + r.gained, 0);
  const now = rows.find((r) => r.week_start === ws);
  const count = Math.min(FOREST_SIZE, total);
  const fresh = now ? count - Math.min(FOREST_SIZE, total - now.gained) : 0;
  const event = eventOn(today);
  return {
    count,
    fresh,
    rain: fresh > 0 && (now?.bonus ?? 0) > 0,
    season: event ? EVENTS[event].season : seasonOn(today),
    event,
    freshNames: FOREST_ITEMS.slice(count - fresh, count),
  };
}

/** Picks 이/가 for a Korean noun: '파랑새' -> '파랑새가', '아기 양' -> '아기 양이'. */
export function iga(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return word + "가";
  return word + ((code - 0xac00) % 28 === 0 ? "가" : "이");
}
