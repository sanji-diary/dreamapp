import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/**
 * Building blocks for the redesigned teacher screens (design-reference/admin-design.html).
 * Everything here is a plain server-safe component: no state, no effects. Interactive pieces live
 * in their own files (ActiveLink, QuickSheet). Sizes and radii are the mock's.
 *
 * Two things to keep in mind when adding to it:
 * - Focus rings. In Tailwind 4 `outline-none` also switches off `focus-visible:outline-2` on the
 *   same element (both go through --tw-outline-style). Write the ring classes alone
 *   (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy`), or put
 *   `group outline-none` on the link and the `group-focus-visible:` ring on the shape inside it.
 * - `className` props are for placing a component (margin, flex, grid position). Do not pass a class
 *   that competes with one the component sets itself (another height, gap, padding or display):
 *   which of the two wins depends on the order in the generated stylesheet, not on the order here.
 */

/* ---------- page frame ---------- */

/**
 * Root of a redesigned page. It sets the mock's text rhythm and paddings (18px on phones, 28px with
 * the shell beside the sidebar) and marks the page as laid out for every width (`data-wide`):
 * pages without it are kept in a 640px column (see globals.css).
 *
 * Width below `lg` (a folded phone at 280px up to an unfolded phone or tablet at 1023px):
 * - default: a centered reading column of at most 600px. Right for forms, lists and details.
 * - `wide`: the whole width. For pages with a grid that gains columns as the screen widens.
 * - `flush`: the whole width and no padding or gap, for pages that start with a full-bleed picture
 *   and center their own content (use `pageColumn` for the parts below it).
 * From `lg` every page gets the full content area (at most 1100px), except with `narrow`: a page
 * that is only a short list or a menu stays a 640px column at the left there.
 *
 * Korean words are kept whole when a line wraps (`break-keep`); let titles wrap instead of cutting them.
 */
export function Page({ children, flush = false, wide = false, narrow = false, className = "" }: { children: ReactNode; flush?: boolean; wide?: boolean; narrow?: boolean; className?: string }) {
  const width = flush || wide ? "w-full" : narrow ? "mx-auto w-full max-w-[600px] lg:mx-0 lg:max-w-[640px]" : pageColumn;
  return (
    <div data-wide="" className={`flex min-w-0 grow flex-col text-[14px] leading-[1.4] tracking-[-0.015em] break-keep wrap-break-word text-ink tabular-nums ${flush ? "" : "gap-3.5 px-[18px] pt-5 pb-6 lg:gap-4 lg:px-4 lg:pt-3"} ${width} ${className}`}>
      {children}
    </div>
  );
}

/** The centered reading column of a page below `lg` (it widens to the content area from `lg`). */
export const pageColumn = "mx-auto w-full max-w-[600px] lg:max-w-none";

/* ---------- line icons (tab bar, sidebar, round buttons, the admin grid) ---------- */

const ICONS = {
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />,
  kids: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.3c2.1.8 3.5 2.9 3.5 5.7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  list: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="3" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4-4" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chat: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  flag: <path d="M6 21V4M6 5h11l-2 4 2 4H6" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2M20 14v6h-4M14 20h0" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.5 9.5h5M12 9.5V16" />
    </>
  ),
  pen: <path d="M5 19l1-4L16 5l3 3L9 18z" />,
  send: <path d="M12 19V5M6 11l6-6 6 6" />,
  out: <path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M14 8l4 4-4 4M18 12H9" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  adjust: <path d="M12 4v8M8 8h8M8 18h8" />,
} as const;

export type LineIconName = keyof typeof ICONS;

export function LineIcon({ name, size = 20, stroke = 1.9, className = "" }: { name: LineIconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {ICONS[name]}
    </svg>
  );
}

/* ---------- pictures ---------- */

const CLAY = { l: [52, 40], s: [44, 33], xs: [38, 28] } as const;

/** A clay picture (public/img/icon-*.webp) in a soft sky circle, as on the children's mission list. */
export function ClayIcon({ name, size = "l", onWhite = false }: { name: string; size?: keyof typeof CLAY; onWhite?: boolean }) {
  const [box, img] = CLAY[size];
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full ${onWhite ? "bg-white" : "bg-sky"}`} style={{ width: box, height: box }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={`/img/icon-${name}.webp`} width={img} height={img} className="block object-contain" style={{ width: img, height: img }} />
    </span>
  );
}

export const TREE_IMAGES = ["seed", "sprout", "sap", "big", "flower", "fruit"] as const;

/** The tree picture for a level (1 seed … 6 fruit). */
export function treeImage(level: number): string {
  return `/img/tree-${TREE_IMAGES[Math.max(1, Math.min(6, Math.round(level))) - 1]}.webp`;
}

const AVATAR = { s: "h-[38px] w-[38px]", m: "h-12 w-12", l: "h-[72px] w-[72px]" } as const;

/**
 * A child's picture: their profile photo when there is one (served by /api/photo/[id]), otherwise
 * the tree for their level. `level={null}` is for children whose tree this teacher may not see:
 * a plain leaf stands in. `className` can change the size at a breakpoint (for example
 * "max-[379px]:h-10 max-[379px]:w-10" where space is tight).
 */
export function TreeAvatar({ level, photo, size = "m", onWhite = false, className = "" }: { level: number | null; photo?: string | null; size?: keyof typeof AVATAR | number; onWhite?: boolean; className?: string }) {
  const box: CSSProperties | undefined = typeof size === "number" ? { width: size, height: size } : undefined;
  const sized = `${typeof size === "number" ? "" : AVATAR[size]} ${className}`;
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" src={photo} className={`block shrink-0 rounded-full object-cover ${sized}`} style={box} />;
  }
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center overflow-hidden rounded-full ${onWhite ? "bg-white" : "bg-sky"} ${sized}`} style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={level === null ? "/img/icon-leaf.webp" : treeImage(level)} className={`block object-contain ${level === null ? "h-[56%] w-[56%]" : "h-[76%] w-[76%]"}`} />
    </span>
  );
}

const TEACHER = { s: "h-9 w-9 text-[14px]", m: "h-12 w-12 text-[18px]", round: "h-10 w-10 text-[14px]" } as const;

/** A teacher's initial (family name) on navy tint. */
export function TeacherAvatar({ name, size = "s", onWhite = false }: { name: string; size?: keyof typeof TEACHER; onWhite?: boolean }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-bold text-navy ${TEACHER[size]} ${onWhite ? "bg-white" : "bg-navy-tint"}`}>
      {name.slice(0, 1)}
    </span>
  );
}

/* ---------- small labels ---------- */

export type TagTone = "navy" | "blue" | "warn" | "danger" | "gray";
const TAG: Record<TagTone, string> = {
  navy: "bg-navy-tint text-navy",
  blue: "bg-blue-tint text-blue",
  warn: "bg-warn-tint text-warn",
  danger: "bg-danger-tint text-danger",
  gray: "bg-fill text-mute",
};
const TAG_TEXT: Record<TagTone, string> = { navy: "text-navy", blue: "text-blue", warn: "text-warn", danger: "text-danger", gray: "text-mute" };

/** Status label. Colours carry meaning only: navy = fine, blue = worry, warn = needs a look, danger = absent. */
export function Tag({ children, tone = "gray", onWhite = false }: { children: ReactNode; tone?: TagTone; onWhite?: boolean }) {
  return <span className={`inline-block rounded-md px-[7px] py-[3px] text-[11.5px] leading-[1.3] font-bold whitespace-nowrap ${onWhite ? `bg-white ${TAG_TEXT[tone]}` : TAG[tone]}`}>{children}</span>;
}

/** The red count on tabs and menu items. `className` is for placing it, not for resizing (use `small`). */
export function CountBadge({ n, small = false, className = "" }: { n: number; small?: boolean; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={`grid place-items-center rounded-full bg-count text-[11px] leading-none font-bold text-white ${small ? "h-[17px] min-w-[17px] px-1.5" : "h-[18px] min-w-[18px] px-1"} ${className}`}>
      {n > 99 ? "99+" : n}
      <span className="sr-only">건</span>
    </span>
  );
}

/* ---------- chips and the segmented control (both are links: the choice lives in the address) ---------- */

export const chipClass = (on: boolean) => `rounded-full px-3.5 py-2 text-[13px] leading-[1.4] font-semibold whitespace-nowrap ${on ? "bg-navy text-white" : "bg-fill text-sub"}`;

/** Filter chip. The 44px box around the pill keeps it easy to tap. */
export function Chip({ href, on = false, children }: { href: string; on?: boolean; children: ReactNode }) {
  return (
    <Link href={href} aria-current={on ? "true" : undefined} className="group flex h-11 shrink-0 items-center no-underline outline-none lg:h-10">
      <span className={`${chipClass(on)} group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy`}>{children}</span>
    </Link>
  );
}

export function Chips({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-x-[7px]">
      {children}
    </nav>
  );
}

/** Two to four choices side by side. `onGray` is for use inside a gray box. */
export function Segmented({ items, label, onGray = false }: { items: { href: string; label: ReactNode; on: boolean; prefetch?: boolean; scroll?: boolean }[]; label: string; onGray?: boolean }) {
  return (
    <nav aria-label={label} className={`grid rounded-xl p-[3px] text-center text-[13px] font-semibold ${onGray ? "bg-track" : "bg-fill"}`} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          prefetch={it.prefetch}
          scroll={it.scroll}
          aria-current={it.on ? "page" : undefined}
          className={`flex h-[38px] items-center justify-center rounded-[9px] no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy lg:h-8 ${it.on ? "bg-white font-bold text-ink shadow-[0_1px_3px_rgba(25,31,40,0.1)]" : "text-mute"}`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

/* ---------- surfaces ---------- */

/** Gray tile (20px corners, 16px padding). Pass `href` to make the whole tile a link. `className` is for layout inside it (flex, gap). */
export function Tile({ children, href, className = "" }: { children: ReactNode; href?: string; className?: string }) {
  const cls = `rounded-[20px] bg-fill p-4 ${className}`;
  return href ? (
    <Link href={href} className={`block text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${cls}`}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** Gray box for a group of content on wide screens (and the side panel). `tight` drops the 12px gap between its children (for a list of rows). */
export function Box({ children, tight = false, className = "" }: { children: ReactNode; tight?: boolean; className?: string }) {
  return <div className={`flex min-w-0 flex-col rounded-[20px] bg-fill p-[18px] ${tight ? "" : "gap-3"} ${className}`}>{children}</div>;
}

/** White card with a hairline border, for tables. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-w-0 flex-col rounded-[20px] border border-line px-2.5 py-1.5 ${className}`}>{children}</div>;
}

/** Number over a small label. `href` makes it a link. */
export function StatTile({ value, label, tone, href }: { value: ReactNode; label: string; tone?: "blue" | "danger"; href?: string }) {
  const inner = (
    <>
      <b className={`block text-[17px] tracking-[-0.02em] max-[339px]:text-[15px] ${tone === "blue" ? "text-blue" : tone === "danger" ? "text-danger" : ""}`}>{value}</b>
      <span className="text-[11.5px] text-mute">{label}</span>
    </>
  );
  const cls = "block rounded-2xl bg-fill px-1.5 py-3 text-center";
  return href ? (
    <Link href={href} className={`${cls} text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Big number tile of the wide-screen dashboard. */
export function Kpi({ label, value, note, tone, href }: { label: string; value: ReactNode; note?: ReactNode; tone?: "blue" | "danger"; href?: string }) {
  const inner = (
    <>
      <span className="text-[12.5px] text-mute">{label}</span>
      <b className="mt-0.5 mb-px block text-[24px] tracking-[-0.035em]">{value}</b>
      {note ? <small className={`text-[12px] ${tone === "blue" ? "text-blue" : tone === "danger" ? "text-danger" : "text-mute"}`}>{note}</small> : null}
    </>
  );
  const cls = "block rounded-[18px] bg-fill px-4 py-3.5";
  return href ? (
    <Link href={href} className={`${cls} text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Blue progress bar on a gray track. `soft` is the lighter bar used for the second measure in a row. */
export function ProgressBar({ value, max, label, thin = false, soft = false }: { value: number; max: number; label: string; thin?: boolean; soft?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.max(0, Math.min(max, value))} className={`overflow-hidden rounded-[5px] bg-track ${thin ? "h-2" : "h-2.5"}`}>
      <div className={`h-full rounded-[5px] bg-bar ${soft ? "opacity-55" : ""}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- headings ---------- */

/** 17px section heading with an optional note and control on the right. */
export function SectionHead({ children, note, right, className = "" }: { children: ReactNode; note?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-8 items-center gap-2 ${className}`}>
      <h2 className="m-0 min-w-0 grow text-[17px] font-bold tracking-[-0.025em]">
        {children}
        {note ? <span className="ml-1.5 text-[13px] font-medium tracking-[-0.015em] text-mute">{note}</span> : null}
      </h2>
      {right}
    </div>
  );
}

/** Round 40px button (inside a 44px tap area) with a line icon. `white` is for use over the scene. */
export function RoundLink({ href, label, icon, white = false, prefetch }: { href: string; label: string; icon: LineIconName; white?: boolean; prefetch?: boolean }) {
  return (
    <Link href={href} aria-label={label} prefetch={prefetch} className="group grid h-11 w-11 shrink-0 place-items-center no-underline outline-none">
      <span className={`grid h-10 w-10 place-items-center rounded-full text-ink2 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy ${white ? "bg-white shadow-[0_2px_10px_rgba(25,31,40,0.1)]" : "bg-fill"}`}>
        <LineIcon name={icon} />
      </span>
    </Link>
  );
}

/**
 * Top of a page.
 * - Without `back`: a main screen. 22px title on the left, an optional count beside it, controls on the right.
 * - With `back`: a sub screen. Round back button, 17px title in the middle, one control on the right.
 */
export function PageHeader({ title, count, sub, right, back, backLabel = "뒤로" }: { title?: ReactNode; count?: ReactNode; sub?: ReactNode; right?: ReactNode; back?: string; backLabel?: string }) {
  if (back) {
    return (
      <header className="-mx-0.5 -mt-0.5 flex items-center gap-2 print:hidden">
        <RoundLink href={back} label={backLabel} icon="back" />
        <h1 className="m-0 min-w-0 grow text-center text-[17px] font-bold tracking-[-0.025em] lg:text-left lg:text-[22px] lg:tracking-[-0.035em]">{title}</h1>
        {right ?? <span className="w-11 shrink-0 lg:hidden" />}
      </header>
    );
  }
  return (
    <header className="flex min-h-11 items-center gap-2.5 print:hidden">
      <div className="flex min-w-0 grow flex-col">
        <h1 className="m-0 text-[22px] leading-[1.35] font-bold tracking-[-0.035em]">
          {title}
          {count !== undefined ? <small className="ml-1.5 text-[14px] font-medium tracking-[-0.015em] text-mute">{count}</small> : null}
        </h1>
        {sub ? <p className="m-0 text-[13px] text-mute">{sub}</p> : null}
      </div>
      {right}
    </header>
  );
}

/* ---------- rows ---------- */

const pillBase = "rounded-[9px] px-3 py-2 text-[13px] leading-[1.4] font-bold whitespace-nowrap";
export const pillClass = (tone: "navy" | "gray" | "white" = "navy") => `${pillBase} ${tone === "navy" ? "bg-navy text-white" : tone === "white" ? "bg-white text-sub" : "bg-fill text-sub"}`;

/** The navy pill at the right of a row, as a link. `label` names it for screen readers ("박도윤 고민 읽기"). */
export function PillLink({ href, children, tone = "navy", label, prefetch }: { href: string; children: ReactNode; tone?: "navy" | "gray" | "white"; label?: string; prefetch?: boolean }) {
  return (
    <Link href={href} aria-label={label} prefetch={prefetch} className="group flex h-11 shrink-0 items-center no-underline outline-none lg:h-9">
      <span className={`${pillClass(tone)} group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy`}>{children}</span>
    </Link>
  );
}

/** The same pill as a form button. */
export function PillButton({ children, tone = "navy", label, name, value, type = "submit" }: { children: ReactNode; tone?: "navy" | "gray" | "white"; label?: string; name?: string; value?: string; type?: "submit" | "button" }) {
  return (
    <button type={type} name={name} value={value} aria-label={label} className="group flex h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 outline-none lg:h-9">
      <span className={`${pillClass(tone)} group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy`}>{children}</span>
    </button>
  );
}

/** Non-interactive pill in the same place (a state such as 완료). */
export function PillNote({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "navy" | "warn" }) {
  return (
    <span className="flex h-11 shrink-0 items-center lg:h-9">
      <span className={`${pillBase} ${tone === "navy" ? "bg-navy-tint text-navy" : tone === "warn" ? "bg-warn-tint text-warn" : "bg-fill text-sub"}`}>{children}</span>
    </span>
  );
}

export function Chevron() {
  return <LineIcon name="next" className="text-faint" />;
}

/**
 * Row in the style of the children's mission list: picture, bold title, gray second line, and
 * on the right a navy pill (PillLink / PillButton) or a chevron. With `href` the whole row is the link.
 * Put rows in <List>: it draws the hairlines between them.
 * Title and second line wrap; on a screen narrower than 320px (a folded cover screen) the picture
 * is dropped so the words and the button keep their room.
 */
export function ListRow({ left, title, sub, right, href, prefetch, compact = false }: { left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; href?: string; prefetch?: boolean; compact?: boolean }) {
  const inner = (
    <>
      {left ? <span className="flex shrink-0 max-[319px]:hidden">{left}</span> : null}
      <span className="flex min-w-0 grow flex-col">
        <b className={`block tracking-[-0.02em] ${compact ? "text-[14px]" : "text-[16px]"}`}>{title}</b>
        {sub ? <span className="block text-[13px] text-mute">{sub}</span> : null}
      </span>
      {right}
    </>
  );
  const cls = `flex items-center gap-3 border-b border-line last:border-b-0 ${compact ? "py-[9px]" : "py-[13px]"}`;
  return href ? (
    <Link href={href} prefetch={prefetch} className={`${cls} text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function List({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col ${className}`}>{children}</div>;
}

/** Label on the left, value on the right (child information). `onGray` darkens the hairline inside a gray box. */
export function InfoField({ label, children, onGray = false }: { label: string; children: ReactNode; onGray?: boolean }) {
  return (
    <div className={`flex justify-between gap-2.5 border-b py-[11px] text-[14px] last:border-b-0 ${onGray ? "border-track" : "border-line"}`}>
      <span className="shrink-0 text-mute">{label}</span>
      <b className="min-w-0 text-right font-semibold break-words">{children}</b>
    </div>
  );
}

/* ---------- buttons ---------- */

/**
 * 52px main button of a phone screen. gray = the secondary one beside it.
 * On a screen narrower than 360px it is a little smaller (48px, 14px text) so that two of them
 * still fit side by side with their words whole.
 */
export const ctaClass = (tone: "navy" | "gray" = "navy") =>
  `flex h-[52px] w-full cursor-pointer items-center justify-center rounded-[14px] border-0 px-3 text-[16px] font-bold tracking-[-0.02em] whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy max-[359px]:h-12 max-[359px]:px-2 max-[359px]:text-[14px] ${tone === "navy" ? "bg-navy text-white" : "bg-fill text-ink2"}`;

export function CtaLink({ href, children, tone = "navy" }: { href: string; children: ReactNode; tone?: "navy" | "gray" }) {
  return (
    <Link href={href} className={ctaClass(tone)}>
      {children}
    </Link>
  );
}

/** Compact buttons for the top bar and panels of wide screens (they are 44px tall on phones). solid = navy, ghost = gray, white = on a gray box. */
export const barButtonClass = (tone: "solid" | "ghost" | "white" = "ghost") =>
  `inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-0 px-[13px] text-[13.5px] whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy lg:h-[38px] ${
    tone === "solid" ? "bg-navy font-bold text-white" : tone === "white" ? "bg-white font-semibold text-ink2" : "bg-fill font-semibold text-ink2"
  }`;

/** `className` is for placing the button (flex-1, min-w-0), not for hiding it: wrap it in a hidden element instead. */
export function BarLink({ href, children, tone = "ghost", className = "" }: { href: string; children: ReactNode; tone?: "solid" | "ghost" | "white"; className?: string }) {
  return (
    <Link href={href} className={`${barButtonClass(tone)} ${className}`}>
      {children}
    </Link>
  );
}

/* ---------- messages ---------- */

/** One-line message box. tone: navy = done, danger = problem, warn = needs a look, gray = plain note. */
export function Notice({ children, tone = "gray", role }: { children: ReactNode; tone?: "navy" | "danger" | "warn" | "gray"; role?: "alert" | "status" }) {
  const cls = tone === "navy" ? "bg-navy-tint text-navy" : tone === "danger" ? "bg-danger-tint text-danger" : tone === "warn" ? "bg-warn-tint text-warn" : "bg-fill text-sub";
  return (
    <p role={role} className={`m-0 rounded-xl px-3.5 py-3 text-[14px] leading-5 font-bold ${cls}`}>
      {children}
    </p>
  );
}

/** Result of the last action, passed back in the address as ?ok= or ?error=. */
export function FlashNote({ ok, error }: { ok?: string | string[]; error?: string | string[] }) {
  const e = typeof error === "string" ? error : null;
  const o = typeof ok === "string" ? ok : null;
  if (!e && !o) return null;
  return (
    <Notice tone={e ? "danger" : "navy"} role={e ? "alert" : "status"}>
      {(e ?? o)!.slice(0, 200)}
    </Notice>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="m-0 py-6 text-center text-[14px] leading-[21px] text-mute">{children}</p>;
}
