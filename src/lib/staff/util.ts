import { todayKst } from "@/lib/time";

/** Result of a staff operation. Failures carry a Korean message that is safe to show. */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const FORBIDDEN = "권한이 없어요";
export const deny = { ok: false, error: FORBIDDEN } as const;
export const fail = (error: string) => ({ ok: false, error }) as const;

export function isDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** timestamptz values arrive as Date objects; turn them into a KST 'YYYY-MM-DD'. */
export function kstDate(ts: Date | string | null | undefined): string | null {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : todayKst(d);
}

/** '11월 22일' */
export function shortDate(date: string | null): string {
  if (!date) return "";
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일`;
}

export function clean(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function cleanOrNull(v: unknown, max = 200): string | null {
  const s = clean(v, max);
  return s === "" ? null : s;
}

export function toInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) ? v : null;
  if (typeof v !== "string" || !/^-?\d{1,9}$/.test(v.trim())) return null;
  return Number(v.trim());
}
