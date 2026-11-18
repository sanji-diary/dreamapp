import Link from "next/link";
import { AdminHeader, AdminPage, Small, rowClass, tableClass, tdClass, thClass } from "@/components/staff/admin-kit";
import { CopyButton } from "@/components/staff/admin-widgets";
import { CancelLink, ChoiceChips, FormSection, SubmitButton, SwitchSubmit, TextInput, errorFor } from "@/components/staff/form-kit";
import { BarLink, Card, Chevron, FlashNote, List, ListRow, RoundLink, Tag, TeacherAvatar, type TagTone } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { staffCreateAction, staffSwitchAction } from "@/lib/staff/actions-admin";
import { listStaff, type StaffRow, type SwitchKey } from "@/lib/staff/admin-staff";
import { publicOrigin } from "@/lib/staff/origin";
import { ROLE_NAMES, type Role } from "@/lib/types";

export const metadata = { title: "교사·권한 · 꿈의숲키우기" };

const ROLE_OPTIONS = (Object.keys(ROLE_NAMES) as Role[]).map((r) => ({ value: r, label: ROLE_NAMES[r] }));
const ROLE_TONE: Record<Role, TagTone> = { admin: "navy", head: "blue", homeroom: "gray", basic: "gray" };

/** The five switches, in the mock's order and words. */
const SWITCHES: { key: SwitchKey; label: string }[] = [
  { key: "can_attendance", label: "출석 체크" },
  { key: "can_visits", label: "심방 기록" },
  { key: "can_approve", label: "미션 확인" },
  { key: "can_view_all", label: "모든 반 보기" },
  { key: "can_read_pastor_worries", label: "전도사님 고민 읽기" },
];

const scopeText = (s: StaffRow) => (s.role === "admin" || s.role === "head" ? "전체" : s.class_names.length > 0 ? s.class_names.join(", ") : "없음");

export default async function StaffAdminPage({ searchParams }: PageProps<"/staff/admin/staff">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const [staff, origin] = await Promise.all([listStaff(me).then((l) => l ?? []), publicOrigin()]);
  const adding = sp.new === "1";
  const invite = (s: StaffRow) => `${origin}/staff/login?invite=${s.invite_code}`;

  return (
    <AdminPage>
      <AdminHeader
        title="교사·권한"
        count={`${staff.length}명`}
        phoneRight={<RoundLink href="/staff/admin/staff?new=1" label="교사 초대하기" icon="plus" />}
        wideRight={
          <BarLink href="/staff/admin/staff?new=1" tone="solid">
            + 교사 초대하기
          </BarLink>
        }
      />
      <FlashNote ok={sp.ok} error={sp.error} />

      {adding ? (
        <FormSection box title="교사 초대하기" className="md:max-w-[520px]">
          <form action={staffCreateAction} className="flex flex-col gap-3">
            <TextInput label="이름" name="name" id="new-name" required maxLength={20} error={errorFor(sp.error, /이름/)} />
            <ChoiceChips legend="역할" name="role" value="homeroom" options={ROLE_OPTIONS} onGray error={errorFor(sp.error, /등급|역할/)} hint="역할을 고르면 할 수 있는 일이 기본값으로 맞춰져요. 만든 뒤에 사람마다 바꿀 수 있어요." />
            <div className="flex gap-2.5 max-[359px]:gap-2">
              <div className="min-w-0 flex-1">
                <CancelLink href="/staff/admin/staff" onGray>
                  그만두기
                </CancelLink>
              </div>
              <div className="min-w-0 flex-[1.3] max-[359px]:flex-1">
                <SubmitButton>초대 링크 만들기</SubmitButton>
              </div>
            </div>
          </form>
          <Small>만든 다음 초대 링크를 선생님께 보내 주세요. 링크로 들어와 카카오로 한 번 로그인하면 연결돼요.</Small>
        </FormSection>
      ) : null}

      {/* Below 848px: one row per teacher; the switches are on the teacher's own page. */}
      <div className="min-[53rem]:hidden">
        <List>
          {staff.map((s) => (
            <div key={s.id} className={`border-b border-line last:border-b-0 ${s.active ? "" : "opacity-60"}`}>
              <ListRow
                href={`/staff/admin/staff/${s.id}`}
                left={<TeacherAvatar name={s.name} size="m" />}
                title={
                  <>
                    {s.name}
                    {s.id === me.id ? <span className="font-medium text-mute"> (나)</span> : null}
                    <span className="ml-1.5 align-[2px]">
                      <Tag tone={ROLE_TONE[s.role]}>{ROLE_NAMES[s.role]}</Tag>
                    </span>
                  </>
                }
                sub={
                  <>
                    담당 반 {scopeText(s)} · {!s.active ? "로그인 꺼짐" : s.linked ? "카카오 연결됨" : s.invite_code ? <b className="text-warn">초대 보냄 · 아직 연결 전</b> : "아직 연결 전"}
                  </>
                }
                right={<Chevron />}
              />
            </div>
          ))}
        </List>
      </div>

      {/* From 848px (53rem, wide enough for nine columns): the mock's table. Each switch saves by itself. */}
      <div className="hidden min-[53rem]:block">
        <Card className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass()}>
                  이름
                </th>
                <th scope="col" className={thClass()}>
                  역할
                </th>
                <th scope="col" className={thClass()}>
                  담당 반
                </th>
                {SWITCHES.map((w) => (
                  <th key={w.key} scope="col" className={thClass({ center: true, wrap: true })}>
                    {w.label}
                  </th>
                ))}
                <th scope="col" className={thClass()}>
                  상태
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const td = (tight = false, center = false) => tdClass({ tight, center, dim: !s.active });
                return (
                  <tr key={s.id} className={rowClass}>
                    <td className={td()}>
                      <Link href={`/staff/admin/staff/${s.id}`} className="group flex items-center gap-2 text-ink no-underline outline-none">
                        <TeacherAvatar name={s.name} />
                        <b className="whitespace-nowrap group-hover:underline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-staff">
                          {s.name}
                          {s.id === me.id ? <span className="font-medium text-mute"> (나)</span> : null}
                        </b>
                      </Link>
                    </td>
                    <td className={td()}>
                      <Tag tone={ROLE_TONE[s.role]}>{ROLE_NAMES[s.role]}</Tag>
                    </td>
                    <td className={td()}>{scopeText(s)}</td>
                    {SWITCHES.map((w) => (
                      <td key={w.key} className={td(true, true)}>
                        <form action={staffSwitchAction} className="inline-flex">
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="key" value={w.key} />
                          <input type="hidden" name="value" value={s[w.key] ? "off" : "on"} />
                          <SwitchSubmit small on={s[w.key]} label={`${s.name} ${w.label}`} />
                        </form>
                      </td>
                    ))}
                    <td className={td(true)}>
                      {!s.active ? (
                        <Tag tone="danger">로그인 꺼짐</Tag>
                      ) : s.linked ? (
                        <span className="whitespace-nowrap">카카오 연결됨</span>
                      ) : s.invite_code ? (
                        <CopyButton value={invite(s)} label={`${s.name} 초대 링크 복사`} className="inline-block rounded-md bg-warn-tint px-[7px] py-[3px] text-[11.5px] leading-[1.3] font-bold whitespace-nowrap text-warn">
                          초대 보냄 · 링크 복사
                        </CopyButton>
                      ) : (
                        <Tag>아직 연결 전</Tag>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Small className="p-2.5">역할을 고르면 스위치가 기본값으로 맞춰지고, 필요하면 사람마다 따로 켜고 끌 수 있어요. 역할과 담당 반은 이름을 눌러서 바꿔요. 교사 기본은 스위치를 켜도 이름·사진·반만 볼 수 있어요.</Small>
        </Card>
      </div>
      <Small className="min-[53rem]:hidden">이름을 누르면 역할, 담당 반, 할 수 있는 일을 바꿀 수 있어요.</Small>
    </AdminPage>
  );
}
