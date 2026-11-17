import type { QuickAction } from "@/components/staff/QuickSheet";
import { Sidebar, TabBar, type ShellNav } from "@/components/staff/Shell";
import { requireStaff } from "@/lib/auth";
import { fifthTab, quickActions, staffTabs } from "@/lib/staff/access";
import { pendingCount, reportedComments, unreadWorryCount } from "@/lib/staff/review";
import { openEvent } from "@/lib/talents";

/**
 * Every teacher screen sits behind a sign-in. Each page checks its own permissions again.
 *
 * Below `lg` (phones folded or unfolded, tablets): a white page across the whole screen with the
 * tab bar at the bottom. Each page chooses its own width there (see Page in components/staff/kit).
 * From `lg`: a sidebar on the left and the page in a content area of at most 1100px.
 * Neither menu is printed.
 */
export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const staff = await requireStaff();
  const tabs = staffTabs(staff);
  const [pending, reports, worries, festival] = await Promise.all([pendingCount(staff), reportedComments(staff), tabs.worries ? unreadWorryCount(staff) : 0, openEvent()]);
  const nav: ShellNav = { attendance: tabs.attendance, worries: tabs.worries, admin: tabs.admin, fifth: fifthTab(staff) };
  const badges = { approvals: pending + reports.length, worries };

  // "바로 하기": only what this teacher may do, and the festival row only while a festival is open.
  const can = quickActions(staff, festival !== null);
  const actions: QuickAction[] = [];
  if (can.attendance) actions.push({ href: "/staff/attendance", icon: "stamp", title: "출석 체크", sub: nav.fifth === "attendance" ? "이번 주일 우리 반" : "반을 골라서 체크해요" });
  if (can.visit) actions.push({ href: "/staff/children?pick=visit", icon: "house", title: "심방 기록 쓰기", sub: "전화, 만남, 문자 내용 남기기" });
  if (can.proxy) actions.push({ href: "/staff/children?pick=proxy", icon: "can", title: "미션 대신 입력", sub: "휴대폰 없는 아이가 한 미션" });
  if (can.festival && festival) actions.push({ href: "/staff/festival", icon: "pouch", title: "달란트 결제", sub: `${festival.name} 진행 중` });

  return (
    <div className="flex min-h-dvh w-full flex-col bg-white lg:flex-row print:block print:min-h-0">
      <Sidebar staff={staff} nav={nav} badges={badges} />
      <div className="flex min-w-0 grow flex-col print:block">
        <div className="flex grow flex-col lg:mx-auto lg:w-full lg:max-w-[1100px] lg:px-3 lg:pt-2.5 lg:pb-6 print:block print:max-w-none print:p-0">
          <main className="staff-main flex grow flex-col">{children}</main>
        </div>
        <TabBar nav={nav} badges={badges} actions={actions} />
      </div>
    </div>
  );
}
