import { inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { saveChildAction } from "@/lib/staff/actions";
import { Chips, Field, Switch, TextField, selectClass, textareaClass } from "./ui";
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

/** Profile form for a new or existing child. The class picker is only rendered (and only honoured) for admins. */
export function ChildForm({ values, classes, friends, canChangeClass, today }: { values: ChildFormValues; classes: { id: number; name: string }[]; friends: { id: number; name: string; class_name: string | null }[]; canChangeClass: boolean; today: string }) {
  return (
    <form action={saveChildAction} className="flex flex-col gap-3.5 px-4 pt-2 pb-6">
      {values.id !== null ? <input type="hidden" name="id" value={values.id} /> : null}
      <Field label="사진">
        <PhotoInput current={values.photo_url} />
      </Field>
      <TextField label="이름" name="name" required maxLength={20} defaultValue={values.name} />
      {canChangeClass ? (
        <Field label="반" htmlFor="f-class">
          <select id="f-class" name="class_id" defaultValue={values.class_id ?? ""} className={selectClass}>
            <option value="">반 없음</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <TextField label="생년월일" name="birth_date" type="date" max={today} defaultValue={values.birth_date} />
      <Chips
        legend="성별"
        name="gender"
        value={values.gender ?? ""}
        options={[
          { value: "M", label: "남" },
          { value: "F", label: "여" },
          { value: "", label: "적지 않음" },
        ]}
      />
      <div className="flex gap-2">
        <div className="min-w-0 flex-[2]">
          <TextField label="학교" name="school" maxLength={40} defaultValue={values.school} />
        </div>
        <div className="min-w-0 flex-1">
          <TextField label="학년 반" name="school_class" maxLength={20} placeholder="5학년 3반" defaultValue={values.school_class} />
        </div>
      </div>
      <TextField label="주소" name="address" maxLength={120} defaultValue={values.address} />
      <TextField label="아이 연락처" name="phone" type="tel" inputMode="tel" maxLength={20} defaultValue={values.phone} />
      <TextField label="보호자 연락처" name="guardian_phone" type="tel" inputMode="tel" maxLength={20} defaultValue={values.guardian_phone} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="f-friend" className={labelClass}>
          친한 친구
        </label>
        <select id="f-friend" name="best_friend_id" defaultValue={values.best_friend_id ?? ""} className={selectClass}>
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
        <input id="f-friend-name" name="best_friend_name" maxLength={20} defaultValue={values.best_friend_name ?? ""} placeholder="명단에 없으면 이름을 적어 주세요" className={inputClass} />
      </div>
      <div className="rounded-xl bg-fill px-3.5">
        <Switch label="휴대폰이 있어요" name="has_phone" defaultChecked={values.has_phone} hint="없으면 선생님이 미션을 대신 입력해 줄 수 있어요" />
      </div>
      <Field label="메모" htmlFor="f-memo">
        <textarea id="f-memo" name="memo" maxLength={2000} defaultValue={values.memo ?? ""} className={textareaClass} />
      </Field>
      <button type="submit" className={`${primaryButtonClass} mt-1 cursor-pointer`}>
        {values.id === null ? "아이 등록하기" : "저장하기"}
      </button>
    </form>
  );
}
