import { ScanScreen } from "@/components/kid/ScanScreen";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings, missionsForChild } from "@/lib/game";
import { canCheckIn } from "@/lib/kid/check-in";
import { todayKst } from "@/lib/time";

export const metadata = { title: "출석 체크 · 꿈의숲키우기" };

/** The in-app camera for the QR posted at church: attendance on Sundays (and on the extra days of an event period), and any other QR mission. */
export default async function ScanPage() {
  const kid = await requireKid();
  const [missions, settings] = await Promise.all([missionsForChild(db, kid.id), getSettings()]);
  return <ScanScreen attendance={canCheckIn(missions, todayKst(), settings.event)} />;
}
