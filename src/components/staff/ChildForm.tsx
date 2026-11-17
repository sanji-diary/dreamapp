import { saveChildAction } from "@/lib/staff/actions";
import { ChoiceChips, Field, FieldGroup, FormSection, SaveBar, SelectInput, SubmitButton, SwitchRow, TextArea, TextInput, errorFor, inputBoxClass, selectBoxClass } from "./form-kit";
import { PhotoInput } from "./widgets";

export interface ChildFormValues {
  id: number | null;
  name: string;
  class_id: number | null;
  birth_date: string | null;
  gender: string | null;
  school: string | null;
  school_class: string | null;
  address: string | null;
  phone: string | null;
  guardian_phone: string | null;
  best_friend_id: number | null;
  best_friend_name: string | null;
  has_phone: boolean;
  memo: string | null;
  photo_url: string | null;
}

/**
 * Profile form for a new or existing child. The class picker is only rendered (and only honoured) for admins.
 * `error` is the message the server sent back; it is shown again under the field it is about.
 * On wide screens the three parts sit in two columns.
 */
export function ChildForm({ values, classes, friends, canChangeClass, today, error }: { values: ChildFormValues; classes: { id: number; name: string }[]; friends: { id: number; name: string; class_name: string | null }[]; canChangeClass: boolean; today: string; error?: string }) {
  return (
    <form action={saveChildAction} className="flex grow flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
      {values.id !== null ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormSection title="아이" className="lg:row-span-2">
        <FieldGroup legend="사진" error={errorFor(error, /사진|이미지/)}>
          <PhotoInput current={values.photo_url} />
        </FieldGroup>
        <TextInput label="이름" name="name" required maxLength={20} defaultValue={values.name} error={errorFor(error, /이름/)} />
        {canChangeClass ? (
          <SelectInput label="반" name="class_id" id="f-class" defaultValue={values.class_id ?? ""} error={errorFor(error, /반을/)}>
            <option value="">반 없음</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        ) : null}
        <TextInput label="생년월일" name="birth_date" type="date" max={today} defaultValue={values.birth_date} error={errorFor(error, /생년월일|날짜/)} />
        <ChoiceChips
          legend="성별"
          name="gender"
          value={values.gender ?? ""}
          options={[
            { value: "M", label: "남" },
            { value: "F", label: "여" },
            { value: "", label: "적지 않음" },
          ]}
        />
      </FormSection>

      <FormSection title="학교와 연락처">
        <div className="grid grid-cols-[2fr_1fr] items-start gap-2.5 max-[359px]:grid-cols-1">
          <TextInput label="학교" name="school" maxLength={40} defaultValue={values.school} />
          <TextInput label="학년 반" name="school_class" maxLength={20} placeholder="5학년 3반" defaultValue={values.school_class} />
        </div>
        <TextInput label="주소" name="address" maxLength={120} defaultValue={values.address} />
        <TextInput label="아이 연락처" name="phone" type="tel" inputMode="tel" maxLength={20} defaultValue={values.phone} autoComplete="off" />
        <TextInput label="보호자 연락처" name="guardian_phone" type="tel" inputMode="tel" maxLength={20} defaultValue={values.guardian_phone} autoComplete="off" />
      </FormSection>

      <FormSection title="더 알아 두기" className="lg:col-start-2">
        <Field label="가장 친한 친구" htmlFor="f-friend" error={errorFor(error, /친구/)}>
          <select id="f-friend" name="best_friend_id" defaultValue={values.best_friend_id ?? ""} className={selectBoxClass()}>
            <option value="">명단에서 고르지 않음</option>
            {friends.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.class_name ? ` (${f.class_name})` : ""}
              </option>
            ))}
          </select>
          <label htmlFor="f-friend-name" className="sr-only">
            명단에 없는 친구 이름
          </label>
          <input id="f-friend-name" name="best_friend_name" maxLength={20} defaultValue={values.best_friend_name ?? ""} placeholder="명단에 없으면 이름을 적어 주세요" className={inputBoxClass()} />
        </Field>
        <SwitchRow label="휴대폰이 있어요" name="has_phone" defaultChecked={values.has_phone} hint="없으면 선생님이 미션을 대신 입력해 줄 수 있어요" />
        <TextArea label="메모" name="memo" maxLength={2000} defaultValue={values.memo ?? ""} />
      </FormSection>

      <SaveBar className="lg:col-start-1">
        <SubmitButton>{values.id === null ? "아이 추가하기" : "저장하기"}</SubmitButton>
      </SaveBar>
    </form>
  );
}
