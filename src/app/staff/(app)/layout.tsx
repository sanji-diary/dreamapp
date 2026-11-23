import type { QuickAction } from "@/components/staff/QuickSheet";
import { Sidebar, TabBar, TopBar, type ShellNav, type ShellTeacher } from "@/components/staff/Shell";
import { requireStaff } from "@/lib/auth";
import { fifthTab, quickActions, staffTabs } from "@/lib/staff/access";
import { listStaff } from "@/lib/staff/admin-staff";
import { pendingCount, reportedComments, unreadWorryCount } from "@/lib/staff/review";
import { openEvent } from "@/lib/talents";

/** "4학년 1반" → "4-1반"; other names stay as they are. */
function shortClass(name: string): string {
  const m = /^(\d)학년\s*(\d+)반$/.exec(name.trim());
  return m ? `${m[1]}-${m[2]}반` : name;
}

/**
 * Every teacher screen sits behind a sign-in. Each page checks its own permissions again.
 *
 * Below `lg` (phones folded or unfolded, tablets): a white page across the whole screen with the
 * tab bar at the bottom. Each page chooses its own width there (see Page in components/staff/kit).
 * From `lg` (design-reference/admin2): a white panel on a lavender ground, the menu on its left, and
 * on its right the top bar above the page, which sits on a light gray canvas with white cards.
 * Neither menu is printed.
 */
export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const staff = await requireStaff();
  const tabs = staffTabs(staff);
  const [pending, reports, worries, festival, people] = await Promise.all([
    pendingCount(staff),
    reportedComments(staff),
    tabs.worries ? unreadWorryCount(staff) : 0,
    openEvent(),
    tabs.admin ? listStaff(staff) : null,
  ]);
  const can = quickActions(staff, festival !== null);
  const nav: ShellNav = { attendance: tabs.attendance, worries: tabs.worries, admin: tabs.admin, gift: can.gift, fifth: fifthTab(staff) };
  const badges = { approvals: pending + reports.length, worries };
  // The menu's "선생님" group: homeroom teachers who can sign in, in the order of their first class.
  const teachers: ShellTeacher[] = (people ?? [])
    .filter((p) => p.active && p.role === "homeroom")
    .map((p) => ({ id: p.id, name: p.name, classes: p.class_names.map(shortClass).join(", ") }))
    .slice(0, 8);

  // "바로 하기": only what this teacher may do, and the festival row only while a festival is open.
  const actions: QuickAction[] = [];
  if (can.attendance) actions.push({ href: "/staff/attendance", icon: "stamp", title: "출석 체크", sub: nav.fifth === "attendance" ? "이번 주일 우리 반" : "반을 골라서 체크해요" });
  if (can.visit) actions.push({ href: "/staff/children?pick=visit", icon: "house", title: "심방 기록 쓰기", sub: "전화, 만남, 문자 내용 남기기" });
  if (can.proxy) actions.push({ href: "/staff/children?pick=proxy", icon: "can", title: "미션 대신 입력", sub: "휴대폰 없는 아이가 한 미션" });
  if (can.gift) actions.push({ href: "/staff/gift", icon: "drop", title: "선물 주기", sub: "물방울이나 포인트를 미션 없이 주기" });
  if (can.festival && festival) actions.push({ href: "/staff/festival", icon: "pouch", title: "달란트 결제", sub: `${festival.name} 진행 중` });

  return (
    <div className="flex min-h-dvh w-full grow flex-col bg-white lg:bg-staff-ground lg:p-4 print:block print:min-h-0 print:bg-white print:p-0">
      <div className="flex min-w-0 grow flex-col lg:mx-auto lg:w-full lg:max-w-[1680px] lg:flex-row lg:overflow-clip lg:rounded-[20px] lg:bg-white lg:shadow-[0_1px_2px_rgba(23,31,80,0.05),0_12px_32px_rgba(23,31,80,0.07)] print:block print:shadow-none">
        <Sidebar nav={nav} badges={badges} teachers={teachers} />
        <div className="flex min-w-0 grow flex-col lg:bg-staff-canvas print:block print:bg-white">
          <TopBar staff={staff} badges={badges} />
          <div className="flex grow flex-col lg:mx-auto lg:w-full lg:max-w-[1400px] lg:px-7 lg:pt-7 lg:pb-8 print:block print:max-w-none print:p-0">
            <main className="staff-main flex grow flex-col">{children}</main>
          </div>
          <TabBar nav={nav} badges={badges} actions={actions} />
        </div>
      </div>
    </div>
  );
}
