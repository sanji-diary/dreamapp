import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/lib/staff/actions";
import { ROLE_NAMES, type Staff } from "@/lib/types";
import { ActiveLink } from "./ActiveLink";
import { CountBadge, LineIcon, type LineIconName } from "./kit";
import { ADMIN_MENU } from "./menu";
import { QuickSheet, type QuickAction } from "./QuickSheet";

/**
 * The frame around every teacher screen (design-reference/admin2).
 * - Phones and tablets (below `lg`): a white page with the tab bar at the bottom.
 * - From `lg`: a white panel with rounded corners on a lavender ground. In it, the menu on the left
 *   (grouped like a cafe admin page) and, on the right, a top bar (search, 할 일, 내 정보) above the page.
 * Items a teacher cannot use are not rendered; the pages check permissions again on their own.
 */

export interface ShellNav {
  attendance: boolean;
  worries: boolean;
  admin: boolean;
  /** May give gifts (drops or points apart from missions). */
  gift: boolean;
  /** Fifth tab on phones (see fifthTab in lib/staff/access). */
  fifth: "more" | "attendance";
}

export interface ShellBadges {
  /** Mission submissions and reported comments. */
  approvals: number;
  /** Unread worries this teacher may read. */
  worries: number;
}

/** A homeroom teacher in the menu's "선생님" group (admins only). */
export interface ShellTeacher {
  id: number;
  name: string;
  /** Their classes, short ("4-1반"), or "" when they have none. */
  classes: string;
}

/* ---------- phones ---------- */

function Tab({ href, match, exact, icon, label, badge = 0 }: { href: string; match?: string[]; exact?: boolean; icon: LineIconName; label: string; badge?: number }) {
  return (
    <ActiveLink
      href={href}
      match={match}
      exact={exact}
      className="flex h-full w-full min-w-0 flex-col items-center gap-[3px] text-[11px] whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-staff"
      on="font-bold text-staff"
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

/** The orange count beside a menu item. On the open (accent) item it turns white. */
function MenuCount({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-auto grid h-[22px] min-w-[22px] place-items-center rounded-full bg-badge px-[7px] text-[12px] leading-none font-bold text-white group-aria-[current=page]:bg-white group-aria-[current=page]:text-staff">
      {n > 99 ? "99+" : n}
      <span className="sr-only">건</span>
    </span>
  );
}

function NavItem({ href, match, exact, icon, children, badge = 0 }: { href: string; match?: string[]; exact?: boolean; icon: LineIconName; children: ReactNode; badge?: number }) {
  return (
    <ActiveLink
      href={href}
      match={match}
      exact={exact}
      className="group flex h-11 shrink-0 items-center gap-3 rounded-[10px] px-3 text-[15px] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff"
      on="bg-staff font-semibold text-white"
      off="font-medium text-ink2 hover:bg-fill"
    >
      <LineIcon name={icon} size={20} stroke={1.8} />
      <span className="min-w-0 grow truncate">{children}</span>
      <MenuCount n={badge} />
    </ActiveLink>
  );
}

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-[18px] flex flex-col gap-0.5">
      <p className="m-0 mb-1.5 px-3 text-[12px] font-semibold text-mute">{label}</p>
      {children}
    </div>
  );
}

const TEACHER_TINTS = ["bg-[#e3e9fd] text-[#2a3cae]", "bg-[#dcf2e5] text-[#1d6b3a]", "bg-[#fcefd0] text-[#7a4a00]", "bg-[#fce4ec] text-[#a1264f]", "bg-[#ebe5fb] text-[#5534b8]", "bg-[#d9f0f3] text-[#0f5f6c]"];

/** A small round initial for people in lists: the given name (the last one or two letters), on one of six soft tints. */
export function NameDot({ name, seed, size = 28 }: { name: string; seed: number; size?: number }) {
  const given = name.length >= 3 ? name.slice(1) : name;
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-bold tracking-[-0.04em] ${TEACHER_TINTS[Math.abs(seed) % TEACHER_TINTS.length]}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {given.slice(0, 3)}
    </span>
  );
}

export function Sidebar({ nav, badges, teachers }: { nav: ShellNav; badges: ShellBadges; teachers: ShellTeacher[] }) {
  return (
    <aside className="sticky top-4 hidden h-[calc(100dvh-32px)] w-[248px] shrink-0 flex-col overflow-y-auto [scrollbar-color:#dfe3ea_transparent] [scrollbar-width:thin] border-r border-[#eef0f4] bg-white px-3.5 pt-[18px] pb-4 leading-[1.4] tracking-[-0.015em] lg:flex print:hidden">
      <Link href="/staff" className="flex h-11 shrink-0 items-center gap-2.5 rounded-[10px] px-2 text-[19px] font-extrabold tracking-[-0.03em] text-ink no-underline focus-visible:outline-2 focus-visible:outline-staff">
        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-[10px] bg-staff text-white">
          <LineIcon name="leaf" size={18} stroke={2} />
        </span>
        꿈의숲키우기
      </Link>
      <nav aria-label="교사 메뉴" className="flex flex-col">
        <MenuGroup label="자주 쓰는 메뉴">
          <NavItem href="/staff" exact icon="home">
            홈
          </NavItem>
          <NavItem href="/staff/children" icon="kids">
            교적부
          </NavItem>
          {nav.attendance ? (
            <NavItem href="/staff/attendance" icon="check">
              출석
            </NavItem>
          ) : null}
          <NavItem href="/staff/approvals" icon="list" badge={badges.approvals}>
            미션 확인
          </NavItem>
          {nav.worries ? (
            <NavItem href="/staff/worries" icon="chat" badge={badges.worries}>
              고민 상담
            </NavItem>
          ) : null}
          {nav.gift ? (
            <NavItem href="/staff/gift" icon="send">
              선물 주기
            </NavItem>
          ) : null}
        </MenuGroup>
        {nav.admin ? (
          <MenuGroup label="운영">
            {ADMIN_MENU.map((m) => (
              <NavItem key={m.href} href={m.href} match={m.match} icon={m.icon}>
                {m.label}
              </NavItem>
            ))}
          </MenuGroup>
        ) : null}
        {nav.admin && teachers.length > 0 ? (
          <MenuGroup label="선생님">
            {teachers.map((t) => (
              <Link
                key={t.id}
                href={`/staff/admin/staff/${t.id}`}
                className="flex h-10 shrink-0 items-center gap-3 rounded-[10px] px-3 text-[14.5px] text-ink2 no-underline hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff"
              >
                <NameDot name={t.name} seed={t.id} />
                <span className="min-w-0 grow truncate">{t.name}</span>
                {t.classes ? <span className="shrink-0 text-[12.5px] text-mute">{t.classes}</span> : null}
              </Link>
            ))}
            <Link href="/staff/admin/staff?new=1" className="flex h-10 shrink-0 items-center gap-3 rounded-[10px] px-3 text-[14.5px] font-semibold text-staff no-underline hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
              <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-dashed border-staff">
                <LineIcon name="plus" size={14} stroke={2.2} />
              </span>
              선생님 초대
            </Link>
          </MenuGroup>
        ) : null}
      </nav>
      <span className="min-h-5 grow" />
      <div className="flex shrink-0 items-center gap-1 border-t border-[#eef0f4] pt-2.5">
        {nav.admin ? (
          <Link href="/staff/admin/settings" className="flex h-11 min-w-0 grow items-center gap-3 rounded-[10px] px-3 text-[15px] text-ink2 no-underline hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
            <LineIcon name="gear" size={20} stroke={1.8} />
            기본 설정
          </Link>
        ) : (
          <span className="grow" />
        )}
        <form action={signOutAction}>
          <button type="submit" aria-label="로그아웃" title="로그아웃" className="grid h-11 w-11 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent p-0 text-mute hover:bg-fill hover:text-ink2 focus-visible:outline-2 focus-visible:outline-staff">
            <LineIcon name="out" size={19} />
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Above the page on wide screens: find a child by name, what is waiting (할 일), and the signed-in teacher. */
export function TopBar({ staff, badges }: { staff: Staff; badges: ShellBadges }) {
  const waiting = badges.approvals + badges.worries;
  return (
    <header className="hidden min-h-[76px] shrink-0 items-center gap-3 border-b border-[#eef0f4] bg-white px-7 py-3.5 lg:flex print:hidden">
      <form action="/staff/children" method="get" role="search" className="relative flex w-full max-w-[440px] items-center">
        <label htmlFor="top-q" className="sr-only">
          아이 이름으로 찾기
        </label>
        <LineIcon name="search" size={18} className="pointer-events-none absolute left-3.5 text-mute" />
        <input
          id="top-q"
          name="q"
          type="search"
          placeholder="아이 이름으로 찾기"
          enterKeyHint="search"
          className="h-11 w-full rounded-xl border border-[#e5e8ee] bg-[#f9fafc] pr-3.5 pl-[42px] text-[14.5px] text-ink placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-staff"
        />
      </form>
      <span className="grow" />
      <Link
        href="/staff/approvals"
        aria-label={waiting > 0 ? `할 일 ${waiting}건` : "할 일"}
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-staff-line bg-white text-ink2 no-underline hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff"
      >
        <LineIcon name="bell" size={20} stroke={1.8} />
        {waiting > 0 ? (
          <span aria-hidden="true" className="absolute top-[5px] right-[5px] grid h-[17px] min-w-[17px] place-items-center rounded-full bg-badge px-1 text-[10.5px] leading-none font-bold text-white">
            {waiting > 99 ? "99+" : waiting}
          </span>
        ) : null}
      </Link>
      <Link href="/staff/more" className="flex h-12 shrink-0 items-center gap-2.5 rounded-xl px-1.5 text-ink no-underline hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-staff-tint text-[14px] font-bold text-staff">
          {staff.name.slice(0, 1)}
        </span>
        <span className="flex flex-col leading-[1.3]">
          <b className="text-[14.5px]">{staff.name}</b>
          <span className="text-[12.5px] text-mute">{ROLE_NAMES[staff.role]}</span>
        </span>
        <LineIcon name="next" size={16} className="text-mute" />
      </Link>
    </header>
  );
}
