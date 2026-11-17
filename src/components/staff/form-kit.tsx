import Link from "next/link";
import type { ChangeEvent, MouseEvent, ReactNode } from "react";
import { StepperBox, type StepperProps } from "./form-stepper";
import { ctaClass } from "./kit";

/**
 * Form building blocks for the redesigned teacher screens, in the look of the mock's "미션 만들기":
 * a small bold label over a 46px box with a hairline border, chips for a choice, a gray tile with a
 * switch, and one navy button at the end.
 *
 * Like kit.tsx, everything here is a plain component without state or effects, so it works in server
 * and client components alike. A client form that keeps its own state passes `value`/`checked` and
 * `onChange`; a server form leaves them out and the browser keeps the state (`defaultValue`).
 * The one piece with state, the box of the number stepper, is a client component in form-stepper.tsx;
 * NumberStepper here puts the label, hint and error around it.
 *
 * Every control gets a real <label> (or a <legend> for a group), the hint and the error are tied to
 * it with aria-describedby, and an error is shown right under the field it is about.
 */

/* ---------- words around a field ---------- */

export const fieldLabelClass = "text-[13px] leading-[1.4] font-semibold text-ink2";

export function HintText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="m-0 text-[12.5px] leading-[18px] text-mute">
      {children}
    </p>
  );
}

/** What is wrong with a field, right under it. The page's flash note announces it; this one is found through aria-describedby. */
export function ErrorText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="m-0 text-[13px] leading-[19px] font-semibold text-danger">
      {children}
    </p>
  );
}

/**
 * The server sends one message back in the address (?error=…). This picks it up for the field it
 * is about, so the form can show it next to that field: `error={errorFor(sp.error, /제목/)}`.
 */
export function errorFor(error: string | string[] | undefined, about: RegExp): string | undefined {
  return typeof error === "string" && about.test(error) ? error.slice(0, 200) : undefined;
}

const describedBy = (id: string, hint: unknown, error: unknown) => [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

/** Label, control, then the error and the hint. `htmlFor` is the id of the control inside. */
export function Field({ label, htmlFor, hint, error, children, className = "" }: { label: ReactNode; htmlFor: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className={fieldLabelClass}>
        {label}
      </label>
      {children}
      {error ? <ErrorText id={`${htmlFor}-error`}>{error}</ErrorText> : null}
      {hint ? <HintText id={`${htmlFor}-hint`}>{hint}</HintText> : null}
    </div>
  );
}

/** The same for a group of controls (chips, pictures, two dates): a fieldset with its legend. */
export function FieldGroup({ legend, hint, error, children, className = "" }: { legend: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`m-0 min-w-0 border-0 p-0 ${className}`}>
      <legend className={`px-0 pt-0 pb-1.5 ${fieldLabelClass}`}>{legend}</legend>
      <div className="flex min-w-0 flex-col gap-1.5">
        {children}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {hint ? <HintText>{hint}</HintText> : null}
      </div>
    </fieldset>
  );
}

/* ---------- boxes to type in ---------- */

// 16px text below `lg`: a phone browser zooms into a box with smaller text when it is tapped.
// The ring is on :focus, not :focus-visible: a box to type in shows it however it was reached, and a
// date box (whose focus sits in its inner day / month / year parts) shows it too.
const boxBase = "w-full min-w-0 rounded-xl border-[1.5px] bg-white text-[16px] text-ink placeholder:text-faint focus:border-navy focus:outline-2 focus:outline-offset-[-1.5px] focus:outline-navy disabled:bg-fill disabled:text-mute lg:text-[15px]";
const boxBorder = (invalid: boolean) => (invalid ? "border-danger" : "border-[#d1d6db]");

/**
 * Class of a one-line box (text, number, date), for a control that is laid out by hand; prefer TextInput.
 * `tight` is for a date box: it keeps its own inner padding on phones, and a little less of ours
 * keeps the date whole on a folded screen.
 */
export const inputBoxClass = (invalid = false, tight = false) => `${boxBase} h-[46px] ${tight ? "px-2.5" : "px-[13px]"} ${boxBorder(invalid)}`;
export const selectBoxClass = (invalid = false) => `${boxBase} h-[46px] cursor-pointer appearance-auto px-2.5 ${boxBorder(invalid)}`;
/** `short` starts at two lines instead of three (a quiz question). */
export const textareaBoxClass = (invalid = false, short = false) => `${boxBase} ${short ? "min-h-[68px]" : "min-h-[96px]"} px-[13px] py-[11px] leading-6 ${boxBorder(invalid)}`;

type InputMode = "numeric" | "tel" | "text" | "decimal";

interface InputProps {
  label: ReactNode;
  name: string;
  /** Default: "f-" + name. Give one when two forms on a page have a field of the same name. */
  id?: string;
  type?: string;
  defaultValue?: string | number | null;
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  inputMode?: InputMode;
  autoComplete?: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
}

export function TextInput({ label, name, id = `f-${name}`, type = "text", defaultValue, value, onChange, placeholder, required, maxLength, min, max, inputMode, autoComplete, hint, error, className }: InputProps) {
  const state = onChange ? { value: value ?? "", onChange } : { defaultValue: defaultValue ?? "" };
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} className={className}>
      <input
        id={id}
        name={name}
        type={type}
        {...state}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        min={min}
        max={max}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={inputBoxClass(Boolean(error), type === "date")}
      />
    </Field>
  );
}

export function SelectInput({
  label,
  name,
  id = `f-${name}`,
  defaultValue,
  value,
  onChange,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  /** Left out, the choice is not posted by itself (a client form keeps it and posts it another way); give an `id` then. */
  name?: string;
  id?: string;
  defaultValue?: string | number | null;
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  /** The <option>s. */
  children: ReactNode;
  className?: string;
}) {
  const state = onChange ? { value: value ?? "", onChange } : { defaultValue: defaultValue ?? "" };
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} className={className}>
      <select id={id} name={name} {...state} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={selectBoxClass(Boolean(error))}>
        {children}
      </select>
    </Field>
  );
}

export function TextArea({
  label,
  name,
  id = `f-${name}`,
  defaultValue,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
  rows,
  hint,
  error,
  className,
}: {
  label: ReactNode;
  name: string;
  id?: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  hint?: ReactNode;
  error?: string;
  className?: string;
}) {
  const state = onChange ? { value: value ?? "", onChange } : { defaultValue: defaultValue ?? "" };
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} className={className}>
      <textarea id={id} name={name} {...state} placeholder={placeholder} required={required} maxLength={maxLength} rows={rows} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={textareaBoxClass(Boolean(error))} />
    </Field>
  );
}

/**
 * A number with − and + at its sides (물방울, 포인트). The number can also be typed.
 * With `onChange` the form keeps the number (`value`); without, the stepper keeps it (`defaultValue`).
 */
export function NumberStepper({ label, id, hint, error, ...box }: StepperProps & { id?: string; hint?: ReactNode; error?: string }) {
  const fieldId = id ?? `f-${box.name}`;
  return (
    <Field label={label} htmlFor={fieldId} hint={hint} error={error}>
      <StepperBox id={fieldId} label={label} invalid={Boolean(error)} describedBy={describedBy(fieldId, hint, error)} {...box} />
    </Field>
  );
}

/* ---------- choices ---------- */

export interface Choice {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * Chips that are radio buttons (or checkboxes with `multiple`): the real input sits inside each
 * label, so the group works with the keyboard and posts with the form without any script.
 * `onGray` is for a group inside a gray box.
 */
export function ChoiceChips({
  legend,
  name,
  options,
  value,
  onChange,
  multiple = false,
  onGray = false,
  hint,
  error,
}: {
  legend: ReactNode;
  name: string;
  options: Choice[];
  /** The chosen value, or values with `multiple`. Without `onChange` it is only the starting choice. */
  value: string | string[];
  onChange?: (value: string) => void;
  multiple?: boolean;
  onGray?: boolean;
  hint?: ReactNode;
  error?: string;
}) {
  const chosen = Array.isArray(value) ? value : [value];
  return (
    <FieldGroup legend={legend} hint={hint} error={error}>
      <div className="-my-[5px] flex flex-wrap gap-x-[7px]">
        {options.map((o) => {
          const on = chosen.includes(o.value);
          return (
            <label key={o.value} className={`relative flex h-11 min-w-11 items-center justify-center ${o.disabled ? "opacity-50" : "cursor-pointer"}`}>
              <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value} disabled={o.disabled} {...(onChange ? { checked: on, onChange: () => onChange(o.value) } : { defaultChecked: on })} className="peer sr-only" />
              <span className={`rounded-full px-3.5 py-2 text-[13px] leading-[1.4] font-semibold whitespace-nowrap text-sub peer-checked:bg-navy peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy ${onGray ? "bg-white" : "bg-fill"}`}>{o.label}</span>
            </label>
          );
        })}
      </div>
    </FieldGroup>
  );
}

export function Checkbox({ label, name, value, defaultChecked, checked, onChange }: { label: ReactNode; name?: string; value?: string | number; defaultChecked?: boolean; checked?: boolean; onChange?: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 text-[15px] font-semibold text-ink2">
      <input
        type="checkbox"
        name={name}
        value={value}
        {...(onChange ? { checked: checked === true, onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked) } : { defaultChecked })}
        className="h-5 w-5 shrink-0 cursor-pointer accent-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

/* ---------- switches ---------- */

const trackClass = (small: boolean) =>
  `relative block shrink-0 rounded-full transition-colors after:absolute after:top-[3px] after:rounded-full after:bg-white after:transition-[left] ${small ? "h-[22px] w-9 after:h-4 after:w-4" : "h-[26px] w-11 after:h-5 after:w-5"}`;

/**
 * A switch with its words, as a row: the label is the whole row, the checkbox underneath posts
 * with the form. Alone it is a gray tile (the mock's "이번 주 도전 미션"); inside <SwitchGroup>
 * it is one line of the group.
 */
export function SwitchRow({
  label,
  hint,
  name,
  defaultChecked,
  checked,
  onChange,
  disabled = false,
  grouped = false,
  onGray = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  name?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** One line inside a SwitchGroup: no tile of its own. */
  grouped?: boolean;
  onGray?: boolean;
}) {
  return (
    <label className={`relative flex min-h-[52px] items-center gap-3 py-[9px] ${grouped ? "" : `rounded-[20px] px-4 ${onGray ? "bg-white" : "bg-fill"}`} ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="flex min-w-0 grow flex-col">
        <b className="text-[15px] tracking-[-0.02em]">{label}</b>
        {hint ? <span className="text-[13px] text-mute">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        name={name}
        disabled={disabled}
        {...(onChange ? { checked: checked === true, onChange: (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked) } : { defaultChecked })}
        className="peer sr-only"
      />
      <span className={`${trackClass(false)} bg-[#cfd5dc] after:left-[3px] peer-checked:bg-navy peer-checked:after:left-[21px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy`} />
    </label>
  );
}

/** Several switch rows in one tile, with hairlines between them. Give each row `grouped`. */
export function SwitchGroup({ children, onGray = false }: { children: ReactNode; onGray?: boolean }) {
  return <div className={`flex flex-col rounded-[20px] px-4 py-0.5 [&>*+*]:border-t ${onGray ? "bg-white [&>*+*]:border-line" : "bg-fill [&>*+*]:border-track"}`}>{children}</div>;
}

/**
 * A switch that saves at once: a submit button inside its own small form (the hidden fields of the
 * form say what to change). `label` names it for screen readers ("박지현 출석 체크").
 * It keeps a 44px tap area on phones; `small` is the table size of the mock.
 */
export function SwitchSubmit({ on, label, small = false, name, value, disabled = false }: { on: boolean; label: string; small?: boolean; name?: string; value?: string; disabled?: boolean }) {
  const knob = on ? (small ? "bg-navy after:left-[17px]" : "bg-navy after:left-[21px]") : "bg-[#cfd5dc] after:left-[3px]";
  return (
    <button type="submit" role="switch" aria-checked={on} aria-label={label} name={name} value={value} disabled={disabled} className="group inline-grid h-11 w-12 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 outline-none disabled:cursor-default disabled:opacity-50 lg:h-9">
      <span className={`${trackClass(small)} ${knob} group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy`} />
    </button>
  );
}

/* ---------- the shape of a form ---------- */

/** A part of a form under a 17px heading. `box` puts it in a gray box (a side panel, a small form inside a page). */
export function FormSection({ title, note, right, children, box = false, className = "" }: { title?: ReactNode; note?: ReactNode; right?: ReactNode; children: ReactNode; box?: boolean; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-3 ${box ? "rounded-[20px] bg-fill p-[18px] max-[339px]:p-3.5" : ""} ${className}`}>
      {title ? (
        <div className="flex min-h-8 items-center gap-2">
          <h2 className="m-0 min-w-0 grow text-[17px] font-bold tracking-[-0.025em]">
            {title}
            {note ? <span className="ml-1.5 text-[13px] font-medium tracking-[-0.015em] text-mute">{note}</span> : null}
          </h2>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Two fields side by side; one under the other on a folded cover screen. */
export function FieldPair({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 items-start gap-2.5 max-[339px]:grid-cols-1 ${className}`}>{children}</div>;
}

/**
 * The main button of a page-level form. On phones it stays in view just above the tab bar while the
 * form scrolls under it (the page's 18px side padding is undone so the white strip spans the screen);
 * on wide screens it simply ends the form. Put <SubmitButton>s inside, the main one last.
 * It must be a direct child of the form, and the form a flex column as wide as the page: a sticky
 * bar only stays in view inside the box of its parent. `className` places it on wide screens
 * (for example "lg:col-span-2" where the form becomes a grid there).
 */
export function SaveBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`sticky bottom-[76px] z-10 -mx-[18px] mt-auto flex gap-2.5 bg-white px-[18px] py-2.5 max-[359px]:gap-2 lg:static lg:mx-0 lg:mt-1 lg:max-w-[420px] lg:p-0 print:hidden ${className}`}>{children}</div>;
}

/** The way out of a form, as a link the size of the main button beside it ("그만두기"). `onGray` is for a form inside a gray box. */
export function CancelLink({ href, children, onGray = false }: { href: string; children: ReactNode; onGray?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex h-[52px] w-full min-w-0 items-center justify-center rounded-[14px] px-3 text-[16px] font-bold tracking-[-0.02em] whitespace-nowrap text-ink2 no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy max-[359px]:h-12 max-[359px]:px-2 max-[359px]:text-[14px] ${onGray ? "bg-white" : "bg-fill"}`}
    >
      {children}
    </Link>
  );
}

/** 52px form button: navy for the one thing the form does, gray for the other choice beside it. */
export function SubmitButton({
  children,
  tone = "navy",
  name,
  value,
  disabled,
  formNoValidate,
  onClick,
}: {
  children: ReactNode;
  tone?: "navy" | "gray";
  name?: string;
  value?: string;
  disabled?: boolean;
  formNoValidate?: boolean;
  /** Client forms only: for a button that asks before it sends (call preventDefault to stop). */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button type="submit" name={name} value={value} disabled={disabled} formNoValidate={formNoValidate} onClick={onClick} className={`${ctaClass(tone)} min-w-0 disabled:cursor-default disabled:bg-fill disabled:text-faint`}>
      {children}
    </button>
  );
}
