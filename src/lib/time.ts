/** Dates are handled as 'YYYY-MM-DD' strings in Korea time. The church week starts on Sunday. */
const TZ = "Asia/Seoul";

export function todayKst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sunday of the week that contains `date`. */
export function weekStart(date: string = todayKst()): string {
  const d = new Date(date + "T00:00:00Z");
  return addDays(date, -d.getUTCDay());
}

export function weekEnd(date: string = todayKst()): string {
  return addDays(weekStart(date), 6);
}

const DAYS = ["주일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/** '11월 22일 주일' */
export function formatKoreanDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${DAYS[d.getUTCDay()]}`;
}

/**
 * '11월 3주차': the week is named after its Sunday, counted within that Sunday's month.
 * A week that starts on November 29 is still '11월 5주차' on Wednesday, December 2.
 */
export function weekLabel(date: string = todayKst()): string {
  const d = new Date(weekStart(date) + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}월 ${Math.floor((d.getUTCDate() - 1) / 7) + 1}주차`;
}

/** Korean age is not used; this is the international age in whole years. */
export function ageOn(birth: string | null, on: string = todayKst()): number | null {
  if (!birth) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** Picks 으로/로 for a Korean noun: '새싹' -> '새싹으로', '나무' -> '나무로'. */
export function euro(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return word + "로";
  const jong = (code - 0xac00) % 28;
  return word + (jong === 0 || jong === 8 ? "로" : "으로");
}
