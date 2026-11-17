import { redirect } from "next/navigation";
import { Box, Page } from "@/components/staff/kit";
import { TodoHeader } from "@/components/staff/todo/TodoHeader";
import { WorryList, worryListFrame, worryPanes } from "@/components/staff/todo/worries";
import { requireStaff } from "@/lib/auth";
import { canSeeWorryBox } from "@/lib/staff/access";
import { listWorries, todoCounts } from "@/lib/staff/review";

export const metadata = { title: "고민 · 꿈의숲키우기" };

/**
 * 고민: the worries children chose to show this teacher. Below `lg` it is the 고민 part of "할 일"
 * (a list); from `lg` the list stands on the left and the worry that is opened on the right.
 * Nothing is opened on its own here: opening a worry records that the teacher read it.
 */
export default async function WorriesPage() {
  const staff = await requireStaff();
  if (!canSeeWorryBox(staff)) redirect("/staff");
  const [worries, counts] = await Promise.all([listWorries(staff), todoCounts(staff)]);
  const unread = worries.filter((w) => w.unread).length;
  return (
    <Page>
      <TodoHeader active="worries" counts={counts} wideTitle="고민" wideCount={unread > 0 ? `안 읽은 고민 ${unread}건` : undefined} />
      <div className={worryPanes}>
        <div className={worryListFrame}>
          <WorryList worries={worries} />
        </div>
        <div className="hidden lg:block">
          <Box>
            <p className="m-0 py-10 text-center text-[13px] leading-[1.5] whitespace-pre-line text-mute">{worries.length > 0 ? "왼쪽에서 고민을 고르면\n여기에 열려요." : "아이가 고민을 보내면\n여기에서 읽고 답할 수 있어요."}</p>
          </Box>
        </div>
      </div>
      <p className="m-0 text-[12px] leading-[18px] text-mute">아이가 보여 주기로 한 고민만 여기에 와요.</p>
    </Page>
  );
}
