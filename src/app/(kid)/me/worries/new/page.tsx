import { redirect } from "next/navigation";
import { WorryForm } from "@/components/kid/MissionForms";
import { MissionShell } from "@/components/kid/MissionShell";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { missionsForChild } from "@/lib/game";
import { audienceChoices } from "@/lib/kid/audience";

export const metadata = { title: "고민 적기 · 꿈의숲키우기" };

/** Writing a worry outside the weekly mission. If the mission is still open, use that screen so the reward shows. */
export default async function NewWorryPage() {
  const kid = await requireKid();
  const open = (await missionsForChild(db, kid.id)).find((m) => m.kind === "worry" && m.state === "available");
  if (open) redirect(`/missions/${open.id}`);
  return (
    <MissionShell back="/me/worries" backLabel="내 고민으로 돌아가기" title={"요즘 마음에 걸리는\n일이 있나요?"} sub="작은 일도 괜찮아요. 편하게 적어 주세요.">
      <WorryForm options={await audienceChoices(kid.id)} sendLabel="보내기" />
    </MissionShell>
  );
}
