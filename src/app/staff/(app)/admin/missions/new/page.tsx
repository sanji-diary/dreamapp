import { MissionForm } from "@/components/staff/MissionForm";
import { Flash, SubHeader } from "@/components/staff/ui";
import { requireAdmin } from "@/lib/auth";
import { missionFormOptions } from "@/lib/staff/mission-options";
import { defaultMissionInput } from "@/lib/staff/admin-missions";

export const metadata = { title: "미션 만들기 · 꿈의숲키우기" };

export default async function NewMissionPage({ searchParams }: PageProps<"/staff/admin/missions/new">) {
  await requireAdmin();
  const sp = await searchParams;
  const options = await missionFormOptions();
  return (
    <>
      <SubHeader back="/staff/admin/missions" backLabel="미션 목록으로 돌아가기" title="미션 만들기" />
      <Flash error={sp.error} />
      <MissionForm id={null} initial={defaultMissionInput()} {...options} />
    </>
  );
}
