import { AdminHeader, AdminPage, Small, writeSplitClass } from "@/components/staff/admin-kit";
import { FormSection, SubmitButton, TextInput, errorFor } from "@/components/staff/form-kit";
import { Chevron, ClayIcon, EmptyNote, FlashNote, List, ListRow, SectionHead, Tag, type TagTone } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { talentCreateAction } from "@/lib/staff/actions-festival";
import { listEvents } from "@/lib/staff/festival";
import { kstDate, shortDate } from "@/lib/staff/util";

export const metadata = { title: "달란트 잔치 · 꿈의숲키우기" };

const STATUS: Record<"draft" | "open" | "closed", { label: string; tone: TagTone }> = {
  draft: { label: "초안", tone: "gray" },
  open: { label: "진행 중", tone: "navy" },
  closed: { label: "마침", tone: "gray" },
};

export default async function TalentsAdminPage({ searchParams }: PageProps<"/staff/admin/talents">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const events = (await listEvents(staff)) ?? [];
  return (
    <AdminPage>
      <AdminHeader title="달란트" />
      <FlashNote ok={sp.ok} error={sp.error} />
      <div className={writeSplitClass}>
        <section className="flex min-w-0 flex-col">
          <SectionHead note={events.length > 0 ? `${events.length}개` : undefined}>달란트 잔치</SectionHead>
          <Small>한 해 동안 모은 포인트를 달란트로 바꾸고, 잔치 날 선생님들이 코너에서 달란트를 결제해요. 포인트는 줄어들지 않고 그대로 남아요.</Small>
          <List className="mt-1">
            {events.map((e) => {
              const when = e.status === "draft" ? `${shortDate(kstDate(e.created_at))} 만듦` : e.status === "open" ? `${shortDate(kstDate(e.opened_at))} 시작` : `${shortDate(kstDate(e.closed_at))} 마침`;
              return (
                <ListRow
                  key={e.id}
                  href={`/staff/admin/talents/${e.id}`}
                  left={<ClayIcon name="pouch" size="s" />}
                  title={
                    <>
                      {e.name}
                      <span className="ml-1.5 align-[2px]">
                        <Tag tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Tag>
                      </span>
                    </>
                  }
                  sub={`${e.points_per_talent}P = 1달란트 · ${when}`}
                  right={<Chevron />}
                />
              );
            })}
          </List>
          {events.length === 0 ? <EmptyNote>아직 만든 잔치가 없어요.</EmptyNote> : null}
        </section>

        <FormSection box title="새 잔치 준비하기">
          <form action={talentCreateAction} className="flex flex-col gap-3">
            <TextInput label="잔치 이름" name="name" id="t-name" required maxLength={30} placeholder="예: 2027 달란트 잔치" error={errorFor(sp.error, /이름/)} />
            <TextInput
              label="달란트 1개에 필요한 포인트"
              name="rate"
              id="t-rate"
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              defaultValue={10}
              required
              hint="초안에서 여러 비율을 넣어 보고 정할 수 있어요. 시작하기 전까지는 아이들에게 아무것도 바뀌지 않아요."
              error={errorFor(sp.error, /필요한 포인트/)}
            />
            <SubmitButton>초안 만들기</SubmitButton>
          </form>
        </FormSection>
      </div>
    </AdminPage>
  );
}
