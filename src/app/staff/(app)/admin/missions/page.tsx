import Link from "next/link";
import { Empty, Flash, SmallButton, SmallLink, SubHeader } from "@/components/staff/ui";
import { Circle, Icon, SectionTitle, Tag } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { missionOpAction } from "@/lib/staff/actions-admin";
import { listMissions, weeklyDropCheck, weeklyDrops } from "@/lib/staff/admin-missions";
import { shortDate } from "@/lib/staff/util";
import { KIND_NAMES, type Mission } from "@/lib/types";

export const metadata = { title: "미션 관리 · 꿈의숲키우기" };

function MissionRow({ m, target, last, past }: { m: Mission; target: string; last: boolean; past: boolean }) {
  return (
    <li className={`flex flex-col py-2 ${last ? "" : "border-b border-line"}`}>
      <Link href={`/staff/admin/missions/${m.id}`} className="flex min-h-14 items-center gap-[13px] text-inherit no-underline">
        <Circle>
          <Icon name={m.icon} />
        </Circle>
        <div className="flex min-w-0 grow flex-col gap-px">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[17px] leading-[23px] font-bold tracking-[-0.4px] text-ink2">{m.title}</span>
            {m.is_challenge ? <Tag tone="warn">도전</Tag> : null}
            {!m.active ? <Tag>내림</Tag> : null}
          </div>
          <div className="truncate text-[13px] leading-[18px] tracking-[-0.2px] text-sub">
            {KIND_NAMES[m.kind]} · 물방울 {m.drops}개{m.repeat === "daily" ? ` (주 ${weeklyDrops(m)}개까지)` : ""} · {m.points}P · {target}
          </div>
          <div className="truncate text-[13px] leading-[18px] text-mute">
            {shortDate(m.starts_on)} - {shortDate(m.ends_on)} · {m.repeat === "once" ? "한 번" : m.repeat === "daily" ? "매일" : "매주"}
          </div>
        </div>
      </Link>
      <form action={missionOpAction} className="flex justify-end gap-[5px]">
        <input type="hidden" name="id" value={m.id} />
        <SmallLink href={`/staff/admin/missions/${m.id}`} tone="gray">
          수정
        </SmallLink>
        <SmallButton tone="gray" name="op" value="duplicate" width={86} label={`${m.title} 다음 주로 복사`}>
          다음 주로 복사
        </SmallButton>
        {m.active ? (
          past ? null : (
            <SmallButton tone="gray" name="op" value="deactivate" label={`${m.title} 내리기`}>
              내리기
            </SmallButton>
          )
        ) : (
          <SmallButton tone="gray" name="op" value="activate" width={60} label={`${m.title} 다시 올리기`}>
            다시 올리기
          </SmallButton>
        )}
      </form>
    </li>
  );
}

export default async function MissionsAdminPage({ searchParams }: PageProps<"/staff/admin/missions">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const [lists, check, classes] = await Promise.all([listMissions(staff), weeklyDropCheck(staff), listClasses(db, true)]);
  if (!lists || !check) return null;
  const target = (m: Mission) => (m.target_class_id !== null ? (classes.find((c) => c.id === m.target_class_id)?.name ?? "반") : m.target_grade !== null ? `${m.target_grade}학년` : "전체");
  const totals = [...new Set(check.classes.map((c) => c.total))];
  const section = (title: string, list: Mission[], past = false) => (
    <section className="flex flex-col">
      <SectionTitle>
        {title} {list.length}개
      </SectionTitle>
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((m, i) => (
          <MissionRow key={m.id} m={m} target={target(m)} last={i === list.length - 1} past={past} />
        ))}
      </ul>
      {list.length === 0 ? <Empty>없어요.</Empty> : null}
    </section>
  );

  return (
    <>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="미션" right={<SmallLink href="/staff/admin/missions/new" width={74}>미션 만들기</SmallLink>} />
      <Flash ok={sp.ok} error={sp.error} />
      {check.over || check.under ? (
        <div role="status" className="mx-4 mt-3 rounded-[10px] bg-warn-tint px-3 py-2.5 text-[13px] leading-[19px] font-semibold text-warn">
          {totals.length === 1 ? (
            <p className="m-0">
              이번 주 미션을 다 하면 물방울 {totals[0]}개예요. 한 주 한도는 {check.cap}개예요. {totals[0] > check.cap ? "넘는 만큼은 아이가 받지 못해요." : "한도보다 적게 모을 수 있어요."}
            </p>
          ) : (
            <>
              <p className="m-0">이번 주 미션 물방울 합계가 한 주 한도({check.cap}개)와 달라요.</p>
              <ul className="m-0 pl-4">
                {check.classes
                  .filter((c) => c.total !== check.cap)
                  .map((c) => (
                    <li key={c.name}>
                      {c.name}: {c.total}개 ({c.total > check.cap ? "넘는 만큼은 받지 못해요" : "한도보다 적어요"})
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <p className="mx-4 mt-3 mb-0 rounded-[10px] bg-navy-tint px-3 py-2.5 text-[13px] leading-[19px] font-semibold text-navy">이번 주 미션을 다 하면 물방울 {check.cap}개로, 한 주 한도와 딱 맞아요.</p>
      )}
      <div className="flex flex-col px-4 pb-6">
        {section("이번 주 미션", lists.current)}
        {lists.upcoming.length > 0 ? section("앞으로 열릴 미션", lists.upcoming) : null}
        {section("지난 미션", lists.past, true)}
      </div>
    </>
  );
}
