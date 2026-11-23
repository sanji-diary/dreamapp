import { redirect } from "next/navigation";
import { GiftForm } from "@/components/staff/GiftForm";
import { EmptyNote, FlashNote, Page, PageHeader, SectionHead } from "@/components/staff/kit";
import { requireStaff } from "@/lib/auth";
import { approveScope, hasScope } from "@/lib/staff/access";
import { giftAction } from "@/lib/staff/actions";
import { GIFT_MAX_DROPS, GIFT_MAX_POINTS, giftChildren, recentGifts } from "@/lib/staff/gifts";
import { shortDate, toInt } from "@/lib/staff/util";

export const metadata = { title: "선물 주기 · 꿈의숲키우기" };

/**
 * 선물 주기: drops, points or both for one child or several, apart from any mission.
 * For teachers who may confirm missions (their own classes) and admins (everyone).
 * `?child=` starts with that child chosen (from the child's page).
 */
export default async function GiftPage({ searchParams }: PageProps<"/staff/gift">) {
  const staff = await requireStaff();
  if (!hasScope(approveScope(staff))) redirect("/staff");
  const [sp, kids, recent] = await Promise.all([searchParams, giftChildren(staff), recentGifts(staff)]);
  const preselect = toInt(sp.child);

  return (
    <Page narrow>
      <PageHeader back="/staff" backLabel="홈으로 돌아가기" title="선물 주기" sub="미션과 상관없이 물방울이나 포인트를 줄 수 있어요" />
      <FlashNote ok={sp.ok} error={sp.error} />
      {kids.length === 0 ? (
        <EmptyNote>선물을 줄 수 있는 아이가 아직 없어요.</EmptyNote>
      ) : (
        // A new key after each gift, so the form starts empty again.
        <GiftForm key={`${recent[0]?.id ?? 0}-${preselect ?? 0}`} kids={kids} preselect={preselect} maxDrops={GIFT_MAX_DROPS} maxPoints={GIFT_MAX_POINTS} action={giftAction} error={sp.error} />
      )}
      {recent.length > 0 ? (
        <section className="flex flex-col">
          <SectionHead note={staff.role === "admin" ? "모든 선생님" : "내가 준 것"}>최근에 준 선물</SectionHead>
          {recent.map((r) => (
            <div key={r.id} className="flex min-h-11 items-center gap-2 border-b border-line py-2 last:border-b-0">
              <span className="flex min-w-0 grow flex-col">
                <span className="text-[14px] text-ink2">
                  <b>{r.who}</b> {r.reason}
                </span>
                <span className="text-[12px] text-mute">
                  {shortDate(r.on)} · {r.staff_name ?? "알 수 없음"}
                </span>
              </span>
              <b className="shrink-0 text-right text-[14px] whitespace-nowrap text-blue">{[r.drops > 0 ? `물방울 ${r.drops}개` : "", r.points > 0 ? `${r.points}P` : ""].filter(Boolean).join(" · ")}</b>
            </div>
          ))}
        </section>
      ) : null}
    </Page>
  );
}
