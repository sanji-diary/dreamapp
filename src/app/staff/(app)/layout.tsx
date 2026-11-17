import { TabBar } from "@/components/staff/TabBar";
import { requireStaff } from "@/lib/auth";
import { staffTabs } from "@/lib/staff/access";
import { pendingCount, reportedComments, unreadWorryCount } from "@/lib/staff/review";

/** Every teacher screen sits behind a sign-in. Each page checks its own permissions again. */
export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const staff = await requireStaff();
  const tabs = staffTabs(staff);
  const [pending, reports, worries] = await Promise.all([pendingCount(staff), reportedComments(staff), tabs.worries ? unreadWorryCount(staff) : 0]);
  return (
    <>
      <main className="flex grow flex-col">{children}</main>
      <TabBar show={tabs} badges={{ approvals: pending + reports.length, worries }} />
    </>
  );
}
