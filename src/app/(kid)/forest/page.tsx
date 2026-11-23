import { ForestMap } from "@/components/kid/ForestMap";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { forestState, timeOfDay } from "@/lib/forest";

export const metadata = { title: "우리 숲 · 꿈의숲키우기" };

/** "우리 숲": the department's shared forest round the church. Opened from the small button on the home screen. */
export default async function ForestPage() {
  await requireKid();
  const forest = await forestState(db);
  return <ForestMap {...forest} time={timeOfDay(new Date(), forest.season)} />;
}
