import { AdminHeader, AdminPage, DownloadLink, Small, rowClass, tableClass, tdClass, thClass, writeSplitClass } from "@/components/staff/admin-kit";
import { ChoiceChips, FormSection, SelectInput, SubmitButton, TextInput, errorFor } from "@/components/staff/form-kit";
import { Card, EmptyNote, FlashNote, SectionHead } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { pointsAdjustAction } from "@/lib/staff/actions-admin";
import { balances, recentAdjustments } from "@/lib/staff/admin-misc";
import { shortDate } from "@/lib/staff/util";

export const metadata = { title: "포인트 조정 · 꿈의숲키우기" };

export default async function PointsAdminPage({ searchParams }: PageProps<"/staff/admin/points">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const [rows, recent] = await Promise.all([balances(staff), recentAdjustments(staff)]);
  const kids = rows ?? [];
  return (
    <AdminPage>
      <AdminHeader title="포인트 조정" count={`${kids.length}명`} />
      <FlashNote ok={sp.ok} error={sp.error} />
      <div className={writeSplitClass}>
        {/* The form and the downloads: first on phones, at the right on wide screens. */}
        <div className="flex min-w-0 flex-col gap-3.5 md:col-start-2 md:row-start-1">
          <FormSection box title="포인트 고치기">
            <form action={pointsAdjustAction} className="flex flex-col gap-3">
              <SelectInput label="아이" name="child_id" id="pt-child" required defaultValue="" error={errorFor(sp.error, /아이를/)}>
                <option value="" disabled>
                  아이를 골라 주세요
                </option>
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.class_name ?? "반 없음"}) · {k.points}P
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
              <TextInput label="포인트" name="amount" id="pt-amount" type="number" inputMode="numeric" min={1} max={10000} required error={errorFor(sp.error, /포인트는/)} />
              <TextInput label="이유" name="reason" id="pt-reason" required maxLength={100} placeholder="예: 성경 암송 대회 상" hint="고친 사람과 이유가 기록에 남아요. 전에 적은 기록은 지워지지 않아요." error={errorFor(sp.error, /이유/)} />
              <SubmitButton>포인트 고치기</SubmitButton>
            </form>
          </FormSection>
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-2 gap-2 max-[339px]:grid-cols-1">
              {/* Plain links: the files are made by route handlers that check for an admin again. */}
              <DownloadLink href="/staff/admin/export/points" className="min-w-0">
                포인트 내려받기
              </DownloadLink>
              <DownloadLink href="/staff/admin/export/attendance" className="min-w-0">
                출석부 내려받기
              </DownloadLink>
            </div>
            <Small>엑셀에서 바로 열리는 CSV 파일이에요. 아이들 이름이 들어 있으니 다른 곳에 올리지 말아 주세요.</Small>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5 md:col-start-1 md:row-start-1">
          {recent && recent.length > 0 ? (
            <section className="flex flex-col">
              <SectionHead>최근에 고친 기록</SectionHead>
              {recent.map((r) => (
                <div key={r.id} className="flex min-h-11 items-center gap-2 border-b border-line py-2 last:border-b-0">
                  <span className="flex min-w-0 grow flex-col">
                    <span className="text-[14px] text-ink2">
                      <b>{r.child_name}</b> {r.reason}
                    </span>
                    <span className="text-[12px] text-mute">
                      {shortDate(r.on)} · {r.staff_name ?? "알 수 없음"}
                    </span>
                  </span>
                  <b className={`shrink-0 text-right text-[15px] ${r.delta < 0 ? "text-danger" : "text-blue"}`}>
                    {r.delta > 0 ? "+" : ""}
                    {r.delta}P
                  </b>
                </div>
              ))}
            </section>
          ) : null}

          <section className="flex flex-col gap-1.5">
            <SectionHead>아이별 포인트</SectionHead>
            {kids.length > 0 ? (
              <Card>
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass()}>
                        이름
                      </th>
                      <th scope="col" className={thClass()}>
                        반
                      </th>
                      <th scope="col" className={thClass({ center: true })}>
                        물방울
                      </th>
                      <th scope="col" className={thClass({ center: true })}>
                        포인트
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {kids.map((k) => (
                      <tr key={k.id} className={rowClass}>
                        <th scope="row" className={`${tdClass()} text-left font-bold`}>
                          {k.name}
                        </th>
                        <td className={`${tdClass()} text-mute`}>{k.class_name ?? "-"}</td>
                        <td className={tdClass({ center: true, nowrap: true })}>{k.drops}개</td>
                        <td className={`${tdClass({ center: true, nowrap: true })} font-bold text-blue`}>{k.points}P</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : (
              <EmptyNote>아직 아이가 없어요.</EmptyNote>
            )}
          </section>
        </div>
      </div>
    </AdminPage>
  );
}
