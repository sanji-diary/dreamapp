import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, BackLink, inputClass, labelClass } from "@/components/ui";

/** Building blocks for the teacher screens, in the same list style as the shared components. */

/** A child's or teacher's photo, or their initial on a tinted circle. */
export function Face({ name, id = 0, photo, size = 46 }: { name: string; id?: number; photo?: string | null; size?: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" src={photo} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return <Avatar name={name} id={id} size={size} />;
}

/** Top of a main tab: 22px title, grey subtitle, optional control on the right. */
export function TabHeader({ title, sub, right, home = true }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; home?: boolean }) {
  return (
    <header className="flex items-start justify-between gap-2 px-4 pt-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="m-0 text-[22px] leading-[30px] font-bold tracking-[-0.5px]">{title}</h1>
        {sub ? <p className="m-0 text-[14px] leading-5 tracking-[-0.2px] text-mute">{sub}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {right}
        {home ? (
          <Link href="/staff" aria-label="교사 홈" className="-mr-2 flex h-11 w-11 items-center justify-center text-ink">
            <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />
            </svg>
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/** Top of a sub page: back arrow, 19px title, optional action on the right. */
export function SubHeader({ back, backLabel, title, right }: { back: string; backLabel?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-center gap-1 pt-3 pr-4 pl-2 print:hidden">
      <BackLink href={back} label={backLabel} />
      <h1 className="m-0 min-w-0 grow truncate text-[19px] font-bold tracking-[-0.4px]">{title}</h1>
      {right}
    </header>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex h-11 shrink-0 items-center px-2 text-[15px] font-bold text-staff no-underline">
      {children}
    </Link>
  );
}

/** Result of the last action, passed back in the URL as ?ok= or ?error=. */
export function Flash({ ok, error }: { ok?: string | string[]; error?: string | string[] }) {
  const e = typeof error === "string" ? error : null;
  const o = typeof ok === "string" ? ok : null;
  if (!e && !o) return null;
  return (
    <p role={e ? "alert" : "status"} className={`mx-4 mt-3 mb-0 rounded-[10px] px-3 py-[11px] text-[14px] leading-5 font-bold ${e ? "bg-danger-tint text-[#8E2A22]" : "bg-staff-tint text-staff"}`}>
      {(e ?? o)!.slice(0, 200)}
    </p>
  );
}

const SMALL = {
  navy: "bg-staff text-white",
  gray: "bg-fill text-sub",
  danger: "bg-danger text-white",
} as const;

/** 30px pill inside a 44px tap area, as a real button. */
export function SmallButton({
  children,
  tone = "navy",
  width = 46,
  type = "submit",
  name,
  value,
  label,
}: {
  children: ReactNode;
  tone?: keyof typeof SMALL;
  width?: number | "auto";
  type?: "submit" | "button";
  name?: string;
  value?: string;
  label?: string;
}) {
  return (
    <button type={type} name={name} value={value} aria-label={label} className="flex h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0">
      <span className={`flex h-[30px] items-center justify-center rounded-md px-2 text-[12px] font-semibold whitespace-nowrap ${SMALL[tone]}`} style={{ minWidth: width === "auto" ? undefined : width }}>
        {children}
      </span>
    </button>
  );
}

/** Same look as SmallButton, as a link. */
export function SmallLink({ href, children, tone = "navy", width = 46 }: { href: string; children: ReactNode; tone?: keyof typeof SMALL; width?: number }) {
  return (
    <Link href={href} className="flex h-11 shrink-0 items-center no-underline">
      <span className={`flex h-[30px] items-center justify-center rounded-md px-2 text-[12px] font-semibold whitespace-nowrap ${SMALL[tone]}`} style={{ minWidth: width }}>
        {children}
      </span>
    </Link>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint ? <p className="m-0 text-[12px] leading-[18px] text-mute">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  required,
  maxLength,
  hint,
  inputMode,
  min,
  max,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  hint?: string;
  inputMode?: "numeric" | "tel" | "text";
  min?: number | string;
  max?: number | string;
}) {
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <input id={id} name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} required={required} maxLength={maxLength} inputMode={inputMode} min={min} max={max} className={inputClass} />
    </Field>
  );
}

export const textareaClass = "min-h-[96px] w-full rounded-xl border-[1.5px] border-[#D1D6DB] bg-white px-3.5 py-3 text-[16px] leading-6 text-ink outline-none focus:border-staff";
export const selectClass = `${inputClass} appearance-auto`;

/**
 * Chips that work as radio buttons or checkboxes without any script:
 * the real input sits inside the label and the chip colours follow :checked.
 */
export function Chips({
  legend,
  name,
  options,
  value,
  multiple = false,
  onWhite = false,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  value: string | string[];
  multiple?: boolean;
  onWhite?: boolean;
}) {
  const selected = Array.isArray(value) ? value : [value];
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
      <legend className={`p-0 ${labelClass}`}>{legend}</legend>
      <div className="flex flex-wrap gap-x-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex h-11 cursor-pointer items-center">
            <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value} defaultChecked={selected.includes(o.value)} className="peer sr-only" />
            <span
              className={`flex h-[34px] items-center rounded-lg px-3 text-[14px] font-semibold text-sub peer-checked:bg-staff peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-staff ${onWhite ? "bg-white" : "bg-fill"}`}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A labelled on/off switch (a checkbox underneath, so it posts with the form). */
export function Switch({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold text-ink2">{label}</span>
        {hint ? <span className="text-[12px] leading-[18px] text-mute">{hint}</span> : null}
      </span>
      <input type="checkbox" role="switch" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="flex h-[30px] w-[52px] shrink-0 items-center rounded-full bg-faint px-[3px] transition-colors peer-checked:justify-end peer-checked:bg-staff peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-staff">
        <span className="h-6 w-6 rounded-full bg-white" />
      </span>
    </label>
  );
}

/** Label and value line on the profile page. */
export function InfoRow({ label, children, last = false }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`flex min-h-11 items-center gap-3 py-1.5 ${last ? "" : "border-b border-line"}`}>
      <span className="w-[84px] shrink-0 text-[14px] text-mute">{label}</span>
      <span className="min-w-0 grow text-[15px] font-semibold break-words text-ink2">{children}</span>
    </div>
  );
}

export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-5 flex min-h-11 items-center justify-between">
      <h2 className="m-0 text-[17px] font-bold tracking-[-0.3px]">{children}</h2>
      {right}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 py-6 text-center text-[14px] leading-[21px] text-mute">{children}</p>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[12px] leading-[18px] text-mute">{children}</p>;
}
