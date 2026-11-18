import type { ChildStat } from "@/lib/staff/children";

/**
 * A child's last four counted Sundays as small squares: accent = came, light = came late,
 * outline = absent, dashed = no Sunday to count yet. The words for screen readers say the same.
 */
export function AttendanceDots({ st }: { st: ChildStat }) {
  const pad = Math.max(0, 4 - st.weeks.length);
  const late = st.weeks.filter((w) => w.status === "late").length;
  const label = st.weeks.length > 0 ? `최근 ${st.weeks.length}주 가운데 ${st.attended}번 나왔어요${late > 0 ? `, 그중 ${late}번은 늦게 왔어요` : ""}` : "출석 기록 없음";
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-1 whitespace-nowrap">
      {Array.from({ length: pad }, (_, i) => (
        <span key={`pad-${i}`} className="h-[13px] w-[13px] rounded-[4px] border-[1.5px] border-dashed border-[#d5dae2]" />
      ))}
      {st.weeks.map((w) => (
        <span key={w.date} className={`h-[13px] w-[13px] rounded-[4px] ${w.status === "present" ? "bg-staff" : w.status === "late" ? "bg-staff/45" : "border-[1.5px] border-[#aeb5c0] bg-white"}`} />
      ))}
      <span className="ml-1.5 text-[13.5px] text-sub">{st.weeks.length > 0 ? `${st.attended} / ${st.weeks.length}` : "–"}</span>
    </span>
  );
}

/** What the squares mean (under a table that shows them). */
export function AttendanceLegend() {
  return (
    <span aria-hidden="true" className="inline-flex flex-wrap items-center gap-3.5 text-[13px] text-sub">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[4px] bg-staff" />
        출석
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[4px] bg-staff/45" />
        늦게 옴
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-[4px] border-[1.5px] border-[#aeb5c0]" />
        결석
      </span>
    </span>
  );
}
