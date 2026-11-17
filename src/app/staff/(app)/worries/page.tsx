import Link from "next/link";
import { redirect } from "next/navigation";
import { Empty, TabHeader } from "@/components/staff/ui";
import { Chevron, Circle, Icon, Row, Tag } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { canSeeWorryBox } from "@/lib/staff/access";
import { AUDIENCE_LABEL, listWorries } from "@/lib/staff/review";
import { shortDate } from "@/lib/staff/util";

export const metadata = { title: "고민함 · 꿈의숲키우기" };

export default async function WorriesPage() {
  const staff = await requireStaff();
  if (!canSeeWorryBox(staff)) redirect("/staff");
  const worries = await listWorries(staff);
  const unread = worries.filter((w) => w.unread).length;
  return (
    <>
      <TabHeader title="고민함" sub={unread > 0 ? `안 읽은 고민 ${unread}건` : "아이가 보여 주기로 한 고민만 여기에 와요"} />
      <ul className="m-0 flex list-none flex-col px-4 py-0">
        {worries.map((w, i) => (
          <li key={w.id}>
            {/* No preview of the text here on purpose. No prefetch either: opening the detail page records a read. */}
            <Link href={`/staff/worries/${w.id}`} prefetch={false} className="block text-inherit no-underline">
              <Row
                last={i === worries.length - 1}
                left={
                  <Circle bg={w.unread ? "var(--color-navy-tint)" : undefined}>
                    <Icon name="bubble" />
                  </Circle>
                }
                title={w.child_name}
                extra={w.unread ? <Tag tone="navy">새 글</Tag> : null}
                sub={`${shortDate(w.written_on)} · ${AUDIENCE_LABEL[w.audience]}${w.replies > 0 ? ` · 답장 ${w.replies}` : ""}`}
                right={<Chevron />}
              />
            </Link>
          </li>
        ))}
      </ul>
      {worries.length === 0 ? <Empty>아직 온 고민이 없어요.</Empty> : null}
    </>
  );
}
