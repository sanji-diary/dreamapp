import { redirect } from "next/navigation";
import { AttendanceBoard } from "@/components/staff/AttendanceBoard";
import { Empty, TabHeader } from "@/components/staff/ui";
import { AutoForm } from "@/components/staff/widgets";
import { requireStaff } from "@/lib/auth";
import { attendanceClasses, attendanceRoster, mostRecentSunday } from "@/lib/staff/attendance";
import { isDate, toInt } from "@/lib/staff/util";
import { formatKoreanDate, todayKst } from "@/lib/time";

export const metadata = { title: "출석체크 · 꿈의숲키우기" };

export default async function AttendancePage({ searchParams }: PageProps<"/staff/attendance">) {
  const staff = await requireStaff();
  const classes = await attendanceClasses(staff);
  if (classes.length === 0) redirect("/staff");
  const sp = await searchParams;
  const today = todayKst();
  const date = isDate(sp.date) && sp.date <= today ? sp.date : mostRecentSunday(today);
  const wanted = toInt(sp.class);
  const mine = classes.find((c) => staff.class_ids.includes(c.id));
  const cls = classes.find((c) => c.id === wanted) ?? mine ?? classes[0];
  const kids = (await attendanceRoster(staff, cls.id, date)) ?? [];

  return (
    <>
      <TabHeader title="출석체크" sub={formatKoreanDate(date)} />
      {/* Changing the date or the class reloads the list (a GET form that submits on change). */}
      <AutoForm className="flex items-center gap-2 px-4 pt-3">
        <label className="sr-only" htmlFor="att-date">
          날짜
        </label>
        <input id="att-date" type="date" name="date" defaultValue={date} max={today} className="h-11 min-w-0 grow rounded-[22px] border-0 bg-fill px-3.5 text-[14px] font-bold text-ink outline-none focus-visible:outline-2 focus-visible:outline-navy" />
        <label className="sr-only" htmlFor="att-class">
          반
        </label>
        <select id="att-class" name="class" defaultValue={cls.id} className="h-11 min-w-0 grow rounded-[22px] border-0 bg-fill px-3 text-[14px] font-bold text-ink outline-none focus-visible:outline-2 focus-visible:outline-navy">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </AutoForm>
      {kids.length === 0 ? <Empty>이 반에는 아직 아이가 없어요.</Empty> : <AttendanceBoard key={`${cls.id}:${date}`} date={date} kids={kids} />}
    </>
  );
}
