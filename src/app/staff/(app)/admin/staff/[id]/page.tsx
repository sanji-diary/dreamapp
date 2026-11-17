import { notFound } from "next/navigation";
import { Small } from "@/components/staff/admin-kit";
import { CopyLine } from "@/components/staff/admin-widgets";
import { Box, FlashNote, Page, PageHeader, Tag, TeacherAvatar, barButtonClass } from "@/components/staff/kit";
import { StaffForm } from "@/components/staff/StaffForm";
import { ConfirmButton } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { ROLE_PRESETS } from "@/lib/authz";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { staffInviteAction } from "@/lib/staff/actions-admin";
import { getStaffRow } from "@/lib/staff/admin-staff";
import { publicOrigin } from "@/lib/staff/origin";
import { toInt } from "@/lib/staff/util";
import { ROLE_NAMES, type Role } from "@/lib/types";

export const metadata = { title: "교사·권한 · 꿈의숲키우기" };

export default async function StaffDetailPage({ params, searchParams }: PageProps<"/staff/admin/staff/[id]">) {
  const me = await requireAdmin();
  const id = toInt((await params).id);
  const sp = await searchParams;
  const s = id === null ? null : await getStaffRow(me, id);
  if (!s) notFound();
  const classes = await listClasses(db);
  const origin = await publicOrigin();

  return (
    <Page>
      <PageHeader back="/staff/admin/staff" backLabel="교사 목록으로 돌아가기" title={`${s.name} 선생님`} />
      <FlashNote ok={sp.ok} error={sp.error} />
      {/* A form page: one column until the sidebar appears, then the form with the sign-in box at its right. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_304px]">
        {/* The sign-in box comes first on phones and sits at the right on wide screens. */}
        <Box className="lg:col-start-2 lg:row-start-1 max-[339px]:p-3.5">
          <div className="flex items-center gap-3">
            <TeacherAvatar name={s.name} size="m" onWhite />
            <div className="flex min-w-0 flex-col items-start gap-1">
              <b className="text-[16px] tracking-[-0.02em]">{s.linked ? "카카오 연결됨" : "초대 링크"}</b>
              <Tag tone={!s.active ? "danger" : s.linked ? "navy" : "warn"} onWhite>
                {!s.active ? "로그인 꺼짐" : s.linked ? "로그인할 수 있어요" : "아직 연결 전"}
              </Tag>
            </div>
          </div>
          {s.invite_code ? (
            <>
              <CopyLine label="초대 링크" value={`${origin}/staff/login?invite=${s.invite_code}`} />
              <Small>이 링크는 한 번만 쓸 수 있어요. 선생님 본인에게만 보내 주세요.</Small>
            </>
          ) : s.linked ? (
            <p className="m-0 text-[13px] leading-[19px] text-sub">이미 카카오 계정과 연결돼 있어요. 계정을 바꿔야 하면 초대 링크를 다시 만들어 주세요.</p>
          ) : (
            <p className="m-0 text-[13px] leading-[19px] text-sub">아직 초대 링크가 없어요. 링크를 만들어서 선생님께 보내 주세요.</p>
          )}
          {s.id !== me.id ? (
            <form action={staffInviteAction} className="flex">
              <input type="hidden" name="id" value={s.id} />
              <ConfirmButton message={s.linked ? "지금 연결된 카카오 계정은 끊기고 새 링크로 다시 로그인해야 해요. 계속할까요?" : s.invite_code ? "전에 보낸 링크는 못 쓰게 돼요. 새로 만들까요?" : "초대 링크를 만들까요?"} className={barButtonClass("white")}>
                {s.linked || s.invite_code ? "초대 링크 다시 만들기" : "초대 링크 만들기"}
              </ConfirmButton>
            </form>
          ) : null}
        </Box>
        <div className="flex min-w-0 flex-col lg:col-start-1 lg:row-start-1 lg:max-w-[640px]">
          <StaffForm
            id={s.id}
            name={s.name}
            isSelf={s.id === me.id}
            initial={{ role: s.role, class_ids: s.class_ids, active: s.active, can_attendance: s.can_attendance, can_visits: s.can_visits, can_approve: s.can_approve, can_view_all: s.can_view_all, can_read_pastor_worries: s.can_read_pastor_worries }}
            roles={(Object.keys(ROLE_NAMES) as Role[]).map((r) => ({ value: r, label: ROLE_NAMES[r] }))}
            presets={ROLE_PRESETS}
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            error={typeof sp.error === "string" ? sp.error : undefined}
          />
        </div>
      </div>
    </Page>
  );
}
