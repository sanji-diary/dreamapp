/** Small Korean-language helpers for child-facing copy. Safe to import from client components. */

function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** '김하준' -> '하준'. One-character family names are assumed. */
export function givenName(name: string): string {
  const n = name.trim();
  return n.length >= 2 ? n.slice(1) : n;
}

/** How a friend calls the child: '하준아', '서아야'. */
export function callName(name: string): string {
  const g = givenName(name);
  return g + (hasFinalConsonant(g) ? "아" : "야");
}

const ORDINALS = ["첫", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];
/** 1 -> '첫 번째', 2 -> '두 번째', 11 -> '11번째' */
export function ordinal(n: number): string {
  return n >= 1 && n <= ORDINALS.length ? `${ORDINALS[n - 1]} 번째` : `${n}번째`;
}

export function formatPoints(n: number): string {
  return n.toLocaleString("ko-KR") + "P";
}

/** '01012345678' -> '010-1234-5678' while typing. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** Digits of a Korean phone number, or null when it cannot be one. */
export function phoneDigits(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  return /^0\d{8,10}$/.test(d) ? d : null;
}

/** '20150314' or '2015.03.14' -> '2015-03-14' when it is a real date for a child aged about 6 to 19. */
export function parseBirth(raw: string, today: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 8) return null;
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(4, 6));
  const day = Number(d.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, day));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== day) return null;
  const thisYear = Number(today.slice(0, 4));
  if (y > thisYear - 6 || y < thisYear - 19) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** Digits typed so far -> '2015.03.14' */
export function formatBirth(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}
