/**
 * Birth years a child may choose when joining. The department is grades 4 to 6 (10 to 12 years old);
 * the range leaves room on both sides for a younger sibling or an older helper.
 * Shared by the wizard (which years the wheel shows) and the server (which years are accepted).
 */
export const BIRTH_OLDEST = 16;
export const BIRTH_YOUNGEST = 6;

/** Oldest first, so the wheel reads top to bottom like a calendar. */
export function birthYearChoices(thisYear: number): number[] {
  const years: number[] = [];
  for (let y = thisYear - BIRTH_OLDEST; y <= thisYear - BIRTH_YOUNGEST; y++) years.push(y);
  return years;
}

export function isBirthYear(year: unknown, thisYear: number): year is number {
  return typeof year === "number" && Number.isInteger(year) && year >= thisYear - BIRTH_OLDEST && year <= thisYear - BIRTH_YOUNGEST;
}

/** Where the wheel starts when nothing is chosen yet: fifth grade, the middle of the department. */
export const defaultBirthYear = (thisYear: number) => thisYear - 11;

/** The school year a child born that year is usually in. Korean school years follow the calendar year. */
export function usualGrade(birthYear: number, thisYear: number): string | null {
  const grade = thisYear - birthYear - 6;
  if (grade >= 1 && grade <= 6) return `초등학교 ${grade}학년`;
  if (grade >= 7 && grade <= 9) return `중학교 ${grade - 6}학년`;
  return null;
}
