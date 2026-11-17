import { AdminHeader, AdminPage, ConfirmPill, Small, splitClass } from "@/components/staff/admin-kit";
import { AutoGet } from "@/components/staff/admin-widgets";
import { Checkbox, ErrorText, FormSection, SelectInput, SubmitButton, errorFor, inputBoxClass, selectBoxClass } from "@/components/staff/form-kit";
import { EmptyNote, FlashNote, PillButton, SectionHead, Tag } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { childrenMoveAction, classOpAction, classSaveAction } from "@/lib/staff/actions-admin";
import { adminClasses } from "@/lib/staff/admin-misc";
import { listChildren } from "@/lib/staff/children";
import { toInt } from "@/lib/staff/util";

export const metadata = { title: "반 편성 · 꿈의숲키우기" };

function GradeSelect({ id, value, label }: { id: string; value: number | null; label: string }) {
  return (
    <span className="flex w-[104px] shrink-0 max-[359px]:w-auto max-[359px]:grow">
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

/** Name box, grade picker and a button on one line; on a narrow phone the name takes a line of its own. */
const lineClass = "flex flex-wrap items-center gap-1.5";
const nameClass = "flex min-w-0 grow basis-[140px] max-[359px]:basis-full";

export default async function ClassesAdminPage({ searchParams }: PageProps<"/staff/admin/classes">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const classes = (await adminClasses(staff)) ?? [];
  const open = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);
  const from = sp.from === "none" ? "none" : toInt(sp.from);
  const all = await listChildren(staff);
  const kids = from === null ? [] : all.filter((k) => (from === "none" ? k.class_id === null : k.class_id === from));
  const noClass = all.filter((k) => k.class_id === null).length;

  return (
    <AdminPage>
      <AdminHeader title="반 편성" count={`${open.length}개 반`} />
      <FlashNote ok={sp.ok} error={sp.error} />
      <div className={splitClass}>
        <div className="flex min-w-0 flex-col gap-3.5">
          <section className="flex flex-col md:rounded-[20px] md:border md:border-line md:px-4 md:py-1.5">
            <ul className="m-0 flex list-none flex-col p-0">
              {open.map((c, i) => (
                <li key={c.id} className="flex flex-col gap-0.5 border-b border-line py-2.5">
                  <form action={classSaveAction} className={lineClass}>
                    <input type="hidden" name="id" value={c.id} />
                    <span className={nameClass}>
                      <input name="name" required maxLength={20} defaultValue={c.name} aria-label={`${c.name} 반 이름`} className={inputBoxClass()} />
                    </span>
                    <GradeSelect id={`g-${c.id}`} value={c.grade} label={`${c.name} 학년`} />
                    <PillButton tone="gray" label={`${c.name} 이름과 학년 저장`}>
                      저장
                    </PillButton>
                  </form>
                  <form action={classOpAction} className="flex flex-wrap items-center gap-x-1.5">
                    <input type="hidden" name="id" value={c.id} />
                    <span className="min-w-0 grow text-[13px] text-mute">아이 {c.children}명</span>
                    {i > 0 ? (
                      <PillButton tone="gray" name="op" value="up" label={`${c.name} 위로 옮기기`}>
                        위로
                      </PillButton>
                    ) : null}
                    {i < open.length - 1 ? (
                      <PillButton tone="gray" name="op" value="down" label={`${c.name} 아래로 옮기기`}>
                        아래로
                      </PillButton>
                    ) : null}
                    <ConfirmPill name="op" value="archive" message={`${c.name}을(를) 보관할까요? 목록에서 사라져요.`} label={`${c.name} 보관`}>
                      보관
                    </ConfirmPill>
                  </form>
                </li>
              ))}
            </ul>
            {open.length === 0 ? <EmptyNote>아직 반이 없어요.</EmptyNote> : null}
            <form action={classSaveAction} className={`${lineClass} py-3`}>
              <span className={nameClass}>
                <input name="name" required maxLength={20} placeholder="새 반 이름 (예: 5학년 3반)" aria-label="새 반 이름" className={inputBoxClass()} />
              </span>
              <GradeSelect id="g-new" value={null} label="새 반 학년" />
              <PillButton label="반 만들기">추가</PillButton>
            </form>
          </section>

          {archived.length > 0 ? (
            <section className="flex flex-col">
              <SectionHead note="아이들에게 보이지 않아요">보관한 반</SectionHead>
              {archived.map((c) => (
                <form key={c.id} action={classOpAction} className="flex min-h-11 items-center gap-2 border-b border-line last:border-b-0">
                  <input type="hidden" name="id" value={c.id} />
                  <span className="flex min-w-0 grow flex-wrap items-center gap-1.5 text-[15px] font-semibold text-sub">
                    {c.name}
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

        <div id="move" className="scroll-mt-4">
          <FormSection box title="아이들 반 옮기기">
            <Small>새 학년에 반을 바꿀 때 써요. 옮겨도 전에 쓴 고민은 그때의 담임 선생님에게만 보여요.</Small>
            <AutoGet action="/staff/admin/classes#move" className="flex flex-col">
              <SelectInput label="지금 반" name="from" id="mv-from" defaultValue={from ?? ""}>
                <option value="">반을 골라 주세요</option>
                {open.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.children}명)
                  </option>
                ))}
                {archived.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (보관)
                  </option>
                ))}
                <option value="none">반 없음 ({noClass}명)</option>
              </SelectInput>
            </AutoGet>
            {from !== null ? (
              kids.length === 0 ? (
                <EmptyNote>이 반에는 아이가 없어요.</EmptyNote>
              ) : (
                <form action={childrenMoveAction} className="flex flex-col gap-3">
                  <input type="hidden" name="from" value={from} />
                  <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="px-0 pt-0 pb-1 text-[13px] leading-[1.4] font-semibold text-ink2">옮길 아이 ({kids.length}명, 모두 골라 두었어요)</legend>
                    <div className="grid grid-cols-2 gap-x-2 max-[339px]:grid-cols-1 lg:grid-cols-2">
                      {kids.map((k) => (
                        <Checkbox key={k.id} name="child_ids" value={k.id} defaultChecked label={k.name} />
                      ))}
                    </div>
                    {errorFor(sp.error, /옮길 아이/) ? <ErrorText>{errorFor(sp.error, /옮길 아이/)}</ErrorText> : null}
                  </fieldset>
                  <SelectInput label="옮길 반" name="to" id="mv-to" required defaultValue="" error={errorFor(sp.error, /옮길 반|반을 찾을/)}>
                    <option value="" disabled>
                      반을 골라 주세요
                    </option>
                    {open
                      .filter((c) => c.id !== from)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </SelectInput>
                  <SubmitButton>고른 아이 옮기기</SubmitButton>
                </form>
              )
            ) : null}
          </FormSection>
        </div>
      </div>
    </AdminPage>
  );
}
