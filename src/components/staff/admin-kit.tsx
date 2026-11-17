import Link from "next/link";
import type { ReactNode } from "react";
import { Page, PageHeader, barButtonClass, pillClass } from "./kit";
import { ConfirmButton } from "./widgets";

/**
 * Pieces shared by the "운영" (admin) pages, on top of kit.tsx and form-kit.tsx.
 * Plain server-safe components, like the kit. The interactive ones are in admin-widgets.tsx.
 */

/**
 * Top of a main admin page (미션, 교사·권한, 반 편성 …).
 * Below `lg` it is a sub screen of 운영: round back button, title in the middle, one round control.
 * From `lg` the sidebar is the way around, so it is a main screen: 22px title with a count and the
 * top-bar buttons of the mock ("+ 미션 만들기"). Pages one level further down use the kit's
 * PageHeader with `back` on every width.
 */
export function AdminHeader({
  title,
  count,
  back = "/staff/admin",
  backLabel = "운영으로 돌아가기",
  phoneRight,
  wideRight,
}: {
  title: ReactNode;
  count?: ReactNode;
  back?: string;
  backLabel?: string;
  /** Below lg: one round button (RoundLink). */
  phoneRight?: ReactNode;
  /** From lg: bar buttons (BarLink, BarButton). */
  wideRight?: ReactNode;
}) {
  return (
    <>
      <div className="lg:hidden print:hidden">
        <PageHeader back={back} backLabel={backLabel} title={title} right={phoneRight} />
      </div>
      <div className="hidden lg:block print:hidden">
        <PageHeader title={title} count={count} right={wideRight ? <span className="flex shrink-0 items-center gap-2.5">{wideRight}</span> : undefined} />
      </div>
    </>
  );
}

/* ---------- tables (inside the kit's <Card>) ---------- */

export const tableClass = "w-full border-collapse text-[13px]";

interface CellLook {
  /** Numbers and switches sit in the middle of their column. */
  center?: boolean;
  /** Header: let a long name break into two lines. Cell: keep the words on one line. */
  wrap?: boolean;
  nowrap?: boolean;
  /** Cell that holds a 36px control: less padding above and below, so the row stays as tall as the others. */
  tight?: boolean;
  /** Tints the row that is open in the box at the right. */
  selected?: boolean;
  /** A teacher who cannot sign in, a mission that is over. */
  dim?: boolean;
}

export const thClass = ({ center = false, wrap = false }: CellLook = {}) => `border-b border-line px-2.5 py-[9px] text-[12px] font-medium text-mute ${center ? "text-center" : "text-left"} ${wrap ? "" : "whitespace-nowrap"}`;
export const tdClass = ({ center = false, nowrap = false, tight = false, selected = false, dim = false }: CellLook = {}) =>
  `border-b border-line px-2.5 ${tight ? "py-1" : "py-2.5"} ${center ? "text-center" : ""} ${nowrap ? "whitespace-nowrap" : ""} ${selected ? "bg-navy-tint" : ""} ${dim ? "opacity-60" : ""}`;
/** On a <tr>: the last row has no hairline under it. */
export const rowClass = "[&:last-child>td]:border-b-0 [&:last-child>th]:border-b-0";

/* ---------- two things side by side ---------- */

/**
 * Frame of an admin page that shows a list and a box beside it (미션, 반 편성, 소식, 포인트 …).
 * The kit's <Page> keeps a page in a 600px column until the sidebar appears at `lg`; these pages
 * have something to put beside the list, so from 768px (a tablet, an unfolded phone lying on its
 * side) they use the whole width with splitClass / writeSplitClass. Below 768px it is the same
 * centered column as a plain <Page>.
 */
export function AdminPage({ children }: { children: ReactNode }) {
  return (
    <Page wide>
      <div className="mx-auto flex w-full max-w-[564px] grow flex-col gap-3.5 md:max-w-none lg:gap-4">{children}</div>
    </Page>
  );
}

/**
 * A list (or a table) with a 304px box at its right, as on the mock's 미션 and 교적부.
 * Side by side from 768px inside <AdminPage>; below that the two follow each other.
 */
export const splitClass = "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3.5 md:grid-cols-[minmax(0,1fr)_304px]";

/** A list with a 340px box for writing at its right (소식, 공지): room for a few lines of text. */
export const writeSplitClass = "grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3.5 md:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-5";

/* ---------- buttons ---------- */

/**
 * The kit's pill as a button that asks first (지우기, 보관). It sits in a form whose hidden fields say what to do.
 * `label` names it for screen readers where the same word stands in every row ("가을 소풍 안내 공지 지우기").
 */
export function ConfirmPill({ children, message, tone = "gray", name, value, label }: { children: ReactNode; message: string; tone?: "navy" | "gray" | "white"; name?: string; value?: string; label?: string }) {
  return (
    <ConfirmButton message={message} name={name} value={value} className="group flex h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 outline-none lg:h-9">
      <span className={`${pillClass(tone)} group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy`}>
        {label ? (
          <>
            <span aria-hidden="true">{children}</span>
            <span className="sr-only">{label}</span>
          </>
        ) : (
          children
        )}
      </span>
    </ConfirmButton>
  );
}

/** The kit's bar button as a form button. solid = navy, ghost = gray, white = on a gray box. */
export function BarButton({ children, tone = "ghost", name, value, type = "submit", label, className = "" }: { children: ReactNode; tone?: "solid" | "ghost" | "white"; name?: string; value?: string; type?: "submit" | "button"; label?: string; className?: string }) {
  return (
    <button type={type} name={name} value={value} aria-label={label} className={`${barButtonClass(tone)} ${className}`}>
      {children}
    </button>
  );
}

/** A file made by a route handler (CSV), in the look of a bar button. A plain link: the handler checks for an admin again. */
export function DownloadLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} download className={`${barButtonClass("ghost")} ${className}`}>
      {children}
    </a>
  );
}

/* ---------- rows ---------- */

/**
 * A row in the style of the mission list that opens its details in place: the choice lives in the
 * address and the page keeps its scroll position. `selected` marks the open one; from 768px, where
 * the details are in the box at the right instead of under the row, the open row is tinted.
 * Put each in an <li className={rowItemClass}> so that what opens under a row stays inside its hairlines.
 */
export function RowLink({ href, left, title, sub, right, selected = false }: { href: string; left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; selected?: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={`flex items-center gap-3 py-[13px] text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy ${selected ? "md:-mx-2.5 md:rounded-2xl md:bg-navy-tint md:px-2.5" : ""}`}
    >
      {left ? <span className="flex shrink-0 max-[319px]:hidden">{left}</span> : null}
      <span className="flex min-w-0 grow flex-col">
        <b className="block text-[16px] tracking-[-0.02em]">{title}</b>
        {sub ? <span className="block text-[13px] text-mute">{sub}</span> : null}
      </span>
      {right}
    </Link>
  );
}

export const rowItemClass = "flex flex-col border-b border-line last:border-b-0";

/** Small gray line under a list or a form: what a button will do, who can see a page. */
export function Small({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 text-[12.5px] leading-[18px] text-mute ${className}`}>{children}</p>;
}
