import Link from "next/link";
import { FestivalPay } from "@/components/staff/FestivalPay";
import { TabHeader } from "@/components/staff/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { festivalKids } from "@/lib/staff/festival";
import { lastPayment, openEvent } from "@/lib/talents";

export const metadata = { title: "달란트 잔치 결제 · 꿈의숲키우기" };

/** Payment screen for the stalls. Every signed-in teacher may use it while an event is open. */
export default async function FestivalPage() {
  const staff = await requireStaff();
  const event = await openEvent();
  if (!event) {
    return (
      <>
        <TabHeader title="달란트 잔치" sub="지금 열린 잔치가 없어요" />
        <div className="flex flex-col gap-3 px-4 pt-6">
          <p className="m-0 text-[15px] leading-[23px] text-sub">잔치가 시작되면 여기에서 아이들의 달란트를 결제할 수 있어요.</p>
          {staff.role === "admin" ? (
            <Link href="/staff/admin/talents" className="flex h-11 w-fit items-center text-[15px] font-bold text-navy">
              달란트 잔치 준비하러 가기
            </Link>
          ) : null}
        </div>
      </>
    );
  }
  const [kids, classes, last] = await Promise.all([festivalKids(staff), listClasses(db), lastPayment(staff)]);
  return (
    <FestivalPay
      eventName={event.name}
      kids={kids}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      last={last ? { childName: last.child_name, amount: last.amount, secondsLeft: last.seconds_left } : null}
    />
  );
}
