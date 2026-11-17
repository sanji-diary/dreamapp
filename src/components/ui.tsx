import Link from "next/link";
import type { ReactNode } from "react";

/** Shared building blocks. Sizes follow the approved mock-ups: 72px rows, 46px circles, 30px pills. */

export type IconName = "drop" | "can" | "bible" | "stamp" | "house" | "bubble" | "pray" | "persimmon" | "badge" | "pouch" | "cloud" | "butterfly" | "bird" | "bee" | "leaf";

export function Icon({ name, size = 36, className = "" }: { name: IconName | string; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" src={`/img/icon-${name}.webp`} width={size} height={size} className={className} style={{ width: size, height: size }} />;
}

export function Circle({ children, size = 46, bg = "var(--color-fill)" }: { children: ReactNode; size?: number; bg?: string }) {
  return (
    <div aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-full text-[16px] font-bold text-ink2" style={{ width: size, height: size, background: bg }}>
      {children}
    </div>
  );
}

const TINTS = ["#E3F0D6", "#DCECF7", "#F8E7CF", "#E9E4F4", "#F7E1DE"];
export function Avatar({ name, id = 0, size = 46 }: { name: string; id?: number; size?: number }) {
  return (
    <Circle size={size} bg={TINTS[id % TINTS.length]}>
      <span style={{ fontSize: Math.round(size * 0.36) }}>{name.slice(-2, -1) || name.slice(0, 1)}</span>
    </Circle>
  );
}

export function BackLink({ href, label = "뒤로" }: { href: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className="flex h-11 w-11 items-center justify-center text-ink">
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </Link>
  );
}

export function Chevron() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#8B95A1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}

export function H1({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h1 className={`m-0 text-[22px] leading-[30px] font-bold tracking-[-0.5px] ${className}`}>{children}</h1>;
}

export function Sub({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 text-[14px] leading-5 tracking-[-0.2px] text-mute ${className}`}>{children}</p>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-4 mb-0 text-[15px] font-bold text-mute">{children}</h2>;
}

type Tone = "navy" | "gray" | "danger" | "warn" | "tint";
const PILL: Record<Tone, string> = {
  navy: "bg-navy text-white",
  gray: "bg-fill text-sub",
  danger: "bg-danger text-white",
  warn: "bg-warn-tint text-warn",
  tint: "bg-navy-tint text-navy",
};

/** The small 30px button used at the right of list rows. The 44px wrapper keeps it easy to tap. */
export function Pill({ children, tone = "navy", width = 74 }: { children: ReactNode; tone?: Tone; width?: number | "auto" }) {
  return (
    <span className={`flex h-[30px] items-center justify-center rounded-md px-2 text-[12px] font-semibold ${PILL[tone]}`} style={{ width: width === "auto" ? undefined : width }}>
      {children}
    </span>
  );
}

export function Tag({ children, tone = "gray" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex h-[26px] items-center rounded-md px-[9px] text-[12px] font-bold ${PILL[tone]}`}>{children}</span>;
}

export function Row({
  left,
  title,
  sub,
  right,
  extra,
  last = false,
  subTone,
}: {
  left?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  extra?: ReactNode;
  last?: boolean;
  subTone?: "danger";
}) {
  return (
    <div className={`flex min-h-[72px] items-center gap-[13px] py-2 ${last ? "" : "border-b border-line"}`}>
      {left}
      <div className="flex min-w-0 grow flex-col gap-px">
        {/* On a narrow screen the title wraps and the tags drop to the next line, rather than being cut to "가정예…". */}
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="min-w-0 text-[17px] leading-[23px] font-bold tracking-[-0.4px] break-keep text-ink2 [overflow-wrap:anywhere]">{title}</span>
          {extra}
        </div>
        {sub ? <div className={`text-[13px] leading-[18px] tracking-[-0.2px] break-keep [overflow-wrap:anywhere] ${subTone === "danger" ? "text-danger" : "text-sub"}`}>{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

export const primaryButtonClass =
  "flex h-[52px] w-full items-center justify-center rounded-xl border-0 bg-navy text-[16px] font-bold tracking-[-0.3px] text-white disabled:bg-fill disabled:text-sub";
export const inputClass = "h-12 w-full rounded-xl border-[1.5px] border-[#D1D6DB] bg-white px-3.5 text-[16px] text-ink outline-none focus:border-navy";
export const labelClass = "text-[14px] font-semibold text-ink2";

const KID_TABS = [
  { href: "/home", label: "내 나무", d: ["M12 21v-7"], circle: [12, 9, 6] },
  { href: "/missions", label: "미션", d: ["M7 4h10v16l-5-3.2L7 20z", "M9.5 10l2 2 3.2-3.6"] },
  { href: "/feed", label: "숲 소식", d: ["M5 17l4.5-4 3.5 3 2.5-2 3.5 3"], rect: true },
  { href: "/worship", label: "예배", d: ["M12 6c-2-1.500-4.500-2-7.500-1.500v13c3-.5 5.500 0 7.500 1.500 2-1.500 4.500-2 7.500-1.500v-13c-3-.5-5.500 0-7.500 1.500zM12 6v13"] },
  { href: "/me", label: "나", d: ["M5 19.500c.8-3.600 3.500-5.500 7-5.500s6.200 1.900 7 5.500"], circle: [12, 9, 3.6] },
] as const;

export function KidTabBar({ active }: { active: string }) {
  return (
    <nav aria-label="메뉴" className="sticky bottom-0 z-20 grid h-[76px] w-full shrink-0 grid-cols-5 border-t border-line bg-white px-[max(8px,calc(50%-280px))] pt-2 pb-[18px]">
      {KID_TABS.map((t) => {
        const on = active === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center justify-center gap-[3px] text-[11px] no-underline ${on ? "font-bold text-ink" : "font-medium text-mute"}`}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round">
              {"rect" in t ? <rect x="4" y="5" width="16" height="14" rx="3.500" /> : null}
              {"circle" in t ? <circle cx={t.circle[0]} cy={t.circle[1]} r={t.circle[2]} /> : null}
              {t.d.map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function StaffTabBar({ active, isAdmin }: { active: string; isAdmin: boolean }) {
  const tabs = [
    { href: "/staff/attendance", label: "출석", d: "M5 8h14M8 3v4M16 3v4M8.500 14l2.500 2.500 4.500-5M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" },
    { href: "/staff/children", label: "교적부", d: "M9 12.200a3.200 3.200 0 100-6.400 3.200 3.200 0 000 6.400zM3.500 19c.6-3 2.800-4.600 5.500-4.600s4.900 1.600 5.500 4.600M16 6.200a3 3 0 010 5.600M17.500 14.800c1.700.6 2.700 2 3 4.200" },
    { href: "/staff/approvals", label: "확인", d: "M12 20.500a8.500 8.500 0 100-17 8.500 8.500 0 000 17zM8.500 12.200l2.400 2.400 4.600-5" },
    { href: "/staff/worries", label: "고민함", d: "M5 5h14v11H10l-5 4z" },
    ...(isAdmin ? [{ href: "/staff/admin", label: "관리", d: "M12 15a3 3 0 100-6 3 3 0 000 6zM12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100" }] : []),
  ];
  return (
    <nav aria-label="교사 메뉴" className="sticky bottom-0 z-20 grid h-[76px] shrink-0 border-t border-line bg-white px-2 pt-2 pb-[18px]" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((t) => {
        const on = active.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center justify-center gap-[3px] text-[11px] no-underline ${on ? "font-bold text-ink" : "font-medium text-mute"}`}>
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d={t.d} />
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
