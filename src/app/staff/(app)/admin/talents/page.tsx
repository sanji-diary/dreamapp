import Link from "next/link";
import { Empty, Flash, H2, Note, SubHeader, TextField } from "@/components/staff/ui";
import { Chevron, Row, Tag, primaryButtonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { talentCreateAction } from "@/lib/staff/actions-festival";
import { listEvents } from "@/lib/staff/festival";
import { kstDate, shortDate } from "@/lib/staff/util";

export const metadata = { title: "달란트 잔치 · 꿈의숲키우기" };

const STATUS = {
  draft: { label: "초안", tone: "gray" },
  open: { label: "진행 중", tone: "tint" },
  closed: { label: "마침", tone: "gray" },
} as const;

export default async function TalentsAdminPage({ searchParams }: PageProps<"/staff/admin/talents">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const events = (await listEvents(staff)) ?? [];
  return (
    <>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="달란트 잔치" />
      <Flash ok={sp.ok} error={sp.error} />
      <section className="flex flex-col px-4 pt-2">
        <Note>한 해 동안 모은 포인트를 달란트로 바꾸고, 잔치 날 선생님들이 코너에서 달란트를 결제해요. 포인트는 줄어들지 않고 그대로 남아요.</Note>
        <ul className="m-0 flex list-none flex-col p-0">
          {events.map((e, i) => {
            const when = e.status === "draft" ? `${shortDate(kstDate(e.created_at))} 만듦` : e.status === "open" ? `${shortDate(kstDate(e.opened_at))} 시작` : `${shortDate(kstDate(e.closed_at))} 마침`;
            return (
              <li key={e.id}>
                <Link href={`/staff/admin/talents/${e.id}`} className="block text-inherit no-underline">
                  <Row last={i === events.length - 1} title={e.name} extra={<Tag tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Tag>} sub={`${e.points_per_talent}P = 1달란트 · ${when}`} right={<Chevron />} />
                </Link>
              </li>
            );
          })}
        </ul>
        {events.length === 0 ? <Empty>아직 만든 잔치가 없어요.</Empty> : null}
      </section>

      <section className="flex flex-col px-4 pb-6">
        <H2>새 잔치 준비하기</H2>
        <form action={talentCreateAction} className="flex flex-col gap-3">
          <TextField label="잔치 이름" name="name" required maxLength={30} placeholder="예: 2027 달란트 잔치" />
          <TextField
            label="달란트 1개에 필요한 포인트"
            name="rate"
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            defaultValue={10}
            required
            hint="초안에서 여러 비율을 넣어 보고 정할 수 있어요. 시작하기 전까지는 아이들에게 아무것도 바뀌지 않아요."
          />
          <button type="submit" className={`${primaryButtonClass} cursor-pointer`}>
            초안 만들기
          </button>
        </form>
      </section>
    </>
  );
}
