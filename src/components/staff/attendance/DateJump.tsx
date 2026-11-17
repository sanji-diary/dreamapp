"use client";

import { useRouter } from "next/navigation";
import { barButtonClass } from "@/components/staff/kit";
import { addDays, weekLabel, weekStart } from "@/lib/time";

/** How far back the list of Sundays goes: about a year. */
const SUNDAYS_BACK = 52;

/**
 * "다른 날짜": a list of Sundays (attendance is taken on Sundays only), from this week's back
 * about a year, newest first. Choosing one goes to the attendance of that day.
 *
 * The list lies invisibly over the button, so a tap on a phone opens the device's own list and
 * a click on a computer opens the browser's. A weekday being looked at (an old mark that slipped
 * onto one, still shown so it can be cleared) stays in the list so the list can say where we are.
 * `round` is the 40px circle of the phone header, otherwise it is a button of the wide top bar.
 */
export function DateJump({ date, today, query, round = false, id }: { date: string; today: string; /** Other choices to keep in the address, e.g. 'class=3'. */ query: string; round?: boolean; id: string }) {
  const router = useRouter();
  const last = weekStart(today);
  const sundays = Array.from({ length: SUNDAYS_BACK }, (_, i) => addDays(last, -7 * i));
  const options = sundays.includes(date) ? sundays : [...sundays, date].sort().reverse();
  const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
  const text = (d: string) => (weekStart(d) === d ? `${md(d)} 주일 (${weekLabel(d)})${d === last ? " · 이번 주" : ""}` : `${md(d)} (평일)`);
  return (
    <span className={`relative ${round ? "grid h-11 w-11 shrink-0 place-items-center" : "inline-flex shrink-0"}`}>
      <label htmlFor={id} className="sr-only">
        다른 주일 고르기
      </label>
      <select
        id={id}
        value={date}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v !== date) router.push(`/staff/attendance?date=${v}${query ? `&${query}` : ""}`);
        }}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((d) => (
          <option key={d} value={d}>
            {text(d)}
          </option>
        ))}
      </select>
      {round ? (
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-fill text-ink2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
            <path d="M8 3.5v4M16 3.5v4M4 10.5h16" />
          </svg>
        </span>
      ) : (
        <span aria-hidden="true" className={`${barButtonClass()} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy`}>
          다른 주일
        </span>
      )}
    </span>
  );
}
