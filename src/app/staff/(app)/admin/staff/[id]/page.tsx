import { notFound } from "next/navigation";
import { StaffForm } from "@/components/staff/StaffForm";
import { Flash, SubHeader } from "@/components/staff/ui";
import { ConfirmButton, CopyField } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { ROLE_PRESETS } from "@/lib/authz";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { staffInviteAction } from "@/lib/staff/actions-admin";
import { getStaffRow } from "@/lib/staff/admin-staff";
import { publicOrigin } from "@/lib/staff/origin";
import { toInt } from "@/lib/staff/util";
import { ROLE_NAMES, type Role } from "@/lib/types";

export const metadata = { title: "교사 권한 · 꿈의숲키우기" };

export default async function StaffDetailPage({ params, searchParams }: PageProps<"/staff/admin/staff/[id]">) {
  const me = await requireAdmin();
  const id = toInt((await params).id);
  const sp = await searchParams;
  const s = id === null ? null : await getStaffRow(me, id);
  if (!s) notFound();
  const classes = await listClasses(db);
  const origin = await publicOrigin();

  return (
    <>
      <SubHeader back="/staff/admin/staff" backLabel="교사 목록으로 돌아가기" title={`${s.name} 선생님`} />
      <Flash ok={sp.ok} error={sp.error} />
      <section className="mx-4 mt-2 flex flex-col gap-2 rounded-2xl bg-fill p-4">
        <h2 className="m-0 text-[15px] font-bold text-ink2">{s.linked ? "카카오 로그인 연결됨" : "초대 링크"}</h2>
        {s.invite_code ? (
          <>
            <CopyField label="초대 링크" value={`${origin}/staff/login?invite=${s.invite_code}`} />
            <p className="m-0 text-[12px] leading-[18px] text-mute">이 링크는 한 번만 쓸 수 있어요. 선생님 본인에게만 보내 주세요.</p>
          </>
        ) : (
          <p className="m-0 text-[13px] leading-[19px] text-sub">이미 카카오 계정과 연결돼 있어요. 계정을 바꿔야 하면 초대 링크를 다시 만들어 주세요.</p>
        )}
        {s.id !== me.id ? (
          <form action={staffInviteAction}>
            <input type="hidden" name="id" value={s.id} />
            <ConfirmButton message={s.linked ? "지금 연결된 카카오 계정은 끊기고 새 링크로 다시 로그인해야 해요. 계속할까요?" : "전에 보낸 링크는 못 쓰게 돼요. 새로 만들까요?"} className="flex h-11 cursor-pointer items-center border-0 bg-transparent p-0">
              <span className="flex h-[30px] items-center rounded-md bg-white px-2.5 text-[12px] font-semibold text-sub">초대 링크 다시 만들기</span>
            </ConfirmButton>
          </form>
        ) : null}
      </section>
      <StaffForm
        id={s.id}
        name={s.name}
        isSelf={s.id === me.id}
        initial={{ role: s.role, class_ids: s.class_ids, active: s.active, can_attendance: s.can_attendance, can_visits: s.can_visits, can_approve: s.can_approve, can_view_all: s.can_view_all, can_read_pastor_worries: s.can_read_pastor_worries }}
        roles={(Object.keys(ROLE_NAMES) as Role[]).map((r) => ({ value: r, label: ROLE_NAMES[r] }))}
        presets={ROLE_PRESETS}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      />
    </>
  );
}
