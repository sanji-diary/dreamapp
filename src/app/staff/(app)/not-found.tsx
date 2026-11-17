import { CtaLink, Page, PageHeader } from "@/components/staff/kit";

/**
 * Shown inside the teacher frame when a page calls notFound(). A child outside the teacher's scope
 * and a child that does not exist end up here alike, so the words say nothing about which it was.
 */
export default function StaffNotFound() {
  return (
    <Page narrow>
      <PageHeader title="찾을 수 없어요" />
      <p className="m-0 text-[15px] leading-[23px] text-sub">없는 화면이거나, 선생님이 볼 수 없는 정보예요. 주소를 다시 확인하거나 홈에서 다시 찾아 주세요.</p>
      <div className="lg:max-w-[240px]">
        <CtaLink href="/staff">홈으로 가기</CtaLink>
      </div>
    </Page>
  );
}
