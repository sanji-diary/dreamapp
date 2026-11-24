import { AdminHeader } from "@/components/staff/admin-kit";
import { ForestBoard } from "@/components/staff/ForestBoard";
import { FlashNote, Page } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { forestBoard } from "@/lib/forest-setting";
import { forestSaveAction } from "@/lib/staff/actions-admin";
import { todayKst } from "@/lib/time";

export const metadata = { title: "우리 숲 · 꿈의숲키우기" };

/** The board that sets what the children's shared forest shows: by its own rules, or by hand, part by part. */
export default async function ForestAdminPage({ searchParams }: PageProps<"/staff/admin/forest">) {
  await requireAdmin();
  const [sp, board] = await Promise.all([searchParams, forestBoard()]);
  return (
    <Page>
      <AdminHeader title="우리 숲" />
      <FlashNote ok={sp.ok} error={sp.error} />
      <ForestBoard key={JSON.stringify(board.saved)} auto={board.auto} saved={board.saved} today={todayKst()} now={new Date().toISOString()} action={forestSaveAction} />
    </Page>
  );
}
