"use client";

import { useRouter } from "next/navigation";
import { barButtonClass } from "@/components/staff/kit";

/**
 * "다른 날짜": opens the device's date picker and goes to the attendance of the chosen day
 * (an earlier month, or a weekday such as a retreat). Days after today cannot be chosen.
 *
 * The date field itself lies invisibly over the button, so a tap on a phone opens the native
 * picker; on a computer the click asks the browser to open it. `round` is the 40px circle of the
 * phone header, otherwise it is a button of the wide top bar.
 */
export function DateJump({ date, today, query, round = false, id }: { date: string; today: string; /** Other choices to keep in the address, e.g. 'class=3'. */ query: string; round?: boolean; id: string }) {
  const router = useRouter();
  return (
    <span className={`relative ${round ? "grid h-11 w-11 shrink-0 place-items-center" : "inline-flex shrink-0"}`}>
      <label htmlFor={id} className="sr-only">
        다른 날짜 고르기
      </label>
      <input
        id={id}
        type="date"
        defaultValue={date}
        max={today}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // Browsers without showPicker open the picker on their own, or let the date be typed.
          }
        }}
        onChange={(e) => {
          const v = e.currentTarget.value;
          // A date typed by hand passes through odd years ('0002') on the way: wait for a real one.
          if (v >= "2000-01-01" && v <= today && v !== date) router.push(`/staff/attendance?date=${v}${query ? `&${query}` : ""}`);
        }}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {round ? (
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-fill text-ink2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
            <path d="M8 3.5v4M16 3.5v4M4 10.5h16" />
          </svg>
        </span>
      ) : (
        <span aria-hidden="true" className={`${barButtonClass()} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-navy`}>
          다른 날짜
        </span>
      )}
    </span>
  );
}
