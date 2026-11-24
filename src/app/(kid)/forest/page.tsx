import { ForestMap } from "@/components/kid/ForestMap";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeOfDay } from "@/lib/forest";
import { forestView } from "@/lib/forest-setting";

export const metadata = { title: "우리 숲 · 꿈의숲키우기" };

/** "우리 숲": the department's shared forest round the church. Opened from the small button on the home screen. */
export default async function ForestPage() {
  await requireKid();
  // The forest by its own rules, with whatever an admin set by hand (운영 > 우리 숲) put over it.
  const { timeFixed, ...forest } = await forestView(db);
  return <ForestMap {...forest} time={timeFixed ?? timeOfDay(new Date(), forest.season)} timeFixed={timeFixed !== null} />;
}
