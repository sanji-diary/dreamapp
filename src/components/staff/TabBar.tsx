"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom tabs for teachers. Same look as StaffTabBar in components/ui, but tabs a role
 * cannot use are left out (the shared one can only hide the admin tab).
 */
const TABS = [
  { key: "attendance", href: "/staff/attendance", label: "출석", d: "M5 8h14M8 3v4M16 3v4M8.5 14l2.5 2.5 4.5-5M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" },
  { key: "children", href: "/staff/children", label: "교적부", d: "M9 12.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M16 6.2a3 3 0 010 5.6M17.5 14.8c1.7.6 2.7 2 3 4.2" },
  { key: "approvals", href: "/staff/approvals", label: "확인", d: "M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM8.5 12.2l2.4 2.4 4.6-5" },
  { key: "worries", href: "/staff/worries", label: "고민함", d: "M5 5h14v11H10l-5 4z" },
  { key: "admin", href: "/staff/admin", label: "관리", d: "M12 15a3 3 0 100-6 3 3 0 000 6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export function TabBar({ show, badges }: { show: Record<TabKey, boolean>; badges: Partial<Record<TabKey, number>> }) {
  const path = usePathname();
  const tabs = TABS.filter((t) => show[t.key]);
  return (
    <nav
      aria-label="교사 메뉴"
      className="sticky bottom-0 z-20 grid h-[76px] shrink-0 border-t border-line bg-white px-2 pt-2 pb-[18px] print:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const on = path === t.href || path.startsWith(t.href + "/");
        const n = badges[t.key] ?? 0;
        return (
          <Link key={t.key} href={t.href} aria-current={on ? "page" : undefined} className={`relative flex flex-col items-center justify-center gap-[3px] text-[11px] no-underline ${on ? "font-bold text-ink" : "font-medium text-mute"}`}>
            <span className="relative">
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round">
                <path d={t.d} />
              </svg>
              {n > 0 ? (
                <span className="absolute -top-1 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-bold text-white">
                  {n > 99 ? "99+" : n}
                  <span className="sr-only">건</span>
                </span>
              ) : null}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
