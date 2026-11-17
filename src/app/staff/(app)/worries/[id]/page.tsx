import { notFound } from "next/navigation";
import { FlashNote, Page, PageHeader } from "@/components/staff/kit";
import { TodoHeader } from "@/components/staff/todo/TodoHeader";
import { WorryList, WorryThread, worryListFrame, worryPanes } from "@/components/staff/todo/worries";
import { requireStaff } from "@/lib/auth";
import { listWorries, openWorry, todoCounts } from "@/lib/staff/review";
import { toInt } from "@/lib/staff/util";

export const metadata = { title: "고민 · 꿈의숲키우기" };

/**
 * One worry, read and answered as a conversation. Below `lg` it is a screen of its own with a back
 * button; from `lg` it opens beside the list.
 */
export default async function WorryPage({ params, searchParams }: PageProps<"/staff/worries/[id]">) {
  const staff = await requireStaff();
  const id = toInt((await params).id);
  const sp = await searchParams;
  // A worry this teacher was not chosen for looks the same as one that does not exist.
  const w = id === null ? null : await openWorry(staff, id);
  if (!w) notFound();
  // Read after opening, so this worry already counts as read in the list and the numbers.
  const [worries, counts] = await Promise.all([listWorries(staff), todoCounts(staff)]);
  const unread = worries.filter((x) => x.unread).length;
  return (
    <Page>
      <div className="lg:hidden">
        <PageHeader back="/staff/worries" backLabel="고민함으로 돌아가기" title={`${w.child_name}의 고민`} />
      </div>
      <TodoHeader phone={false} active="worries" counts={counts} wideTitle="고민" wideCount={unread > 0 ? `안 읽은 고민 ${unread}건` : undefined} />
      <FlashNote ok={sp.ok} error={sp.error} />
      {/* On phones the conversation fills the screen, so the reply box rests at the bottom. */}
      <div className={`grow ${worryPanes} lg:grow-0`}>
        <div className={`hidden lg:block ${worryListFrame}`}>
          <WorryList worries={worries} current={w.id} />
        </div>
        <div className="flex grow flex-col gap-3.5 lg:min-h-[420px] lg:rounded-[20px] lg:border lg:border-line lg:p-[18px]">
          <h2 className="m-0 hidden text-[17px] font-bold tracking-[-0.025em] lg:block">{w.child_name}의 고민</h2>
          <WorryThread w={w} />
        </div>
      </div>
    </Page>
  );
}
