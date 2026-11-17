import Link from "next/link";
import { Face, TabHeader } from "@/components/staff/ui";
import { Chevron, Icon, Circle, Row, SectionTitle, Tag } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { attendanceScope, hasScope, staffTabs } from "@/lib/staff/access";
import { signOutAction } from "@/lib/staff/actions";
import { recentNotices } from "@/lib/staff/admin-misc";
import { mostRecentSunday, uncheckedCount } from "@/lib/staff/attendance";
import { longAbsent } from "@/lib/staff/children";
import { pendingCount, reportedComments, unreadWorryCount } from "@/lib/staff/review";
import { shortDate } from "@/lib/staff/util";
import { formatKoreanDate, todayKst } from "@/lib/time";
import { ROLE_NAMES } from "@/lib/types";

export const metadata = { title: "교사 · 꿈의숲키우기" };

function Todo({ href, icon, title, sub, danger = false }: { href: string; icon: string; title: string; sub: string; danger?: boolean }) {
  return (
    <Link href={href} className="text-inherit no-underline">
      <Row left={<Circle>{<Icon name={icon} />}</Circle>} title={title} sub={sub} subTone={danger ? "danger" : undefined} right={<Chevron />} />
    </Link>
  );
}

export default async function StaffHome() {
  const staff = await requireStaff();
  const tabs = staffTabs(staff);
  const today = todayKst();
  const sunday = mostRecentSunday(today);
  const isSunday = sunday === today;
  const canAttend = hasScope(attendanceScope(staff));
  const [classes, unchecked, pending, reports, unread, absent, notices] = await Promise.all([
    staff.class_ids.length > 0 ? db.query<{ name: string }>("select name from classes where id = any($1::int[]) order by sort, id", [staff.class_ids]) : [],
    canAttend ? uncheckedCount(staff, sunday) : 0,
    pendingCount(staff),
    reportedComments(staff),
    tabs.worries ? unreadWorryCount(staff) : 0,
    longAbsent(staff),
    recentNotices(),
  ]);
  const scopeText = staff.role === "admin" || staff.role === "head" || (staff.role === "homeroom" && staff.can_view_all) ? "전체 반" : classes.length > 0 ? classes.map((c) => c.name).join(", ") : "담당 반 없음";
  const nothing = !(canAttend && unchecked > 0) && pending === 0 && reports.length === 0 && unread === 0 && absent.length === 0;

  return (
    <>
      <TabHeader title={`${staff.name} 선생님`} sub={formatKoreanDate(today)} home={false} />
      <div className="flex gap-1.5 px-4 pt-3">
        <Tag tone="tint">{ROLE_NAMES[staff.role]}</Tag>
        <Tag>{scopeText}</Tag>
      </div>

      <section className="flex flex-col px-4">
        <SectionTitle>확인할 것</SectionTitle>
        {canAttend && unchecked > 0 ? (
          <Todo href="/staff/attendance" icon="stamp" title={`출석 미체크 ${unchecked}명`} sub={isSunday ? "오늘 주일 출석을 체크해 주세요" : `${shortDate(sunday)} 주일 출석이 비어 있어요`} />
        ) : null}
        {pending > 0 ? <Todo href="/staff/approvals" icon="house" title={`미션 제출 ${pending}건`} sub="승인하면 아이에게 물방울이 가요" /> : null}
        {reports.length > 0 ? <Todo href="/staff/approvals" icon="badge" title={`신고된 댓글 ${reports.length}건`} sub="숲 소식 댓글을 확인해 주세요" /> : null}
        {unread > 0 ? <Todo href="/staff/worries" icon="bubble" title={`새 고민 ${unread}건`} sub="아이가 보여 주기로 한 고민이에요" /> : null}
        {absent.map((k) => (
          <Link key={k.id} href={`/staff/children/${k.id}`} className="text-inherit no-underline">
            <Row left={<Face name={k.name} id={k.id} />} title={k.name} sub={`${k.weeks}주 연속 결석 · ${k.class_name ?? "반 없음"}`} subTone="danger" right={<Chevron />} />
          </Link>
        ))}
        {nothing ? <p className="m-0 py-6 text-[14px] leading-[21px] text-mute">지금 확인할 것이 없어요.</p> : null}
      </section>

      {notices.length > 0 ? (
        <section className="flex flex-col px-4">
          <SectionTitle>공지</SectionTitle>
          {notices.map((n, i) => (
            <div key={n.id} className={`flex flex-col gap-1 py-3 ${i === notices.length - 1 ? "" : "border-b border-line"}`}>
              <div className="flex items-center gap-1.5">
                {n.staff_only ? <Tag tone="tint">교사용</Tag> : null}
                {n.important ? <Tag tone="warn">중요</Tag> : null}
                <span className="min-w-0 truncate text-[15px] font-bold text-ink2">{n.title}</span>
              </div>
              {n.body ? <p className="m-0 text-[14px] leading-[21px] whitespace-pre-line text-ink2">{n.body}</p> : null}
              <span className="text-[13px] text-mute">{n.event_date ? `${shortDate(n.event_date)} 행사 · ` : ""}{shortDate(n.created_on)} 올림</span>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grow" />
      <form action={signOutAction} className="px-4 pt-6 pb-4">
        <button type="submit" className="flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] border-0 bg-fill text-[14px] font-bold text-sub">
          로그아웃
        </button>
      </form>
    </>
  );
}
