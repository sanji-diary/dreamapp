import type { Verse } from "./types";

/**
 * Copying a verse (말씀 쓰기): how a child's writing is compared with the verse, and how pasted
 * Bible text is cut into verses. Used on the server (the check that counts) and in the browser
 * (the marks shown while typing, the admin's paste helper), so nothing here may be server-only.
 *
 * The rule: the child writes the verse exactly, spacing and punctuation included. Only differences
 * a child cannot see on the screen are forgiven:
 *  - how a Korean syllable is stored (composed or in parts): everything is brought to NFC
 *  - characters with no width, and any run of spaces or line breaks (one space; none at the ends)
 *  - curly quotes against straight ones
 *  - full-width punctuation against the ordinary kind ("，" and ",")
 */

export const VERSE_MAX_COUNT = 10;
export const VERSE_MAX_LENGTH = 300;
export const VERSE_REF_MAX = 40;

const NO_WIDTH = /[​-‍⁠﻿]/g;
const DOUBLE_QUOTES = /[“-‟]/g;
const SINGLE_QUOTES = /[‘-‛]/g;
/** Full-width forms of ASCII punctuation only; full-width letters and digits look different and stay as they are. */
const WIDE_PUNCTUATION = /[！-／：-＠［-｀｛-～]/g;

export function normalizeVerse(text: string): string {
  return text
    .normalize("NFC")
    .replace(NO_WIDTH, "")
    .replace(WIDE_PUNCTUATION, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameVerse(typed: string, verse: string): boolean {
  return normalizeVerse(typed) === normalizeVerse(verse);
}

/**
 * Where the writing first leaves the verse: an index into `normalizeVerse(verse)`, or null when
 * they are the same. When the child simply stopped early it is the length of what they wrote;
 * when they wrote past the end it is the length of the verse.
 */
export function firstDifference(typed: string, verse: string): number | null {
  const a = normalizeVerse(typed);
  const b = normalizeVerse(verse);
  if (a === b) return null;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  // Never point into the middle of a character stored as two units.
  if (i > 0 && i < b.length && (b.charCodeAt(i) & 0xfc00) === 0xdc00 && (b.charCodeAt(i - 1) & 0xfc00) === 0xd800) i--;
  return i;
}

/** Reads verses as stored in the database (jsonb, or its text). Anything that is not a verse is left out. */
export function parseVerses(raw: unknown): Verse[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const out: Verse[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const { n, text } = item as { n?: unknown; text?: unknown };
    if (typeof text !== "string") continue;
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const num = typeof n === "number" ? String(n) : typeof n === "string" ? n.trim().slice(0, 8) : "";
    out.push({ n: num === "" ? null : num, text: clean });
  }
  return out;
}

export type VersesCheck = { ok: true; verses: Verse[] } | { ok: false; error: string };

/** The rule for saving verses: 1 to 10 of them, each with some text of at most 300 characters. */
export function validateVerses(raw: unknown): VersesCheck {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "따라 쓸 말씀을 적어 주세요" };
  if (raw.length > VERSE_MAX_COUNT) return { ok: false, error: `말씀은 ${VERSE_MAX_COUNT}절까지 넣을 수 있어요` };
  const verses = parseVerses(raw);
  if (verses.length !== raw.length) return { ok: false, error: "비어 있는 절이 있어요. 내용을 적거나 지워 주세요" };
  if (verses.some((v) => v.text.length > VERSE_MAX_LENGTH)) return { ok: false, error: `한 절은 ${VERSE_MAX_LENGTH}자까지 쓸 수 있어요` };
  return { ok: true, verses };
}

interface Marker {
  /** Where the number starts, where the verse text starts, and the number itself. */
  at: number;
  textAt: number;
  n: number;
  lineStart: boolean;
}

/**
 * A verse number: one to three digits at the start of a line or after a space, then "." or a
 * space or the first letter of the verse ("16. 하나님이", "16 하나님이", "16하나님이", "16절 하나님이").
 * "3:16" and "16-17" are references, not verse numbers.
 */
function findMarkers(text: string): Marker[] {
  const out: Marker[] = [];
  const re = /(^|\s)(\d{1,3})(?=(절(?=[\s.])|\.(?!\d)|\s|\p{L}))/gu;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const at = m.index + m[1].length;
    let textAt = at + m[2].length;
    if (text[textAt] === "절" && /[\s.]/.test(text[textAt + 1] ?? "")) textAt += 1;
    if (text[textAt] === ".") textAt += 1;
    const before = text.slice(0, at);
    out.push({ at, textAt, n: Number(m[2]), lineStart: /(^|\n)[ \t]*$/.test(before) });
  }
  return out;
}

/**
 * Cuts pasted Bible text into verses.
 *
 * A number is a verse number only when it carries on counting: the numbers used are the longest
 * run that goes up by one each time (16, 17, 18 …), so a number inside the text is not mistaken
 * for one. Whatever stands before the first verse number (a title such as "요한복음 3장") is left out.
 * With no verse numbers at all, every line that has text is one verse without a number.
 */
export function splitVerses(pasted: string): Verse[] {
  const text = pasted.replace(/\r\n?/g, "\n").replace(NO_WIDTH, "");
  const all = findMarkers(text);
  let best: Marker[] = [];
  for (let i = 0; i < all.length; i++) {
    const run = [all[i]];
    for (let j = i + 1; j < all.length; j++) {
      if (all[j].n === run[run.length - 1].n + 1) run.push(all[j]);
    }
    const better = run.length > best.length || (run.length === best.length && run[0].lineStart && !best[0].lineStart);
    if (better) best = run;
  }
  if (best.length === 0) {
    return text
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line !== "")
      .map((line) => ({ n: null, text: line }));
  }
  const out: Verse[] = [];
  best.forEach((m, i) => {
    const end = i + 1 < best.length ? best[i + 1].at : text.length;
    const body = text.slice(m.textAt, end).replace(/\s+/g, " ").trim();
    if (body) out.push({ n: String(m.n), text: body });
  });
  return out;
}

/** "16절" for a numbered verse, "" for one without a number. */
export function verseLabel(v: Pick<Verse, "n">): string {
  return v.n ? `${v.n}절` : "";
}
