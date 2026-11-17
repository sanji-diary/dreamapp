/** Points to talents. Pure helpers, safe to import from client components. */

/** Whole talents only: 1,249 points at 10 points per talent is 124. Negative balances give nothing. */
export function talentsFor(points: number, pointsPerTalent: number): number {
  if (!Number.isInteger(pointsPerTalent) || pointsPerTalent <= 0) return 0;
  return Math.floor(Math.max(0, points) / pointsPerTalent);
}

export interface TalentSummary {
  count: number;
  total: number;
  min: number;
  median: number;
  max: number;
}

export function summarize(values: number[]): TalentSummary {
  if (values.length === 0) return { count: 0, total: 0, min: 0, median: 0, max: 0 };
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return {
    count: s.length,
    total: s.reduce((a, b) => a + b, 0),
    min: s[0],
    median: s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    max: s[s.length - 1],
  };
}

export const MIN_RATE = 1;
export const MAX_RATE = 10000;
/** The most one payment or one manual adjustment may move. */
export const MAX_TALENT_AMOUNT = 1000;
/** A teacher may cancel their own last payment for this long. */
export const UNDO_MINUTES = 5;
