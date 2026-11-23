import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { AttendanceBoard } from "@/components/staff/AttendanceBoard";
import { DateJump } from "@/components/staff/attendance/DateJump";
import { BarLink, Box, Chip, Chips, EmptyNote, InfoField, LineIcon, Page, PageHeader, barButtonClass, chipClass } from "@/components/staff/kit";
import { AutoForm } from "@/components/staff/widgets";
import { requireStaff } from "@/lib/auth";
import { attendanceScope } from "@/lib/staff/access";
import { attendanceClasses, mostRecentSunday } from "@/lib/staff/attendance";
import { attendanceCounts, attendanceMonth, monthLabel, monthOf, monthSteps } from "@/lib/staff/attendance-month";
import { isDate, shortDate, toInt } from "@/lib/staff/util";
import { todayKst, weekLabel, weekStart } from "@/lib/time";

export const metadata = { title: "출석 · 꿈의숲키우기" };

/**
 * 출석. Below `lg` it is the roll call of one day: the month's Sundays across the top, then one row
 * per child. From `lg` it is the month as a table with that day's numbers per class beside it.
 * `?date=` is the chosen day (any day up to today; this week's Sunday when left out) and `?class=`
 * the class, or `all`. Only classes this teacher may take attendance for are ever listed.
 */
export default async function AttendancePage({ searchParams }: PageProps<"/staff/attendance">) {
  const staff = await requireStaff();
  const classes = await attendanceClasses(staff);
  if (classes.length === 0) redirect("/staff");
  const sp = await searchParams;
  const today = todayKst();
  const thisSunday = mostRecentSunday(today);
  const date = isDate(sp.date) && sp.date <= today ? sp.date : thisSunday;
  const many = classes.length > 1;
  const all = many && sp.class === "all";
  const wanted = toInt(sp.class);
  const mine = classes.find((c) => staff.class_ids.includes(c.id));
  const cls = classes.find((c) => c.id === wanted) ?? mine ?? classes[0];
  // What `?class=` carries from link to link. A teacher with one class needs none.
  const classParam = all ? "all" : many ? String(cls.id) : "";
  const [data, counts] = await Promise.all([attendanceMonth(staff, (all ? classes : [cls]).map((c) => c.id), date, today), attendanceCounts(staff, date)]);
  const kids = data?.kids ?? [];
  const columns = data?.columns ?? [];

  const href = (d: string, c: string = classParam) => {
    const q = [d !== thisSunday ? `date=${d}` : null, c ? `class=${c}` : null].filter(Boolean).join("&");
    return q ? `/staff/attendance?${q}` : "/staff/attendance";
  };
  const ym = monthOf(date);
  const step = monthSteps(ym, today);
  const classQuery = classParam ? `class=${classParam}` : "";

  // The box beside the table: that day, class by class.
  const sunday = weekStart(date) === date;
  const dayWord = sunday ? weekLabel(date).split(" ")[1] : shortDate(date);
  const sum = counts.reduce((t, c) => ({ present: t.present + c.present, kids: t.kids + c.kids, recorded: t.recorded + c.recorded }), { present: 0, kids: 0, recorded: 0 });
  const waiting = counts.filter((c) => c.kids > 0 && c.recorded < c.kids);

  // Roll call heading: the class, or a picker for teachers with several classes.
  const title = many ? (
    <AutoForm className="relative -ml-1 flex min-w-0">
      {date !== thisSunday ? <input type="hidden" name="date" value={date} /> : null}
      <label htmlFor="att-class" className="sr-only">
        반 고르기
      </label>
      {/* The picker itself lies invisibly over the heading. (Drawn as a bold picker, a browser sizes it by its
          lighter options and cuts the last letter of the name.) */}
      <select id="att-class" name="class" defaultValue={classParam} className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0">
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="all">모든 반</option>
      </select>
      <span aria-hidden="true" className="flex min-h-11 min-w-0 items-center gap-1 rounded-[10px] px-1 text-[17px] font-bold tracking-[-0.025em] peer-focus-visible:outline-2 peer-focus-visible:outline-staff">
        {all ? "모든 반" : cls.name}
        <LineIcon name="next" size={16} stroke={2.2} className="rotate-90 text-sub" />
      </span>
    </AutoForm>
  ) : (
    <h2 className="m-0 text-[17px] font-bold tracking-[-0.025em]">{cls.name}</h2>
  );

  const side = (
    <Box>
      <h2 className="m-0 text-[17px] font-bold tracking-[-0.025em]">
        {dayWord} {counts.length > 1 ? "반별 출석" : "출석"}
      </h2>
      <div>
        {counts.map((c) => (
          <InfoField key={c.id} onGray label={c.name}>
            {c.recorded > 0 ? `${c.present} / ${c.kids}` : "–"}
          </InfoField>
        ))}
        {counts.length > 1 ? (
          <InfoField onGray label={attendanceScope(staff) === null ? "소년부 전체" : "합계"}>
            <span className="text-blue">{sum.recorded > 0 ? `${sum.present} / ${sum.kids}` : "–"}</span>
          </InfoField>
        ) : null}
      </div>
      <div className="rounded-[14px] bg-white px-3.5 py-3 text-[13px] leading-[1.5]">
        <b>아직 입력 안 한 반</b>
        {waiting.length === 0 ? (
          <p className="m-0 text-mute">없어요. 모든 아이를 체크했어요.</p>
        ) : (
          <ul className="m-0 list-none p-0 text-mute">
            {waiting.map((c) => (
              <li key={c.id}>
                {c.name} · {c.recorded === 0 ? "아직 안 했어요" : `${c.kids - c.recorded}명 남았어요`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Box>
  );

  return (
    <Page>
      {/* ---------- below lg: the roll call ---------- */}
      <div className="lg:hidden">
        <PageHeader back="/staff" backLabel="홈으로 돌아가기" title="출석 체크" right={<DateJump round id="att-date" date={date} today={today} query={classQuery} />} />
      </div>
      {ym.slice(0, 4) !== today.slice(0, 4) ? <p className="m-0 -my-1.5 text-center text-[13px] text-mute lg:hidden">{monthLabel(ym, today)}</p> : null}
      {/* Five Sundays stand in one row at every width. With a weekday among them (six or more) a folded
          cover screen has no room for 44px pills side by side, so there they stand in two rows. */}
      <nav
        aria-label="날짜 고르기"
        style={{ "--days": columns.length, "--days-narrow": columns.length > 5 ? Math.ceil(columns.length / 2) : columns.length } as CSSProperties}
        className={`grid grid-cols-[repeat(var(--days),minmax(0,1fr))] gap-1.5 lg:hidden ${columns.length > 6 ? "max-[439px]:grid-cols-[repeat(var(--days-narrow),minmax(0,1fr))]" : "max-[339px]:grid-cols-[repeat(var(--days-narrow),minmax(0,1fr))]"}`}
      >
        {columns.map((c) => {
          const on = c.date === date;
          const words = (
            <>
              <small className={`text-[11px] ${on ? "text-[#cfd6f6]" : "text-mute"}`}>{c.label}</small>
              <b className="text-[14px]">{c.md}</b>
            </>
          );
          const box = "flex min-h-[50px] min-w-0 flex-col items-center justify-center rounded-[14px] px-0.5 pt-px text-center leading-[1.35] whitespace-nowrap";
          return c.future ? (
            // A Sunday still to come: shown so the month reads whole, but there is nothing to mark yet.
            <span key={c.date} className={`${box} bg-fill text-sub opacity-50`}>
              {words}
            </span>
          ) : (
            <Link key={c.date} href={href(c.date)} scroll={false} aria-current={on ? "date" : undefined} className={`${box} no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff ${on ? "bg-staff text-white" : "bg-fill text-sub"}`}>
              {words}
            </Link>
          );
        })}
      </nav>
      {/* The QR children scan to check in by themselves ("출석 체크" in the app). */}
      <Link href="/staff/attendance/qr" className="flex min-h-11 items-center justify-between gap-2 rounded-[14px] bg-fill px-4 py-2 text-[14px] font-semibold text-ink2 no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff lg:hidden">
        아이들이 찍는 출석 QR
        <LineIcon name="next" size={16} stroke={2.2} className="shrink-0 text-sub" />
      </Link>

      {/* ---------- from lg: the month ---------- */}
      <div className="hidden lg:block">
        <PageHeader
          title="출석"
          count={monthLabel(ym, today)}
          right={
            <>
              <BarLink href={href(step.prev.date)}>‹ {step.prev.label}</BarLink>
              {step.next ? <BarLink href={href(step.next.date)}>{step.next.label} ›</BarLink> : null}
              <DateJump id="att-date-wide" date={date} today={today} query={classQuery} />
              <BarLink href="/staff/attendance/qr">출석 QR</BarLink>
              {staff.role === "admin" ? (
                // The file is made by a route handler that checks for an admin again: every class, the last 26 Sundays.
                <a href="/staff/admin/export/attendance" download title="모든 반의 최근 26주 출석부 (CSV 파일)" className={barButtonClass()}>
                  엑셀로 내려받기
                </a>
              ) : null}
            </>
          }
        />
      </div>
      <div className="hidden lg:block">
        {many ? (
          <Chips label="반 고르기">
            <Chip href={href(date, "all")} on={all}>
              전체
            </Chip>
            {classes.map((c) => (
              <Chip key={c.id} href={href(date, String(c.id))} on={!all && c.id === cls.id}>
                {c.name}
              </Chip>
            ))}
          </Chips>
        ) : (
          <div className="flex h-10 items-center">
            <span className={chipClass(true)}>{cls.name}</span>
          </div>
        )}
      </div>

      {kids.length === 0 ? (
        <>
          <div className="flex min-h-11 items-center lg:hidden">{title}</div>
          <EmptyNote>{all ? "아직 아이가 없어요." : "이 반에는 아직 아이가 없어요."}</EmptyNote>
        </>
      ) : (
        <AttendanceBoard
          key={`${classParam}:${date}`}
          date={date}
          kids={kids}
          columns={columns.map((c) => ({ ...c, href: href(c.date) }))}
          marks={data?.marks ?? {}}
          grouped={all}
          title={title}
          total={ym === monthOf(today) ? "이번 달" : monthLabel(ym, today)}
          side={side}
        />
      )}
    </Page>
  );
}
