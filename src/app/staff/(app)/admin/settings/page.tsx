import { AdminHeader } from "@/components/staff/admin-kit";
import { Checkbox, FieldGroup, FieldPair, FormSection, HintText, SaveBar, SubmitButton, TextInput, errorFor, fieldLabelClass, inputBoxClass } from "@/components/staff/form-kit";
import { FlashNote, Notice, Page } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { settingsSaveAction } from "@/lib/staff/actions-admin";
import { attendanceOpenOn } from "@/lib/event";
import { weekCap } from "@/lib/game";
import { adminSettings, EVENT_CAP_MAX, EVENT_MAX_DAYS, WELCOME_BACK_MAX } from "@/lib/staff/admin-misc";
import { ROTATING_MAX } from "@/lib/plan";
import { formatKoreanDate, isSunday, todayKst, weekStart } from "@/lib/time";
import { LEVEL_NAMES } from "@/lib/types";

export const metadata = { title: "설정 · 꿈의숲키우기" };

export default async function SettingsPage({ searchParams }: PageProps<"/staff/admin/settings">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const s = await adminSettings(staff);
  if (!s) return null;
  const total = s.levelNeeds.reduce((a, b) => a + b, 0);
  const levelError = errorFor(sp.error, /단계별/);
  const today = todayKst();
  const ev = s.event;
  const evOver = ev !== null && ev.to < today;
  const capNow = weekCap(s, weekStart(today));
  // What the period is doing today, in words: shown only while it changes something.
  const evNow = [!isSunday(today) && attendanceOpenOn(ev, today) ? "오늘은 주일이 아니어도 출석 QR을 받아요" : null, capNow !== s.weeklyDropCap ? `이번 주 물방울 한도는 ${capNow}개예요` : null].filter((x) => x !== null);
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
            hint="미션으로 한 주에 모을 수 있는 물방울 수예요. 수련회나 행사가 있는 주에만 더 받게 하려면 아래 ‘행사 기간’에 적어 주세요."
            error={errorFor(sp.error, /주간 물방울/)}
          />
          <TextInput
            label="반가워 물방울"
            name="welcome_back_drops"
            id="set-welcome"
            type="number"
            inputMode="numeric"
            min={0}
            max={WELCOME_BACK_MAX}
            required
            defaultValue={s.welcomeBackDrops}
            hint={`두 주일을 이어서 빠졌다가 다시 온 아이에게 주는 물방울이에요. 한 주 한도와 따로 세요. 0에서 ${WELCOME_BACK_MAX}개, 0이면 주지 않아요.`}
            error={errorFor(sp.error, /반가워/)}
          />
          <TextInput label="반 목표 물방울" name="class_goal" id="set-goal" type="number" inputMode="numeric" min={1} max={10000} required defaultValue={s.classGoal} hint="반 아이들이 함께 모으는 목표 물방울 수예요." error={errorFor(sp.error, /반 목표/)} />
        </FormSection>
        <FormSection title="행사 기간" note="수련회나 행사, 또는 미리 시험해 볼 때 써요. 기간이 지나면 저절로 평소대로 돌아가요.">
          {evNow.length > 0 ? <Notice>{evNow.join(". ")}.</Notice> : null}
          {evOver ? <Notice>{`${formatKoreanDate(ev.to)}에 끝난 행사 기간이에요. 새 날짜를 적거나 날짜를 지워 주세요.`}</Notice> : null}
          <FieldPair>
            <TextInput label="시작일" name="event_from" id="set-event-from" type="date" defaultValue={ev?.from ?? ""} error={errorFor(sp.error, /행사 기간/)} />
            <TextInput label="끝나는 날" name="event_to" id="set-event-to" type="date" defaultValue={ev?.to ?? ""} />
          </FieldPair>
          <HintText>{`하루만 쓰려면 두 칸에 같은 날을 적어요. ${EVENT_MAX_DAYS}일까지 정할 수 있고, 두 칸을 모두 비우면 행사 기간이 없어져요.`}</HintText>
          <div className="flex flex-col gap-1">
            <Checkbox label="이 기간에는 주일이 아니어도 출석 QR 받기" name="event_attendance" defaultChecked={ev?.attendanceQr === true} />
            <HintText>출석 화면에 나오는 출석 QR을 그대로 쓰면 돼요. 아이는 기간 중 하루에 한 번씩 찍을 수 있고, 찍을 때마다 출석 미션의 보상을 받아요. 주일 출석부에는 적히지 않아요.</HintText>
          </div>
          <TextInput
            label="행사 주의 물방울 한도"
            name="event_cap"
            id="set-event-cap"
            type="number"
            inputMode="numeric"
            min={1}
            max={EVENT_CAP_MAX}
            defaultValue={ev?.weeklyDropCap ?? ""}
            placeholder="비우면 평소 한도"
            hint={`행사 기간이 든 주(주일~토요일)에는 한 주에 이만큼까지 받을 수 있어요. 평소 한도보다 크게, ${EVENT_CAP_MAX}개까지 적을 수 있어요. 비워 두면 평소 한도 그대로예요.`}
            error={errorFor(sp.error, /행사 주 한도/)}
          />
        </FormSection>
        <FormSection title="미션">
          <TextInput
            label="한 주에 나오는 순환 미션"
            name="rotating_per_week"
            id="set-rotating"
            type="number"
            inputMode="numeric"
            min={0}
            max={ROTATING_MAX}
            required
            defaultValue={s.rotatingPerWeek}
            hint={`보관함에서 오래 안 나온 미션부터 매주 이만큼 나와요(0에서 ${ROTATING_MAX}개). 이미 정해진 주는 그대로예요.`}
            error={errorFor(sp.error, /순환 미션/)}
          />
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
