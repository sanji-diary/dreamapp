import { FestivalPay } from "@/components/staff/FestivalPay";
import { ClayIcon, CtaLink, Page, PageHeader } from "@/components/staff/kit";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { festivalKids, festivalLevels } from "@/lib/staff/festival";
import { lastPayment, openEvent } from "@/lib/talents";

export const metadata = { title: "달란트 결제 · 꿈의숲키우기" };

/** Payment screen for the stalls. Every signed-in teacher may use it while an event is open. */
export default async function FestivalPage() {
  const staff = await requireStaff();
  const event = await openEvent();
  if (!event) {
    return (
      <Page narrow>
        <PageHeader back="/staff" backLabel="홈으로 돌아가기" title="달란트 결제" />
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-fill px-4 py-7 text-center">
          <ClayIcon name="pouch" onWhite />
          <b className="mt-1 text-[17px] tracking-[-0.025em]">지금 열린 잔치가 없어요</b>
          <p className="m-0 text-[14px] leading-[21px] text-mute">잔치가 시작되면 여기에서 아이들의 달란트를 결제할 수 있어요.</p>
        </div>
        {staff.role === "admin" ? <CtaLink href="/staff/admin/talents">달란트 잔치 준비하러 가기</CtaLink> : null}
      </Page>
    );
  }
  const [kids, classes, last, levels] = await Promise.all([festivalKids(staff), listClasses(db), lastPayment(staff), festivalLevels(staff)]);
  return (
    <FestivalPay
      eventName={event.name}
      kids={kids}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      levels={levels}
      last={last ? { childName: last.child_name, amount: last.amount, secondsLeft: last.seconds_left } : null}
    />
  );
}
