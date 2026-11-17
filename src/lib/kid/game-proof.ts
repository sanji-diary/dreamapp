import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { findGame } from "@/games/registry";
import { db } from "@/lib/db";
import { completeMission, missionsForChild, type CompleteResult } from "@/lib/game";
import { todayKst } from "@/lib/time";

/**
 * Proof that a game mission was really played, at a level that fits a children's church app.
 *
 * When the game screen opens the server signs a start token (child, mission, game, start time).
 * A win is accepted only with that token, for the same child and mission, at least MIN_PLAY_MS
 * and at most MAX_AGE_MS after it was issued.
 *
 * Honest limit: the game itself runs in the browser, so the server cannot see the cards being
 * turned. A determined child could open the page, wait 15 seconds and call the win action from the
 * browser console without playing. This stops accidental and instant completions, not a script.
 * Closing that gap would mean playing every move through the server, which is not worth it here:
 * the prize is a drop of water, capped per week like every other mission.
 */
export const MIN_PLAY_MS = 15_000;
export const MAX_AGE_MS = 30 * 60_000;

// Same secret as the session cookies (src/lib/session.ts keeps its helper private).
function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required in production");
    return new TextEncoder().encode("dev-only-secret-do-not-use-in-production");
  }
  return new TextEncoder().encode(s);
}

export async function issueGameToken(childId: number, missionId: number, gameId: string, now: number = Date.now()): Promise<string> {
  return new SignJWT({ use: "game", c: childId, m: missionId, g: gameId, t: now }).setProtectedHeader({ alg: "HS256" }).sign(secret());
}

export type GameTokenCheck = { ok: true; gameId: string } | { ok: false; reason: "bad" | "too_fast" | "expired" };

export async function checkGameToken(token: unknown, childId: number, missionId: number, now: number = Date.now()): Promise<GameTokenCheck> {
  if (typeof token !== "string" || token.length > 600) return { ok: false, reason: "bad" };
  let p: Record<string, unknown>;
  try {
    p = (await jwtVerify(token, secret(), { algorithms: ["HS256"] })).payload;
  } catch {
    return { ok: false, reason: "bad" };
  }
  if (p.use !== "game" || p.c !== childId || p.m !== missionId || typeof p.g !== "string" || typeof p.t !== "number") return { ok: false, reason: "bad" };
  const elapsed = now - p.t;
  if (elapsed < MIN_PLAY_MS) return { ok: false, reason: "too_fast" };
  if (elapsed > MAX_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true, gameId: p.g };
}

export type WinResult = CompleteResult | { ok: false; reason: "bad" | "too_fast" | "expired" };

/** The child says they won. Checks the mission, then the token, then records the completion. */
export async function winGame(childId: number, missionId: number, token: unknown, now: number = Date.now(), date: string = todayKst()): Promise<WinResult> {
  if (!Number.isInteger(missionId)) return { ok: false, reason: "not_found" };
  const m = (await missionsForChild(db, childId, date)).find((x) => x.id === missionId);
  if (!m || m.kind !== "game" || !findGame(m.game_id)) return { ok: false, reason: "not_found" };
  if (m.state !== "available") return { ok: false, reason: "already_done" };
  const t = await checkGameToken(token, childId, missionId, now);
  if (!t.ok) return t;
  // A token for another game (the admin switched games mid-play) does not count.
  if (t.gameId !== m.game_id) return { ok: false, reason: "bad" };
  return completeMission(childId, missionId, { verified: true, date });
}
