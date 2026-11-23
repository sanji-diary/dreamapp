import { ScanScreen } from "@/components/kid/ScanScreen";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { missionsForChild } from "@/lib/game";
import { canCheckIn } from "@/lib/kid/check-in";

export const metadata = { title: "출석 체크 · 꿈의숲키우기" };

/** The in-app camera for the QR posted at church: attendance on Sundays, and any other QR mission. */
export default async function ScanPage() {
  const kid = await requireKid();
  const missions = await missionsForChild(db, kid.id);
  return <ScanScreen attendance={canCheckIn(missions)} />;
}
