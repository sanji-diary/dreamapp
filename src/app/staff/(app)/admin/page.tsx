import { AdminGrid } from "@/components/staff/AdminMenu";
import { Chevron, ClayIcon, List, ListRow, Page, PageHeader } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "운영 · 꿈의숲키우기" };

/**
 * Every admin screen in one place. The other admin pages link back here ("관리로 돌아가기");
 * on phones it is the same icon grid as on 더보기, on wide screens the sidebar covers the main ones.
 */
export default async function AdminHome() {
  await requireAdmin();
  return (
    <Page narrow>
      <PageHeader title="운영" sub="관리자만 볼 수 있는 화면이에요" />
      <AdminGrid />
      <List>
        <ListRow href="/staff/admin/worship" left={<ClayIcon name="bible" size="s" />} title="예배 순서" sub="이번 주 예배와 암송 말씀" right={<Chevron />} />
        <ListRow href="/staff/admin/notices" left={<ClayIcon name="badge" size="s" />} title="공지" sub="행사와 교사용 공지" right={<Chevron />} />
      </List>
    </Page>
  );
}
