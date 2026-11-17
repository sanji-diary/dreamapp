import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/lib/staff/actions";
import { ROLE_NAMES, type Staff } from "@/lib/types";
import { ActiveLink } from "./ActiveLink";
import { CountBadge, LineIcon, TeacherAvatar, type LineIconName } from "./kit";
import { ADMIN_MENU } from "./menu";
import { QuickSheet, type QuickAction } from "./QuickSheet";

/**
 * The frame around every teacher screen: a bottom tab bar on phones, a left sidebar on wide screens.
 * Items a teacher cannot use are not rendered; the pages check permissions again on their own.
 */

export interface ShellNav {
  attendance: boolean;
  worries: boolean;
  admin: boolean;
  /** Fifth tab on phones (see fifthTab in lib/staff/access). */
  fifth: "more" | "attendance";
}

export interface ShellBadges {
  /** Mission submissions and reported comments. */
  approvals: number;
  /** Unread worries this teacher may read. */
  worries: number;
}

/* ---------- phones ---------- */

function Tab({ href, match, exact, icon, label, badge = 0 }: { href: string; match?: string[]; exact?: boolean; icon: LineIconName; label: string; badge?: number }) {
  return (
    <ActiveLink
      href={href}
      match={match}
      exact={exact}
      className="flex h-full w-full min-w-0 flex-col items-center gap-[3px] text-[11px] whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy"
      on="font-bold text-ink"
      off="font-medium text-mute"
    >
      <span className="relative">
        <LineIcon name={icon} size={23} />
        <CountBadge n={badge} className="absolute -top-[5px] left-[13px] ring-2 ring-white" />
      </span>
      {label}
    </ActiveLink>
  );
}

export function TabBar({ nav, badges, actions }: { nav: ShellNav; badges: ShellBadges; actions: QuickAction[] }) {
  return (
    <nav aria-label="교사 메뉴" className="sticky bottom-0 z-20 h-[76px] shrink-0 border-t border-line bg-white lg:hidden print:hidden">
      {/* The bar spans the screen; the five slots stay together in the middle on an unfolded phone or a tablet. */}
      <div className="mx-auto grid h-full max-w-[560px] grid-cols-5 justify-items-center pt-[9px] pb-[max(6px,env(safe-area-inset-bottom))]">
        <Tab href="/staff" exact icon="home" label="홈" />
        <Tab href="/staff/children" icon="kids" label="우리 반" />
        <QuickSheet actions={actions} />
        <Tab href="/staff/approvals" match={["/staff/approvals", "/staff/worries"]} icon="list" label="할 일" badge={badges.approvals + badges.worries} />
        {nav.fifth === "attendance" ? <Tab href="/staff/attendance" icon="check" label="출석" /> : <Tab href="/staff/more" match={["/staff/more", "/staff/admin"]} icon="grid" label="더보기" />}
      </div>
    </nav>
  );
}

/* ---------- wide screens ---------- */

function NavItem({ href, match, exact, icon, children, badge = 0 }: { href: string; match?: string[]; exact?: boolean; icon: LineIconName; children: ReactNode; badge?: number }) {
  return (
    <ActiveLink
      href={href}
      match={match}
      exact={exact}
      className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy"
      on="bg-navy-tint font-bold text-navy"
      off="font-medium text-sub hover:bg-fill"
    >
      <LineIcon name={icon} size={18} />
      {children}
      <CountBadge n={badge} small className="ml-auto" />
    </ActiveLink>
  );
}

export function Sidebar({ staff, nav, badges }: { staff: Staff; nav: ShellNav; badges: ShellBadges }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[216px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-white px-3 py-[18px] text-[13.5px] leading-[1.4] tracking-[-0.015em] lg:flex print:hidden">
      <Link href="/staff" className="flex items-center gap-2 rounded-[10px] px-2 pt-0.5 pb-4 text-[16px] font-bold tracking-[-0.03em] text-ink no-underline focus-visible:outline-2 focus-visible:outline-navy">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src="/img/tree-big.webp" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
        꿈의숲키우기
      </Link>
      <nav aria-label="교사 메뉴" className="flex flex-col gap-0.5">
        <NavItem href="/staff" exact icon="home">
          대시보드
        </NavItem>
        {nav.attendance ? (
          <NavItem href="/staff/attendance" icon="check">
            출석
          </NavItem>
        ) : null}
        <NavItem href="/staff/children" icon="kids">
          교적부
        </NavItem>
        <NavItem href="/staff/approvals" icon="list" badge={badges.approvals}>
          미션 확인
        </NavItem>
        {nav.worries ? (
          <NavItem href="/staff/worries" icon="chat" badge={badges.worries}>
            고민
          </NavItem>
        ) : null}
        {nav.admin ? (
          <>
            {/* The heading opens the page that lists every admin screen (the sidebar shows the main ones). */}
            <Link href="/staff/admin" className="mt-1 rounded-[10px] px-2.5 pt-3.5 pb-1 text-[11.5px] font-semibold text-faint no-underline hover:text-sub focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy">
              운영
            </Link>
            {ADMIN_MENU.map((m) => (
              <NavItem key={m.href} href={m.href} match={m.match} icon={m.icon}>
                {m.label}
              </NavItem>
            ))}
          </>
        ) : null}
      </nav>
      <span className="min-h-4 grow" />
      <div className="flex items-center gap-1">
        <Link href="/staff/more" className="flex min-w-0 grow items-center gap-2.5 rounded-[10px] px-1.5 py-2 text-ink no-underline hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy">
          <TeacherAvatar name={staff.name} />
          <span className="flex min-w-0 flex-col">
            <b className="truncate">{staff.name}</b>
            <span className="text-[12px] text-mute">{ROLE_NAMES[staff.role]}</span>
          </span>
        </Link>
        <form action={signOutAction}>
          <button type="submit" aria-label="로그아웃" title="로그아웃" className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-mute hover:bg-fill hover:text-ink2 focus-visible:outline-2 focus-visible:outline-navy">
            <LineIcon name="out" size={18} />
          </button>
        </form>
      </div>
    </aside>
  );
}
