import { AdminHeader } from "@/components/staff/admin-kit";
import { LookBoard } from "@/components/staff/LookBoard";
import { FlashNote, Page } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { getLookChoice } from "@/lib/look-setting";
import { lookSaveAction } from "@/lib/staff/actions-admin";
import { todayKst } from "@/lib/time";

export const metadata = { title: "첫 화면 모습 · 꿈의숲키우기" };

/** The board that sets how every child's tree screen is dressed: by the calendar, or by hand. */
export default async function LookPage({ searchParams }: PageProps<"/staff/admin/look">) {
  await requireAdmin();
  const [sp, saved] = await Promise.all([searchParams, getLookChoice()]);
  return (
    <Page>
      <AdminHeader title="첫 화면 모습" />
      <FlashNote ok={sp.ok} error={sp.error} />
      <LookBoard key={`${saved.season}-${saved.festival}`} saved={saved} today={todayKst()} action={lookSaveAction} />
    </Page>
  );
}
