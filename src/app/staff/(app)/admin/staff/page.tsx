import Link from "next/link";
import { Chips, Face, Flash, H2, SubHeader, TextField } from "@/components/staff/ui";
import { Row, primaryButtonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { staffCreateAction } from "@/lib/staff/actions-admin";
import { listStaff } from "@/lib/staff/admin-staff";
import { ROLE_NAMES, type Role } from "@/lib/types";

export const metadata = { title: "교사 권한 · 꿈의숲키우기" };

const ROLE_OPTIONS = (Object.keys(ROLE_NAMES) as Role[]).map((r) => ({ value: r, label: ROLE_NAMES[r] }));

export default async function StaffAdminPage({ searchParams }: PageProps<"/staff/admin/staff">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const staff = (await listStaff(me)) ?? [];
  return (
    <>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="교사 권한" />
      <Flash ok={sp.ok} error={sp.error} />
      <ul className="m-0 flex list-none flex-col px-4 py-0">
        {staff.map((s, i) => {
          const scope = s.role === "admin" || s.role === "head" ? "전체 반" : s.class_names.length > 0 ? `${s.class_names.join(", ")}${s.role === "homeroom" ? " 담임" : ""}` : "담당 반 없음";
          const state = !s.active ? " · 로그인 꺼짐" : !s.linked ? " · 초대 링크 보내야 해요" : "";
          return (
            <li key={s.id}>
              <Link href={`/staff/admin/staff/${s.id}`} className={`block text-inherit no-underline ${s.active ? "" : "opacity-60"}`}>
                <Row
                  last={i === staff.length - 1}
                  left={<Face name={s.name} id={s.id} />}
                  title={`${s.name}${s.id === me.id ? " (나)" : ""}`}
                  sub={scope + state}
                  right={<span className={`flex h-[30px] shrink-0 items-center rounded-md px-2.5 text-[12px] font-semibold ${s.role === "basic" ? "bg-fill text-sub" : "bg-navy text-white"}`}>{ROLE_NAMES[s.role]}</span>}
                />
              </Link>
            </li>
          );
        })}
      </ul>
      <section className="flex flex-col px-4 pb-6">
        <H2>선생님 추가</H2>
        <form action={staffCreateAction} className="flex flex-col gap-2.5 rounded-2xl bg-fill p-4">
          <TextField label="이름" name="name" required maxLength={20} />
          <Chips legend="등급" name="role" value="homeroom" options={ROLE_OPTIONS} onWhite />
          <button type="submit" className={`${primaryButtonClass} cursor-pointer`}>
            추가하고 초대 링크 만들기
          </button>
          <p className="m-0 text-[12px] leading-[18px] text-mute">추가한 다음 초대 링크를 선생님께 보내 주세요. 링크로 들어와 카카오로 한 번 로그인하면 연결돼요.</p>
        </form>
      </section>
    </>
  );
}
