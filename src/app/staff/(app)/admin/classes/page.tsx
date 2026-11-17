import { Empty, Flash, H2, Note, SmallButton, SubHeader, selectClass } from "@/components/staff/ui";
import { AutoForm, ConfirmButton } from "@/components/staff/widgets";
import { inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { childrenMoveAction, classOpAction, classSaveAction } from "@/lib/staff/actions-admin";
import { adminClasses } from "@/lib/staff/admin-misc";
import { listChildren } from "@/lib/staff/children";
import { toInt } from "@/lib/staff/util";

export const metadata = { title: "반 관리 · 꿈의숲키우기" };

const smallInput = "h-11 min-w-0 rounded-[10px] border-[1.5px] border-[#D1D6DB] bg-white px-3 text-[15px] text-ink outline-none focus:border-navy";

function GradeSelect({ id, value }: { id: string; value: number | null }) {
  return (
    <select id={id} name="grade" defaultValue={value ?? ""} aria-label="학년" className={`${smallInput} w-[96px] shrink-0 px-2`}>
      <option value="">학년 없음</option>
      {[1, 2, 3, 4, 5, 6].map((g) => (
        <option key={g} value={g}>
          {g}학년
        </option>
      ))}
    </select>
  );
}

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
    <>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="반" />
      <Flash ok={sp.ok} error={sp.error} />
      <section className="flex flex-col px-4">
        <ul className="m-0 flex list-none flex-col p-0">
          {open.map((c, i) => (
            <li key={c.id} className="flex flex-col border-b border-line py-2">
              <form action={classSaveAction} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={c.id} />
                <input name="name" required maxLength={20} defaultValue={c.name} aria-label={`${c.name} 반 이름`} className={`${smallInput} grow`} />
                <GradeSelect id={`g-${c.id}`} value={c.grade} />
                <SmallButton tone="gray" label={`${c.name} 이름 저장`}>
                  저장
                </SmallButton>
              </form>
              <form action={classOpAction} className="flex items-center gap-[5px]">
                <input type="hidden" name="id" value={c.id} />
                <span className="grow text-[13px] text-mute">아이 {c.children}명</span>
                {i > 0 ? (
                  <SmallButton tone="gray" name="op" value="up" label={`${c.name} 위로`}>
                    위로
                  </SmallButton>
                ) : null}
                {i < open.length - 1 ? (
                  <SmallButton tone="gray" name="op" value="down" label={`${c.name} 아래로`}>
                    아래로
                  </SmallButton>
                ) : null}
                <ConfirmButton name="op" value="archive" message={`${c.name}을(를) 보관할까요? 목록에서 사라져요.`}>
                  <span className="flex h-[30px] min-w-[46px] items-center justify-center rounded-md bg-fill px-2 text-[12px] font-semibold text-sub">보관</span>
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
        {open.length === 0 ? <Empty>아직 반이 없어요.</Empty> : null}
        <form action={classSaveAction} className="flex items-center gap-1.5 pt-3">
          <input name="name" required maxLength={20} placeholder="새 반 이름 (예: 5학년 3반)" aria-label="새 반 이름" className={`${smallInput} grow`} />
          <GradeSelect id="g-new" value={null} />
          <SmallButton label="반 만들기">추가</SmallButton>
        </form>
      </section>

      {archived.length > 0 ? (
        <section className="flex flex-col px-4">
          <H2>보관한 반</H2>
          {archived.map((c) => (
            <form key={c.id} action={classOpAction} className="flex min-h-11 items-center justify-between border-b border-line">
              <input type="hidden" name="id" value={c.id} />
              <span className="text-[15px] font-semibold text-sub">{c.name}</span>
              <SmallButton tone="gray" name="op" value="restore" width={60} label={`${c.name} 다시 꺼내기`}>
                다시 꺼내기
              </SmallButton>
            </form>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col px-4 pb-6">
        <H2>아이들 반 옮기기</H2>
        <Note>새 학년에 반을 바꿀 때 써요. 옮겨도 전에 쓴 고민은 그때의 담임 선생님에게만 보여요.</Note>
        <AutoForm className="flex flex-col gap-1.5 pt-2">
          <label htmlFor="mv-from" className={labelClass}>
            지금 반
          </label>
          <select id="mv-from" name="from" defaultValue={from ?? ""} className={selectClass}>
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
          </select>
        </AutoForm>
        {from !== null ? (
          kids.length === 0 ? (
            <Empty>이 반에는 아이가 없어요.</Empty>
          ) : (
            <form action={childrenMoveAction} className="flex flex-col gap-2 pt-2">
              <input type="hidden" name="from" value={from} />
              <fieldset className="m-0 flex flex-col border-0 p-0">
                <legend className={`p-0 ${labelClass}`}>옮길 아이 ({kids.length}명, 모두 골라 두었어요)</legend>
                <div className="grid grid-cols-2 gap-x-2">
                  {kids.map((k) => (
                    <label key={k.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold text-ink2">
                      <input type="checkbox" name="child_ids" value={k.id} defaultChecked className="h-5 w-5 shrink-0 accent-navy" />
                      {k.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label htmlFor="mv-to" className={labelClass}>
                옮길 반
              </label>
              <select id="mv-to" name="to" required defaultValue="" className={`${inputClass} appearance-auto`}>
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
              </select>
              <button type="submit" className={`${primaryButtonClass} mt-1 cursor-pointer`}>
                고른 아이 옮기기
              </button>
            </form>
          )
        ) : null}
      </section>
    </>
  );
}
