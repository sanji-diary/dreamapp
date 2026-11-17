import Link from "next/link";
import { notFound } from "next/navigation";
import { TalentDraft } from "@/components/staff/TalentDraft";
import { Chips, Empty, Field, Flash, H2, Note, SubHeader, TextField, selectClass } from "@/components/staff/ui";
import { ConfirmButton } from "@/components/staff/widgets";
import { Tag, primaryButtonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { talentAdjustAction, talentEventAction } from "@/lib/staff/actions-festival";
import { eventBoard, eventLog, kindName, kstDateTime, previewRows } from "@/lib/staff/festival";
import { kstDate, shortDate, toInt } from "@/lib/staff/util";
import { getEvent } from "@/lib/talents";

export const metadata = { title: "달란트 잔치 · 꿈의숲키우기" };

const downloadClass = "flex h-11 flex-1 items-center justify-center rounded-[10px] bg-fill text-[14px] font-bold text-ink2 no-underline";

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[13px] text-sub">{label}</span>
      <span className="text-[20px] font-bold tracking-[-0.3px]">{value.toLocaleString("ko-KR")}개</span>
    </div>
  );
}

export default async function TalentEventPage({ params, searchParams }: PageProps<"/staff/admin/talents/[id]">) {
  const staff = await requireAdmin();
  const id = toInt((await params).id);
  const sp = await searchParams;
  const event = id === null ? null : await getEvent(id);
  if (!event) notFound();
  const header = <SubHeader back="/staff/admin/talents" backLabel="달란트 잔치 목록으로 돌아가기" title={event.name} />;

  if (event.status === "draft") {
    const rows = (await previewRows(staff)) ?? [];
    return (
      <>
        {header}
        <Flash ok={sp.ok} error={sp.error} />
        <div className="flex gap-1.5 px-4 pt-2">
          <Tag>초안</Tag>
          <Tag>미리 보기</Tag>
        </div>
        <TalentDraft id={event.id} name={event.name} rate={event.points_per_talent} rows={rows} />
      </>
    );
  }

  const [board, log] = await Promise.all([eventBoard(staff, event.id), eventLog(staff, event.id, 50)]);
  if (!board) notFound();
  const open = event.status === "open";
  const rows = board.rows;
  const entries = log ?? [];

  return (
    <>
      {header}
      <Flash ok={sp.ok} error={sp.error} />
      <div className="flex flex-wrap gap-1.5 px-4 pt-2">
        <Tag tone={open ? "tint" : "gray"}>{open ? "진행 중" : "마침"}</Tag>
        <Tag>{event.points_per_talent}P = 1달란트</Tag>
        <Tag>
          {shortDate(kstDate(event.opened_at))} 시작{event.closed_at ? ` · ${shortDate(kstDate(event.closed_at))} 마침` : ""}
        </Tag>
      </div>

      <section className="mx-4 mt-3 grid grid-cols-3 rounded-2xl bg-fill px-2 py-4">
        <Tile label="나눈 달란트" value={board.totals.granted + board.totals.adjusted} />
        <Tile label="쓴 달란트" value={board.totals.spent} />
        <Tile label="남은 달란트" value={board.totals.balance} />
      </section>

      <section className="flex flex-col gap-2 px-4 pt-3">
        {open ? (
          <Link href="/staff/festival" className={`${primaryButtonClass} no-underline`}>
            결제 화면 열기
          </Link>
        ) : null}
        <div className="flex gap-2">
          {/* Plain links: the files are made by a route handler that checks for an admin again. */}
          <a href={`/staff/admin/export/talents?event=${event.id}&kind=summary`} download className={downloadClass}>
            아이별 정리 내려받기
          </a>
          <a href={`/staff/admin/export/talents?event=${event.id}&kind=log`} download className={downloadClass}>
            사용 기록 내려받기
          </a>
        </div>
        <Note>엑셀에서 바로 열리는 CSV 파일이에요. 아이들 이름이 들어 있으니 다른 곳에 올리지 말아 주세요.</Note>
      </section>

      {open ? (
        <section className="flex flex-col px-4">
          <H2>달란트 고치기</H2>
          <form action={talentAdjustAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={event.id} />
            <Field label="아이" htmlFor="ta-child">
              <select id="ta-child" name="child_id" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  아이를 골라 주세요
                </option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.class_name ?? "반 없음"}) · {r.balance}개
                  </option>
                ))}
              </select>
            </Field>
            <Chips
              legend="더하기 / 빼기"
              name="sign"
              value="plus"
              options={[
                { value: "plus", label: "더하기" },
                { value: "minus", label: "빼기" },
              ]}
            />
            <TextField label="달란트" name="amount" type="number" inputMode="numeric" min={1} max={1000} required />
            <TextField label="이유" name="reason" required maxLength={60} placeholder="예: 성경 퀴즈 1등 상" hint="고친 사람과 이유가 기록에 남아요. 남은 달란트보다 많이 뺄 수는 없어요." />
            <button type="submit" className={`${primaryButtonClass} cursor-pointer`}>
              달란트 고치기
            </button>
          </form>
        </section>
      ) : null}

      <section className="flex flex-col px-4">
        <H2>아이별 달란트</H2>
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line text-left text-[13px] text-mute">
              <th scope="col" className="h-9 font-semibold">
                이름
              </th>
              <th scope="col" className="w-[52px] text-right font-semibold">
                받음
              </th>
              <th scope="col" className="w-[48px] text-right font-semibold">
                씀
              </th>
              <th scope="col" className="w-[48px] text-right font-semibold">
                조정
              </th>
              <th scope="col" className="w-[56px] text-right font-semibold">
                남음
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line">
                <th scope="row" className="h-12 text-left font-normal">
                  <span className="block truncate font-bold text-ink2">{r.name}</span>
                  <span className="block truncate text-[12px] text-mute">
                    {r.class_name ?? "반 없음"}
                    {r.points_at_open === null ? " · 시작 뒤 추가" : ` · ${r.points_at_open.toLocaleString("ko-KR")}P`}
                  </span>
                </th>
                <td className="text-right text-sub">{r.granted}</td>
                <td className="text-right text-sub">{r.spent}</td>
                <td className="text-right text-sub">{r.adjusted > 0 ? `+${r.adjusted}` : r.adjusted}</td>
                <td className="text-right font-bold text-ink2">{r.balance}개</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <Empty>아직 아이가 없어요.</Empty> : null}
      </section>

      <section className="flex flex-col px-4">
        <H2>최근 기록</H2>
        {entries.length === 0 ? <Empty>아직 결제한 기록이 없어요.</Empty> : null}
        <ul className="m-0 flex list-none flex-col p-0">
          {entries.map((l, i) => (
            <li key={l.id} className={`flex min-h-12 items-center gap-2 py-1.5 ${i === entries.length - 1 ? "" : "border-b border-line"}`}>
              <span className="flex min-w-0 grow flex-col">
                <span className="truncate text-[14px] text-ink2">
                  <b>{l.child_name}</b> {l.reason}
                </span>
                <span className="truncate text-[12px] text-mute">
                  {kstDateTime(l.created_at).slice(5, 16).replace("-", "/")} · {kindName(l.kind)} · {l.staff_name ?? "알 수 없음"}
                </span>
              </span>
              <span className={`w-[52px] shrink-0 text-right text-[15px] font-bold ${l.delta < 0 ? "text-ink2" : "text-navy"}`}>
                {l.delta > 0 ? "+" : "−"}
                {Math.abs(l.delta)}
              </span>
            </li>
          ))}
        </ul>
        {entries.length === 50 ? <Note>최근 50건만 보여요. 전체는 사용 기록 내려받기로 볼 수 있어요.</Note> : null}
      </section>

      {open ? (
        <section className="flex flex-col gap-2 px-4 pt-6 pb-6">
          <form action={talentEventAction}>
            <input type="hidden" name="id" value={event.id} />
            <ConfirmButton
              name="op"
              value="close"
              message={"잔치를 마칠까요?\n\n· 마치면 더 이상 결제하거나 달란트를 고칠 수 없어요.\n· 다시 열 수 없어요.\n· 남은 달란트와 사용 기록은 그대로 남아서 내려받을 수 있어요."}
              className="flex h-[52px] w-full cursor-pointer items-center justify-center rounded-xl border-0 bg-danger text-[16px] font-bold text-white"
            >
              잔치 마치기
            </ConfirmButton>
          </form>
          <Note>마치면 선생님들의 결제 화면과 아이들의 내 달란트가 닫혀요.</Note>
        </section>
      ) : (
        <div className="pb-6" />
      )}
    </>
  );
}
