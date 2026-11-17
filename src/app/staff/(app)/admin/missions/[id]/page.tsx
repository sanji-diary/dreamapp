import { notFound } from "next/navigation";
import { MissionForm } from "@/components/staff/MissionForm";
import { FlashNote, Notice, Page, PageHeader, PillLink } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { parseQuiz } from "@/lib/quiz";
import { getMission } from "@/lib/staff/admin-missions";
import { missionFormOptions } from "@/lib/staff/mission-options";
import { toInt } from "@/lib/staff/util";
import { parseVerses } from "@/lib/verse";
import { weekStart } from "@/lib/time";

export const metadata = { title: "미션 고치기 · 꿈의숲키우기" };

export default async function EditMissionPage({ params, searchParams }: PageProps<"/staff/admin/missions/[id]">) {
  const staff = await requireAdmin();
  const id = toInt((await params).id);
  const sp = await searchParams;
  const m = id === null ? null : await getMission(staff, id);
  if (!m) notFound();
  const options = await missionFormOptions();
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return (
    <Page narrow>
      <PageHeader back={m.mode === "dated" ? `/staff/admin/missions?w=${weekStart(m.starts_on)}&id=${m.id}` : `/staff/admin/missions?id=${m.id}`} backLabel="미션 목록으로 돌아가기" title="미션 고치기" />
      <FlashNote error={sp.error} />
      {!m.active ? <Notice tone="warn">지금은 받지 않는 미션이에요. 미션 목록에서 ‘다시 받기’를 누르면 아이들에게 다시 보여요.</Notice> : null}
      {m.qr_code ? (
        <div className="flex items-center gap-3 rounded-[20px] bg-fill py-1.5 pr-3 pl-4">
          <p className="m-0 min-w-0 grow text-[13px] leading-[19px] text-sub">아이들이 찍을 QR이 준비되어 있어요.</p>
          <PillLink href={`/staff/admin/missions/${m.id}/qr`}>QR 인쇄</PillLink>
        </div>
      ) : null}
      <MissionForm
        id={m.id}
        initial={{
          title: m.title, description: m.description, kind: m.kind, icon: m.icon, points: m.points, drops: m.drops, repeat: m.repeat, weekly_limit: m.weekly_limit,
          verse_text: m.verse_text, verse_ref: m.verse_ref, target_grade: m.target_grade, target_class_id: m.target_class_id, starts_on: m.starts_on, ends_on: m.ends_on, is_challenge: m.is_challenge,
          qr_self: m.kind === "attendance" && m.qr_code !== null, quiz: m.kind === "quiz" ? parseQuiz(m.quiz) : null, quiz_pass: m.quiz_pass, game_id: m.game_id,
          mode: m.mode, verses: parseVerses(m.verses),
        }}
        thisWeek={weekStart()}
        error={error}
        {...options}
      />
    </Page>
  );
}
