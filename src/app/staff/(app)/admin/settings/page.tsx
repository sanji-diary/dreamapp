import { AdminHeader } from "@/components/staff/admin-kit";
import { FieldGroup, FormSection, SaveBar, SubmitButton, TextInput, errorFor, fieldLabelClass, inputBoxClass } from "@/components/staff/form-kit";
import { FlashNote, Page } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { settingsSaveAction } from "@/lib/staff/actions-admin";
import { adminSettings } from "@/lib/staff/admin-misc";
import { LEVEL_NAMES } from "@/lib/types";

export const metadata = { title: "설정 · 꿈의숲키우기" };

export default async function SettingsPage({ searchParams }: PageProps<"/staff/admin/settings">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const s = await adminSettings(staff);
  if (!s) return null;
  const total = s.levelNeeds.reduce((a, b) => a + b, 0);
  const levelError = errorFor(sp.error, /단계별/);
  return (
    <Page narrow>
      <AdminHeader title="설정" />
      <FlashNote ok={sp.ok} error={sp.error} />
      <form action={settingsSaveAction} className="flex grow flex-col gap-5">
        <FormSection title="물방울">
          <TextInput
            label="한 주에 받을 수 있는 물방울"
            name="weekly_drop_cap"
            id="set-cap"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            required
            defaultValue={s.weeklyDropCap}
            hint="미션으로 한 주에 모을 수 있는 물방울 수예요. 미션 화면에서 이번 주 합계와 견주어 볼 수 있어요."
            error={errorFor(sp.error, /주간 물방울/)}
          />
          <TextInput label="반 목표 물방울" name="class_goal" id="set-goal" type="number" inputMode="numeric" min={1} max={10000} required defaultValue={s.classGoal} hint="반 아이들이 함께 모으는 목표 물방울 수예요." error={errorFor(sp.error, /반 목표/)} />
        </FormSection>
        <FormSection title="나무">
          <FieldGroup legend="나무 단계별로 필요한 물방울" error={levelError} hint={`지금은 나무 한 그루에 물방울 ${total}개가 필요해요. 바꾸면 자라는 중인 나무에도 바로 적용돼요.`}>
            <div className="grid grid-cols-3 gap-2 max-[339px]:grid-cols-2">
              {LEVEL_NAMES.map((name, i) => (
                <label key={name} className="flex min-w-0 flex-col gap-1.5">
                  <span className={fieldLabelClass}>
                    {i + 1}. {name}
                  </span>
                  <input name={`level_${i + 1}`} type="number" inputMode="numeric" min={1} max={100} required defaultValue={s.levelNeeds[i]} aria-invalid={levelError ? true : undefined} className={inputBoxClass(Boolean(levelError))} />
                </label>
              ))}
            </div>
          </FieldGroup>
          <TextInput label="열매 수확 보너스 포인트" name="harvest_bonus_points" id="set-bonus" type="number" inputMode="numeric" min={0} max={10000} required defaultValue={s.harvestBonusPoints} hint="열매를 수확할 때 아이가 받는 포인트예요." error={errorFor(sp.error, /수확 보너스/)} />
        </FormSection>
        <SaveBar>
          <SubmitButton>설정 저장하기</SubmitButton>
        </SaveBar>
      </form>
    </Page>
  );
}
