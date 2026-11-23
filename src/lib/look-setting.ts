import "server-only";
import { db, one, type Queryable } from "@/lib/db";
import { AUTO_LOOK, FESTIVALS, readLookChoice, SEASONS, type LookChoice } from "@/lib/kid/home-look";
import { audit } from "@/lib/staff/access";
import { deny, fail, type Result } from "@/lib/staff/util";
import type { Staff } from "@/lib/types";

/**
 * The look an admin chose for every child's tree screen ("첫 화면 모습"), kept in settings as 'home_look'.
 * Nothing stored means 자동: the screen follows the calendar.
 */
const KEY = "home_look";

export async function getLookChoice(q: Queryable = db): Promise<LookChoice> {
  const row = await one<{ value: unknown }>(q, "select value from settings where key = $1", [KEY]);
  return row ? readLookChoice(row.value) : AUTO_LOOK;
}

/** Admins only. The values are the ones the board posts: a season or "auto", a special time or "auto" or "none". */
export async function saveLookChoice(staff: Staff, input: { season: string; festival: string }): Promise<Result> {
  if (staff.role !== "admin") return deny;
  const seasonOk = input.season === "auto" || SEASONS.some((s) => s === input.season);
  const festivalOk = input.festival === "auto" || input.festival === "none" || FESTIVALS.some((f) => f === input.festival);
  if (!seasonOk || !festivalOk) return fail("모습을 다시 골라 주세요");
  const before = await getLookChoice(db);
  const after = readLookChoice(input);
  await db.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [KEY, JSON.stringify(after)]);
  await audit(db, staff.id, "home_look_update", "settings", null, { before, after });
  return { ok: true };
}
