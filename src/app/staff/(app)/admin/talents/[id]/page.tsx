import { notFound } from "next/navigation";
import { AdminPage, DownloadLink, Small, rowClass, tableClass, tdClass, thClass, writeSplitClass } from "@/components/staff/admin-kit";
import { ChoiceChips, FormSection, SelectInput, SubmitButton, TextInput, errorFor } from "@/components/staff/form-kit";
import { Card, CtaLink, EmptyNote, FlashNote, Page, PageHeader, SectionHead, StatTile, Tag } from "@/components/staff/kit";
import { TalentDraft } from "@/components/staff/TalentDraft";
import { ConfirmButton } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { talentAdjustAction, talentEventAction } from "@/lib/staff/actions-festival";
import { eventBoard, eventLog, kindName, kstDateTime, previewRows } from "@/lib/staff/festival";
import { kstDate, shortDate, toInt } from "@/lib/staff/util";
import { getEvent } from "@/lib/talents";

export const metadata = { title: "달란트 잔치 · 꿈의숲키우기" };

const n = (v: number) => v.toLocaleString("ko-KR");

export default async function TalentEventPage({ params, searchParams }: PageProps<"/staff/admin/talents/[id]">) {
  const staff = await requireAdmin();
  const id = toInt((await params).id);
  const sp = await searchParams;
  const event = id === null ? null : await getEvent(id);
  if (!event) notFound();
  const header = <PageHeader back="/staff/admin/talents" backLabel="달란트 잔치 목록으로 돌아가기" title={event.name} />;
  const error = typeof sp.error === "string" ? sp.error : undefined;

  if (event.status === "draft") {
    const rows = (await previewRows(staff)) ?? [];
    return (
      <Page>
        {header}
        <FlashNote ok={sp.ok} error={sp.error} />
        <div className="flex flex-wrap gap-[7px]">
          <Tag>초안</Tag>
          <Tag>미리 보기</Tag>
        </div>
        <TalentDraft id={event.id} name={event.name} rate={event.points_per_talent} rows={rows} error={error} />
      </Page>
    );
  }

  const [board, log] = await Promise.all([eventBoard(staff, event.id), eventLog(staff, event.id, 50)]);
  if (!board) notFound();
  const open = event.status === "open";
  const rows = board.rows;
  const entries = log ?? [];

  return (
    <AdminPage>
      {header}
      <FlashNote ok={sp.ok} error={sp.error} />
      <div className="flex flex-wrap gap-[7px]">
        <Tag tone={open ? "navy" : "gray"}>{open ? "진행 중" : "마침"}</Tag>
        <Tag>{event.points_per_talent}P = 1달란트</Tag>
        <Tag>
          {shortDate(kstDate(event.opened_at))} 시작{event.closed_at ? ` · ${shortDate(kstDate(event.closed_at))} 마침` : ""}
        </Tag>
      </div>

      <div className={writeSplitClass}>
        {/* Numbers and what can be done: first on phones, at the right on wide screens. */}
        <div className="flex min-w-0 flex-col gap-3.5 md:col-start-2 md:row-start-1">
          <div className="grid grid-cols-3 gap-2">
            <StatTile value={`${n(board.totals.granted + board.totals.adjusted)}개`} label="나눈 달란트" />
            <StatTile value={`${n(board.totals.spent)}개`} label="쓴 달란트" />
            <StatTile value={`${n(board.totals.balance)}개`} label="남은 달란트" tone="blue" />
          </div>
          {open ? <CtaLink href="/staff/festival">결제 화면 열기</CtaLink> : null}
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-2 max-[339px]:grid-cols-1">
              {/* Plain links: the files are made by a route handler that checks for an admin again. */}
              <DownloadLink href={`/staff/admin/export/talents?event=${event.id}&kind=summary`} className="min-w-0">
                아이별 정리 받기
              </DownloadLink>
              <DownloadLink href={`/staff/admin/export/talents?event=${event.id}&kind=log`} className="min-w-0">
                사용 기록 받기
              </DownloadLink>
            </div>
            <Small>엑셀에서 바로 열리는 CSV 파일이에요. 아이들 이름이 들어 있으니 다른 곳에 올리지 말아 주세요.</Small>
          </div>

          {open ? (
            <FormSection box title="달란트 고치기">
              <form action={talentAdjustAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={event.id} />
                <SelectInput label="아이" name="child_id" id="ta-child" required defaultValue="" error={errorFor(sp.error, /아이를/)}>
                  <option value="" disabled>
                    아이를 골라 주세요
                  </option>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.class_name ?? "반 없음"}) · {r.balance}개
                    </option>
                  ))}
                </SelectInput>
                <ChoiceChips
                  legend="더하기 / 빼기"
                  name="sign"
                  value="plus"
                  onGray
                  options={[
                    { value: "plus", label: "더하기" },
                    { value: "minus", label: "빼기" },
                  ]}
                />
                <TextInput label="달란트" name="amount" id="ta-amount" type="number" inputMode="numeric" min={1} max={1000} required error={errorFor(sp.error, /달란트는|많이 뺄/)} />
                <TextInput label="이유" name="reason" id="ta-reason" required maxLength={60} placeholder="예: 성경 퀴즈 1등 상" hint="고친 사람과 이유가 기록에 남아요. 남은 달란트보다 많이 뺄 수는 없어요." error={errorFor(sp.error, /이유/)} />
                <SubmitButton>달란트 고치기</SubmitButton>
              </form>
            </FormSection>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3.5 md:col-start-1 md:row-span-2 md:row-start-1">
          <section className="flex flex-col gap-1.5">
            <SectionHead note={`${rows.length}명`}>아이별 달란트</SectionHead>
            {rows.length > 0 ? (
              <Card className="overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass()}>
                        이름
                      </th>
                      <th scope="col" className={thClass({ center: true })}>
                        받음
                      </th>
                      <th scope="col" className={thClass({ center: true })}>
                        씀
                      </th>
                      <th scope="col" className={thClass({ center: true })}>
                        조정
                      </th>
                      <th scope="col" className={thClass({ center: true })}>
                        남음
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={rowClass}>
                        <th scope="row" className={`${tdClass()} text-left font-normal`}>
                          <b className="block">{r.name}</b>
                          <span className="block text-[12px] text-mute">
                            {r.class_name ?? "반 없음"}
                            {r.points_at_open === null ? " · 시작 뒤 추가" : ` · ${n(r.points_at_open)}P`}
                          </span>
                        </th>
                        <td className={tdClass({ center: true, nowrap: true })}>{r.granted}</td>
                        <td className={tdClass({ center: true, nowrap: true })}>{r.spent}</td>
                        <td className={tdClass({ center: true, nowrap: true })}>{r.adjusted > 0 ? `+${r.adjusted}` : r.adjusted}</td>
                        <td className={`${tdClass({ center: true, nowrap: true })} font-bold text-blue`}>{r.balance}개</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : (
              <EmptyNote>아직 아이가 없어요.</EmptyNote>
            )}
          </section>

          <section className="flex flex-col">
            <SectionHead>최근 기록</SectionHead>
            {entries.length === 0 ? <EmptyNote>아직 결제한 기록이 없어요.</EmptyNote> : null}
            <ul className="m-0 flex list-none flex-col p-0">
              {entries.map((l) => (
                <li key={l.id} className="flex min-h-12 items-center gap-2 border-b border-line py-2 last:border-b-0">
                  <span className="flex min-w-0 grow flex-col">
                    <span className="text-[14px] text-ink2">
                      <b>{l.child_name}</b> {l.reason}
                    </span>
                    <span className="text-[12px] text-mute">
                      {kstDateTime(l.created_at).slice(5, 16).replace("-", "/")} · {kindName(l.kind)} · {l.staff_name ?? "알 수 없음"}
                    </span>
                  </span>
                  <b className={`shrink-0 text-right text-[15px] ${l.delta < 0 ? "text-ink2" : "text-blue"}`}>
                    {l.delta > 0 ? "+" : "−"}
                    {Math.abs(l.delta)}
                  </b>
                </li>
              ))}
            </ul>
            {entries.length === 50 ? <Small>최근 50건만 보여요. 전체는 ‘사용 기록 받기’로 볼 수 있어요.</Small> : null}
          </section>
        </div>

        {open ? (
          <section className="flex flex-col gap-1.5 md:col-start-2 md:row-start-2">
            <form action={talentEventAction}>
              <input type="hidden" name="id" value={event.id} />
              <ConfirmButton
                name="op"
                value="close"
                message={"잔치를 마칠까요?\n\n· 마치면 더 이상 결제하거나 달란트를 고칠 수 없어요.\n· 다시 열 수 없어요.\n· 남은 달란트와 사용 기록은 그대로 남아서 내려받을 수 있어요."}
                className="flex h-[52px] w-full cursor-pointer items-center justify-center rounded-[14px] border-0 bg-danger text-[16px] font-bold tracking-[-0.02em] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
              >
                잔치 마치기
              </ConfirmButton>
            </form>
            <Small>마치면 선생님들의 결제 화면과 아이들의 내 달란트가 닫혀요.</Small>
          </section>
        ) : null}
      </div>
    </AdminPage>
  );
}
