import "server-only";
import { db } from "@/lib/db";
import { completeMissionIn, lockChild, missionsForChild } from "@/lib/game";
import { verseKey, versePeriod } from "@/lib/plan";
import { todayKst } from "@/lib/time";
import { firstDifference, sameVerse } from "@/lib/verse";

/**
 * Writing a verse mission, one verse at a time.
 *
 * The browser only ever says "this is what I wrote for verse N". The server compares it with the
 * verse it holds (src/lib/verse.ts: exact, apart from differences nobody can see), remembers how
 * far the child has come, and completes the mission itself after the last verse. Nothing the
 * browser claims about being finished is used. Trying again is free and unlimited.
 */

export type VerseSubmitResult =
  /** The verse was right and there are more: `done` verses written out of `total`. */
  | { ok: true; finished: false; done: number; total: number }
  /** The last verse was right: the mission is completed and credited (once). */
  | { ok: true; finished: true; completionId: number; drops: number; points: number }
  /** `at` is where the writing first leaves the verse (an index into the normalized verse); `done` is the verse it was compared with. */
  | { ok: false; reason: "mismatch"; at: number; done: number; total: number }
  | { ok: false; reason: "not_found" | "already_done" };

/**
 * Checks what the child wrote for verse number `index` (0-based).
 *
 * `index` must be the next verse the child has not written yet. When it is not (a second tap that
 * arrives after the first one already moved on), nothing is compared and the true position is
 * returned, so the screen can catch up without showing an error.
 */
export async function submitVerse(childId: number, missionId: number, index: number, typed: unknown, date: string = todayKst()): Promise<VerseSubmitResult> {
  if (!Number.isInteger(missionId) || !Number.isInteger(index)) return { ok: false, reason: "not_found" };
  const text = typeof typed === "string" ? typed.slice(0, 2000) : "";
  return db.tx(async (q) => {
    await lockChild(q, childId);
    const m = (await missionsForChild(q, childId, date)).find((x) => x.id === missionId);
    if (!m || m.kind !== "verse" || !m.verse_list || m.verse_list.length === 0) return { ok: false, reason: "not_found" } as const;
    if (m.state !== "available") return { ok: false, reason: "already_done" } as const;
    const verses = m.verse_list;
    const total = verses.length;
    const done = m.verse_done;
    if (index !== done) return { ok: true, finished: false, done, total } as const;
    const verse = verses[done].text;
    if (!sameVerse(text, verse)) return { ok: false, reason: "mismatch", at: firstDifference(text, verse) ?? 0, done, total } as const;

    const next = done + 1;
    const period = versePeriod(m.repeat, date);
    if (next < total) {
      await q.query(
        `insert into verse_progress (child_id, mission_id, period, done, done_key) values ($1,$2,$3,$4,$5)
         on conflict (child_id, mission_id, period) do update set done = excluded.done, done_key = excluded.done_key, updated_at = now()`,
        [childId, missionId, period, next, verseKey(verses, next)],
      );
      return { ok: true, finished: false, done: next, total } as const;
    }
    // Every verse has been compared here, on the server: that is what `verified` stands for.
    const r = await completeMissionIn(q, childId, missionId, { verified: true, date });
    if (!r.ok) return { ok: false, reason: r.reason === "already_done" ? "already_done" : "not_found" } as const;
    await q.query("delete from verse_progress where child_id = $1 and mission_id = $2 and period = $3", [childId, missionId, period]);
    return { ok: true, finished: true, completionId: r.completionId, drops: r.drops, points: r.points } as const;
  });
}
