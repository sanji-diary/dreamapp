import { Chips, Empty, Field, Flash, H2, Note, SubHeader, TextField, selectClass } from "@/components/staff/ui";
import { primaryButtonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { pointsAdjustAction } from "@/lib/staff/actions-admin";
import { balances, recentAdjustments } from "@/lib/staff/admin-misc";
import { shortDate } from "@/lib/staff/util";

export const metadata = { title: "포인트 · 꿈의숲키우기" };

const downloadClass = "flex h-11 flex-1 items-center justify-center rounded-[10px] bg-fill text-[14px] font-bold text-ink2 no-underline";

export default async function PointsAdminPage({ searchParams }: PageProps<"/staff/admin/points">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const [rows, recent] = await Promise.all([balances(staff), recentAdjustments(staff)]);
  const kids = rows ?? [];
  return (
    <>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="포인트" />
      <Flash ok={sp.ok} error={sp.error} />
      <section className="flex flex-col gap-2 px-4 pt-2">
        <div className="flex gap-2">
          {/* Plain links: the files are made by route handlers that check for an admin again. */}
          <a href="/staff/admin/export/points" download className={downloadClass}>
            포인트 내려받기
          </a>
          <a href="/staff/admin/export/attendance" download className={downloadClass}>
            출석부 내려받기
          </a>
        </div>
        <Note>엑셀에서 바로 열리는 CSV 파일이에요. 아이들 이름이 들어 있으니 다른 곳에 올리지 말아 주세요.</Note>
      </section>

      <section className="flex flex-col px-4">
        <H2>포인트 고치기</H2>
        <form action={pointsAdjustAction} className="flex flex-col gap-3">
          <Field label="아이" htmlFor="pt-child">
            <select id="pt-child" name="child_id" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                아이를 골라 주세요
              </option>
              {kids.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} ({k.class_name ?? "반 없음"}) · {k.points}P
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
          <TextField label="포인트" name="amount" type="number" inputMode="numeric" min={1} max={10000} required />
          <TextField label="이유" name="reason" required maxLength={100} placeholder="예: 성경 암송 대회 상" hint="고친 사람과 이유가 기록에 남아요. 전에 적은 기록은 지워지지 않아요." />
          <button type="submit" className={`${primaryButtonClass} cursor-pointer`}>
            포인트 고치기
          </button>
        </form>
      </section>

      {recent && recent.length > 0 ? (
        <section className="flex flex-col px-4">
          <H2>최근에 고친 기록</H2>
          {recent.map((r, i) => (
            <div key={r.id} className={`flex min-h-11 items-center gap-2 py-1.5 ${i === recent.length - 1 ? "" : "border-b border-line"}`}>
              <span className="min-w-0 grow truncate text-[14px] text-ink2">
                <b>{r.child_name}</b> {r.reason}
              </span>
              <span className="shrink-0 text-[13px] text-mute">
                {shortDate(r.on)} · {r.staff_name ?? "알 수 없음"}
              </span>
              <span className={`w-[58px] shrink-0 text-right text-[15px] font-bold ${r.delta < 0 ? "text-danger" : "text-navy"}`}>
                {r.delta > 0 ? "+" : ""}
                {r.delta}P
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col px-4 pb-6">
        <H2>아이별 포인트</H2>
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-line text-left text-[13px] text-mute">
              <th scope="col" className="h-9 font-semibold">
                이름
              </th>
              <th scope="col" className="font-semibold">
                반
              </th>
              <th scope="col" className="text-right font-semibold">
                물방울
              </th>
              <th scope="col" className="text-right font-semibold">
                포인트
              </th>
            </tr>
          </thead>
          <tbody>
            {kids.map((k) => (
              <tr key={k.id} className="border-b border-line">
                <th scope="row" className="h-11 text-left font-bold text-ink2">
                  {k.name}
                </th>
                <td className="text-sub">{k.class_name ?? "-"}</td>
                <td className="text-right text-sub">{k.drops}개</td>
                <td className="text-right font-bold text-ink2">{k.points}P</td>
              </tr>
            ))}
          </tbody>
        </table>
        {kids.length === 0 ? <Empty>아직 아이가 없어요.</Empty> : null}
      </section>
    </>
  );
}
