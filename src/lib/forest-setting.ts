import "server-only";
import { db, one, type Queryable } from "@/lib/db";
import { forestState, type ForestState } from "@/lib/forest";
import { applyForestControl, AUTO_FOREST, readForestControl, type ForestControl, type ForestView } from "@/lib/forest-control";
import { audit } from "@/lib/staff/access";
import { deny, type Result } from "@/lib/staff/util";
import { todayKst } from "@/lib/time";
import type { Staff } from "@/lib/types";

/** What an admin set by hand for the shared forest (see src/lib/forest-control.ts). Nothing stored means all auto. */
const KEY = "forest_control";

export async function getForestControl(q: Queryable = db): Promise<ForestControl> {
  const row = await one<{ value: unknown }>(q, "select value from settings where key = $1", [KEY]);
  return row ? readForestControl(row.value) : AUTO_FOREST;
}

/**
 * The forest for the children's screen: grown by its own rules up to today (forestState also records
 * the weeks, so the forest keeps growing while a size is set by hand), then dressed as the admin set it.
 */
export async function forestView(q: Queryable = db, today: string = todayKst()): Promise<ForestView> {
  const auto = await forestState(q, today);
  return applyForestControl(auto, await getForestControl(q), today);
}

/** For the admin's board: the forest by its own rules, and what is set by hand. */
export async function forestBoard(q: Queryable = db, today: string = todayKst()): Promise<{ auto: ForestState; saved: ForestControl }> {
  return { auto: await forestState(q, today), saved: await getForestControl(q) };
}

/** Admins only. Takes what the board posts; anything it does not know is stored as auto. */
export async function saveForestControl(staff: Staff, input: unknown): Promise<Result> {
  if (staff.role !== "admin") return deny;
  const before = await getForestControl(db);
  const after = readForestControl(input);
  await db.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [KEY, JSON.stringify(after)]);
  await audit(db, staff.id, "forest_control_update", "settings", null, { before, after });
  return { ok: true };
}
