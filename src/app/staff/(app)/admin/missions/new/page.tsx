import { MissionForm } from "@/components/staff/MissionForm";
import { FlashNote, Page, PageHeader } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { defaultMissionInput } from "@/lib/staff/admin-missions";
import { missionFormOptions } from "@/lib/staff/mission-options";
import { weekStart } from "@/lib/time";

export const metadata = { title: "미션 만들기 · 꿈의숲키우기" };

export default async function NewMissionPage({ searchParams }: PageProps<"/staff/admin/missions/new">) {
  await requireAdmin();
  const sp = await searchParams;
  const options = await missionFormOptions();
  const error = typeof sp.error === "string" ? sp.error : undefined;
  // "+ 미션 만들기" on another week's list starts the form on that week (?w=).
  const week = typeof sp.w === "string" ? sp.w : undefined;
  // "+ 만들기" on the plan screen starts a fixed or rotating mission (?mode=).
  const mode = sp.mode === "fixed" || sp.mode === "pool" ? sp.mode : "dated";
  const initial = { ...defaultMissionInput(week), mode, repeat: "weekly" };
  return (
    <Page narrow>
      <PageHeader back={mode === "dated" ? "/staff/admin/missions" : `/staff/admin/missions#${mode === "fixed" ? "fixed" : "rotation"}`} backLabel="미션 목록으로 돌아가기" title="미션 만들기" />
      <FlashNote error={sp.error} />
      <MissionForm id={null} initial={initial} thisWeek={weekStart()} error={error} {...options} />
    </Page>
  );
}
