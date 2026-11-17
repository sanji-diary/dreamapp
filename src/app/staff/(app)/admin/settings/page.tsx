import { Flash, Note, SubHeader, TextField } from "@/components/staff/ui";
import { inputClass, labelClass, primaryButtonClass } from "@/components/ui";
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
  return (
    <>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="설정" />
      <Flash ok={sp.ok} error={sp.error} />
      <form action={settingsSaveAction} className="flex flex-col gap-3.5 px-4 pt-2 pb-6">
        <TextField label="한 주에 받을 수 있는 물방울" name="weekly_drop_cap" type="number" inputMode="numeric" min={1} max={100} required defaultValue={s.weeklyDropCap} hint="미션으로 한 주에 모을 수 있는 물방울 수예요." />
        <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
          <legend className={`p-0 ${labelClass}`}>나무 단계별로 필요한 물방울</legend>
          <div className="grid grid-cols-3 gap-2 pt-1.5">
            {LEVEL_NAMES.map((name, i) => (
              <label key={name} className="flex flex-col gap-1 text-[13px] text-sub">
                {i + 1}. {name}
                <input name={`level_${i + 1}`} type="number" inputMode="numeric" min={1} max={100} required defaultValue={s.levelNeeds[i]} className={inputClass} />
              </label>
            ))}
          </div>
          <Note>지금은 나무 한 그루에 물방울 {total}개가 필요해요. 바꾸면 자라는 중인 나무에도 바로 적용돼요.</Note>
        </fieldset>
        <TextField label="반 목표 물방울" name="class_goal" type="number" inputMode="numeric" min={1} max={10000} required defaultValue={s.classGoal} hint="반 아이들이 함께 모으는 목표 물방울 수예요." />
        <TextField label="열매 수확 보너스 포인트" name="harvest_bonus_points" type="number" inputMode="numeric" min={0} max={10000} required defaultValue={s.harvestBonusPoints} />
        <button type="submit" className={`${primaryButtonClass} mt-1 cursor-pointer`}>
          설정 저장하기
        </button>
      </form>
    </>
  );
}
