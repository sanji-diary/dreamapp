import "server-only";
import { db, type Queryable } from "@/lib/db";

/** A gift from a teacher (src/lib/staff/gifts.ts), as the child's tree screen shows it. */
export interface KidGift {
  id: number;
  drops: number;
  points: number;
  reason: string;
}

/** Gifts of the last seven days, oldest first. The phone remembers which ones it has shown. */
export async function giftsForKid(childId: number, q: Queryable = db): Promise<KidGift[]> {
  return q.query<KidGift>(
    `select g.ref_id as id, sum(g.drops)::int as drops, sum(g.points)::int as points, max(g.reason) as reason
       from (
         select ref_id, delta as drops, 0 as points, reason from drop_ledger
          where child_id = $1 and ref_type = 'gift' and ref_id is not null and created_at > now() - interval '7 days'
         union all
         select ref_id, 0, delta, reason from point_ledger
          where child_id = $1 and ref_type = 'gift' and ref_id is not null and created_at > now() - interval '7 days'
       ) g
      group by g.ref_id order by g.ref_id`,
    [childId],
  );
}
