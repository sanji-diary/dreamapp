import Link from "next/link";
import { AdminHeader, AdminPage, ConfirmPill, Small, rowClass, tableClass, tdClass, thClass } from "@/components/staff/admin-kit";
import { AttendanceDots, AttendanceLegend } from "@/components/staff/attendance-dots";
import { ErrorText, errorFor, inputBoxClass, selectBoxClass } from "@/components/staff/form-kit";
import { EmptyNote, FlashNote, PillButton, SectionHead, Tag, TreeAvatar, barButtonClass } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { childrenMoveAction, classOpAction, classSaveAction } from "@/lib/staff/actions-admin";
import { adminClasses } from "@/lib/staff/admin-misc";
import { listStaff } from "@/lib/staff/admin-staff";
import { childStats, listChildren } from "@/lib/staff/children";
import { toInt } from "@/lib/staff/util";

export const metadata = { title: "반 편성 · 꿈의숲키우기" };

function GradeSelect({ id, value, label }: { id: string; value: number | null; label: string }) {
  return (
    <span className="flex w-[110px] shrink-0 max-[359px]:w-auto max-[359px]:grow">
      <select id={id} name="grade" defaultValue={value ?? ""} aria-label={label} className={selectBoxClass()}>
        <option value="">학년 없음</option>
        {[1, 2, 3, 4, 5, 6].map((g) => (
          <option key={g} value={g}>
            {g}학년
          </option>
        ))}
      </select>
    </span>
  );
}

const cardClass = "flex min-w-0 flex-col rounded-[20px] border border-line bg-white lg:rounded-2xl lg:border-staff-line lg:shadow-[0_1px_2px_rgba(17,24,39,0.04)]";

/**
 * 반 편성 (design-reference/admin2/Classes.dc.html): the classes on the left, the children of the
 * chosen class on the right. Children are picked with check boxes and moved with the bar above
 * them. The choice of class lives in the address (?class=, "none" for children without a class).
 */
export default async function ClassesAdminPage({ searchParams }: PageProps<"/staff/admin/classes">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const [classes, all, people] = await Promise.all([adminClasses(staff).then((l) => l ?? []), listChildren(staff), listStaff(staff).then((l) => l ?? [])]);
  const open = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);
  const noClass = all.filter((k) => k.class_id === null);
  // Older links used ?from= for the class whose children were being moved.
  const asked = sp.class ?? sp.from;
  const sel: number | "none" | null = asked === "none" ? "none" : (classes.find((c) => c.id === toInt(asked))?.id ?? open[0]?.id ?? (noClass.length > 0 ? "none" : null));
  const current = typeof sel === "number" ? (classes.find((c) => c.id === sel) ?? null) : null;
  const kids = sel === null ? [] : all.filter((k) => (sel === "none" ? k.class_id === null : k.class_id === sel));
  const stats = await childStats(staff, kids.map((k) => k.id));
  const teachersOf = (id: number) => people.filter((p) => p.active && p.class_ids.includes(id)).map((p) => p.name);
  const moveError = errorFor(sp.error, /옮길 아이|옮길 반|반을 찾을/);
  const targets = open.filter((c) => c.id !== sel);
  const index = current ? open.findIndex((c) => c.id === current.id) : -1;

  const listRow = (key: string, href: string, on: boolean, name: string, sub: string, count: number, warn = false) => (
    <Link
      key={key}
      href={href}
      scroll={false}
      aria-current={on ? "true" : undefined}
      className={`flex min-h-[60px] items-center gap-3 rounded-xl px-3 py-2 no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-staff ${on ? "bg-staff-tint" : "hover:bg-fill"}`}
    >
      <span className="flex min-w-0 grow flex-col leading-[1.35]">
        <b className={`text-[15px] ${on ? "text-staff" : "text-ink"}`}>{name}</b>
        <span className={`truncate text-[13px] ${warn ? "text-badge" : "text-mute"}`}>{sub}</span>
      </span>
      <span className={`grid h-7 min-w-11 place-items-center rounded-full px-2.5 text-[13.5px] font-bold ${warn && count > 0 ? "bg-[#fff0e5] text-badge" : on ? "bg-white text-staff" : "bg-[#f2f4f6] text-sub"}`}>{count}명</span>
    </Link>
  );

  return (
    <AdminPage>
      <AdminHeader title="반 편성" count={`${open.length}개 반 · 아이 ${all.length}명`} />
      <FlashNote ok={sp.ok} error={moveError ? undefined : sp.error} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3.5 md:grid-cols-[300px_minmax(0,1fr)] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-3.5">
          <section aria-labelledby="list-h" className={cardClass}>
            <h2 id="list-h" className="m-0 px-4 pt-4 pb-2 text-[17px] font-bold tracking-[-0.02em] lg:px-5">
              반 목록
            </h2>
            <nav aria-label="반 고르기" className="flex flex-col gap-0.5 px-2 pb-2">
              {open.map((c) => {
                const t = teachersOf(c.id);
                return listRow(String(c.id), `/staff/admin/classes?class=${c.id}`, sel === c.id, c.name, t.length > 0 ? `담임 ${t.join(", ")}` : "담임 없음", c.children);
              })}
              {listRow("none", "/staff/admin/classes?class=none", sel === "none", "반 없는 아이", noClass.length > 0 ? "반을 정해 주세요" : "모두 반이 있어요", noClass.length, noClass.length > 0)}
            </nav>
            <form action={classSaveAction} className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-3 lg:border-[#f1f3f6]">
              <span className="flex min-w-0 grow basis-[120px]">
                <input name="name" required maxLength={20} placeholder="새 반 이름" aria-label="새 반 이름" className={inputBoxClass()} />
              </span>
              <GradeSelect id="g-new" value={null} label="새 반 학년" />
              <PillButton label="반 만들기">추가</PillButton>
            </form>
          </section>
          {archived.length > 0 ? (
            <section className={`${cardClass} px-4 py-2`}>
              <SectionHead note="아이들에게 보이지 않아요">보관한 반</SectionHead>
              {archived.map((c) => (
                <form key={c.id} action={classOpAction} className="flex min-h-11 items-center gap-2 border-b border-line last:border-b-0 lg:border-[#f1f3f6]">
                  <input type="hidden" name="id" value={c.id} />
                  <span className="flex min-w-0 grow flex-wrap items-center gap-1.5 text-[15px] font-semibold text-sub">
                    <Link href={`/staff/admin/classes?class=${c.id}`} className="text-sub no-underline hover:underline">
                      {c.name}
                    </Link>
                    <Tag>보관</Tag>
                  </span>
                  <PillButton tone="gray" name="op" value="restore" label={`${c.name} 다시 꺼내기`}>
                    다시 꺼내기
                  </PillButton>
                </form>
              ))}
            </section>
          ) : null}
        </div>

        <section aria-labelledby="cls-h" className={cardClass}>
          {sel === null ? (
            <EmptyNote>아직 반이 없어요. 왼쪽에서 반을 만들어 주세요.</EmptyNote>
          ) : (
            <>
              <div className="flex flex-col gap-3 px-4 pt-4 pb-3 lg:px-[22px] lg:pt-[18px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 id="cls-h" className="m-0 grow text-[20px] font-extrabold tracking-[-0.02em]">
                    {current ? current.name : "반 없는 아이"}
                    {current?.archived ? (
                      <span className="ml-2 align-middle">
                        <Tag>보관</Tag>
                      </span>
                    ) : null}
                  </h2>
                  {current && !current.archived ? (
                    <form action={classOpAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="id" value={current.id} />
                      {index > 0 ? (
                        <PillButton tone="gray" name="op" value="up" label={`${current.name} 목록에서 위로`}>
                          위로
                        </PillButton>
                      ) : null}
                      {index < open.length - 1 ? (
                        <PillButton tone="gray" name="op" value="down" label={`${current.name} 목록에서 아래로`}>
                          아래로
                        </PillButton>
                      ) : null}
                      <ConfirmPill name="op" value="archive" message={`${current.name}을(를) 보관할까요? 목록에서 사라져요.`} label={`${current.name} 보관`}>
                        보관
                      </ConfirmPill>
                    </form>
                  ) : null}
                </div>
                <p className="m-0 text-[13.5px] text-sub">
                  {current ? (
                    <>
                      아이 {kids.length}명 · 담임 {teachersOf(current.id).join(", ") || "없음"}{" "}
                      <Link href="/staff/admin/staff" className="font-semibold text-staff">
                        담임은 교사·권한에서 정해요
                      </Link>
                    </>
                  ) : (
                    "새로 가입했거나 반에서 빠진 아이예요. 골라서 반으로 옮겨 주세요."
                  )}
                </p>
                {current ? (
                  <form action={classSaveAction} className="flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="id" value={current.id} />
                    <span className="flex min-w-0 grow basis-[160px] lg:max-w-[280px]">
                      <input name="name" required maxLength={20} defaultValue={current.name} aria-label="반 이름" className={inputBoxClass()} />
                    </span>
                    <GradeSelect id={`g-${current.id}`} value={current.grade} label={`${current.name} 학년`} />
                    <PillButton tone="gray" label={`${current.name} 이름과 학년 저장`}>
                      이름 저장
                    </PillButton>
                  </form>
                ) : null}
              </div>

              {kids.length === 0 ? (
                <div className="border-t border-line lg:border-[#eef0f4]">
                  <EmptyNote>{current ? "이 반에는 아직 아이가 없어요." : "반 없는 아이가 없어요."}</EmptyNote>
                </div>
              ) : (
                <form action={childrenMoveAction} className="flex flex-col">
                  <input type="hidden" name="from" value={sel} />
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-line bg-staff-tint px-4 py-2.5 lg:border-[#eef0f4] lg:px-[22px]">
                    <span className="text-[14.5px] font-bold text-staff">고른 아이를</span>
                    <label htmlFor="mv-to" className="sr-only">
                      옮길 반
                    </label>
                    <span className="flex w-[150px]">
                      <select id="mv-to" name="to" required defaultValue="" className={selectBoxClass()}>
                        <option value="" disabled>
                          반 고르기
                        </option>
                        {targets.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span className="text-[14.5px] font-semibold text-ink2">으로</span>
                    <button type="submit" className={barButtonClass("solid")}>
                      옮기기
                    </button>
                    {moveError ? <ErrorText>{moveError}</ErrorText> : null}
                  </div>
                  <div className="overflow-x-auto">
                    <table className={tableClass}>
                      <thead>
                        <tr>
                          <th scope="col" className={`${thClass()} w-12`}>
                            <span className="sr-only">고르기</span>
                          </th>
                          <th scope="col" className={thClass()}>
                            이름
                          </th>
                          <th scope="col" className={thClass()}>
                            최근 4주 출석
                          </th>
                          <th scope="col" className={thClass()}>
                            앱 가입
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {kids.map((k) => {
                          const st = stats.get(k.id);
                          return (
                            <tr key={k.id} className={`${rowClass} has-[:checked]:bg-staff-tint/60`}>
                              <td className={tdClass({ tight: true })}>
                                <label className="grid h-11 w-11 cursor-pointer place-items-center">
                                  <input type="checkbox" name="child_ids" value={k.id} aria-label={`${k.name} 고르기`} className="h-[18px] w-[18px] cursor-pointer accent-staff" />
                                </label>
                              </td>
                              <td className={tdClass()}>
                                <span className="flex items-center gap-3">
                                  <TreeAvatar level={st ? st.level : null} photo={k.photo_url} size={36} />
                                  <span className="flex min-w-0 flex-col leading-[1.35]">
                                    <Link href={`/staff/children/${k.id}`} className="inline-flex min-h-11 items-center font-semibold text-ink no-underline hover:underline lg:min-h-0">
                                      {k.name}
                                    </Link>
                                    <span className="text-[13px] text-mute">{st?.school ?? "학교 미입력"}</span>
                                  </span>
                                </span>
                              </td>
                              <td className={tdClass()}>{st ? <AttendanceDots st={st} /> : <span className="text-faint">–</span>}</td>
                              <td className={tdClass()}>{k.notOnboarded ? <Tag tone="warn">가입 전</Tag> : <Tag>가입함</Tag>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 lg:border-[#f1f3f6] lg:px-[22px]">
                    <AttendanceLegend />
                    <Small>반을 옮겨도 아이의 물방울과 나무는 그대로예요. 전에 쓴 고민은 그때의 담임 선생님에게만 보여요.</Small>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </AdminPage>
  );
}
