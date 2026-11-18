import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/staff/kit";
import type { TodoCounts } from "@/lib/staff/review";
import { weekLabel } from "@/lib/time";

export type TodoPart = "missions" | "worries" | "comments";

/**
 * Top of the three "할 일" screens (미션 확인, 고민, 신고된 댓글), so they read as one screen.
 *
 * Below `lg`: the title "할 일" with this week's label and a switch 미션 N / 고민 N / 댓글 N. Only the
 * parts this teacher may use get a segment (`counts` holds null for the others); with a single
 * part there is nothing to switch and the switch is left out. `phone={false}` drops this whole
 * block for a sub screen that has its own header there (a worry being read).
 *
 * From `lg` the sidebar does the switching, so only the page's own title is shown, with the
 * controls of the top bar in `right`.
 */
export function TodoHeader({ active, counts, wideTitle, wideCount, right, phone = true }: { active: TodoPart; counts: TodoCounts; wideTitle: string; wideCount?: string; right?: ReactNode; phone?: boolean }) {
  const items = [
    counts.missions !== null ? { href: "/staff/approvals", label: `미션 ${counts.missions}`, on: active === "missions" } : null,
    // The list of worries marks nothing as read (only opening one does), so this link may be prefetched.
    counts.worries !== null ? { href: "/staff/worries", label: `고민 ${counts.worries}`, on: active === "worries" } : null,
    { href: "/staff/approvals?tab=comments", label: `댓글 ${counts.comments}`, on: active === "comments" },
  ].filter((it) => it !== null);
  return (
    <>
      {phone ? (
        <div className="flex flex-col gap-3.5 lg:hidden">
          <PageHeader title="할 일" right={<span className="shrink-0 text-[13px] text-mute">{weekLabel()}</span>} />
          {items.length > 1 ? (
            // The look of the kit's Segmented. It is drawn here because this is the main switch of a phone
            // screen: each segment's tap area (::after) reaches over the 3px rim, which makes it 44px tall.
            <nav aria-label="할 일 나누어 보기" className="grid rounded-xl bg-fill p-[3px] text-center text-[13px] font-semibold sm:max-w-[420px]" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={it.on ? "page" : undefined}
                  className={`relative flex h-[38px] items-center justify-center rounded-[9px] no-underline after:absolute after:inset-x-0 after:-inset-y-[3px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-staff ${it.on ? "bg-white font-bold text-ink shadow-[0_1px_3px_rgba(25,31,40,0.1)]" : "text-mute"}`}
                >
                  {it.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      ) : null}
      <div className="hidden lg:block">
        <PageHeader title={wideTitle} count={wideCount} right={right} />
      </div>
    </>
  );
}
