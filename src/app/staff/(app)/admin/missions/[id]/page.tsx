import { notFound } from "next/navigation";
import { MissionForm } from "@/components/staff/MissionForm";
import { Flash, SubHeader } from "@/components/staff/ui";
import { requireAdmin } from "@/lib/auth";
import { getMission } from "@/lib/staff/admin-missions";
import { missionFormOptions } from "@/lib/staff/mission-options";
import { toInt } from "@/lib/staff/util";

export const metadata = { title: "미션 수정 · 꿈의숲키우기" };

export default async function EditMissionPage({ params, searchParams }: PageProps<"/staff/admin/missions/[id]">) {
  const staff = await requireAdmin();
  const id = toInt((await params).id);
  const sp = await searchParams;
  const m = id === null ? null : await getMission(staff, id);
  if (!m) notFound();
  const options = await missionFormOptions();
  return (
    <>
      <SubHeader back="/staff/admin/missions" backLabel="미션 목록으로 돌아가기" title="미션 수정" />
      <Flash error={sp.error} />
      {m.kind === "qr" && m.qr_code ? <p className="mx-4 mt-2 mb-0 rounded-[10px] bg-fill px-3 py-2.5 text-[13px] leading-[19px] text-sub">QR 코드 값: {m.qr_code}</p> : null}
      <MissionForm
        id={m.id}
        initial={{
          title: m.title, description: m.description, kind: m.kind, icon: m.icon, points: m.points, drops: m.drops, repeat: m.repeat, weekly_limit: m.weekly_limit,
          verse_text: m.verse_text, verse_ref: m.verse_ref, target_grade: m.target_grade, target_class_id: m.target_class_id, starts_on: m.starts_on, ends_on: m.ends_on, is_challenge: m.is_challenge,
        }}
        {...options}
      />
    </>
  );
}
