import { notFound } from "next/navigation";
import { Empty, Face, Flash, H2, InfoRow, Note, SmallButton, SmallLink, SubHeader, TextLink, selectClass, textareaClass } from "@/components/staff/ui";
import { ConfirmButton } from "@/components/staff/widgets";
import { Circle, Icon, Row, Tag, inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { childOpAction, proxyMissionAction, visitAction } from "@/lib/staff/actions";
import { getChildDetail, proxyMissions, type VisitRow } from "@/lib/staff/children";
import { shortDate, toInt } from "@/lib/staff/util";
import { todayKst } from "@/lib/time";
import { KIND_NAMES, LEVEL_NAMES, type MissionKind } from "@/lib/types";

export const metadata = { title: "아이 프로필 · 꿈의숲키우기" };

const METHOD: Record<string, string> = { in_person: "대면", phone: "전화", message: "메시지" };
const STATUS: Record<string, string> = { approved: "완료", pending: "확인 대기", rejected: "반려" };
const ATT: Record<string, { label: string; cls: string }> = {
  present: { label: "출석", cls: "bg-navy text-white" },
  late: { label: "지각", cls: "bg-[#8A5300] text-white" },
  absent: { label: "결석", cls: "bg-danger text-white" },
};
const pillClass = "flex h-[30px] items-center justify-center rounded-md px-2 text-[12px] font-semibold whitespace-nowrap";

function VisitForm({ childId, visit, today }: { childId: number; visit?: VisitRow; today: string }) {
  const key = visit ? `v${visit.id}` : "new";
  return (
    <form action={visitAction} className="flex flex-col gap-2.5 rounded-xl bg-fill p-3">
      <input type="hidden" name="child_id" value={childId} />
      <input type="hidden" name="op" value={visit ? "update" : "add"} />
      {visit ? <input type="hidden" name="visit_id" value={visit.id} /> : null}
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`${key}-date`} className={labelClass}>
            날짜
          </label>
          <input id={`${key}-date`} type="date" name="visited_on" required max={today} defaultValue={visit?.visited_on ?? today} className={`${inputClass} px-2.5`} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`${key}-method`} className={labelClass}>
            방법
          </label>
          <select id={`${key}-method`} name="method" defaultValue={visit?.method ?? "phone"} className={selectClass}>
            <option value="in_person">대면</option>
            <option value="phone">전화</option>
            <option value="message">메시지</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${key}-content`} className={labelClass}>
          내용
        </label>
        <textarea id={`${key}-content`} name="content" required maxLength={4000} defaultValue={visit?.content ?? ""} className={textareaClass} />
      </div>
      <button type="submit" className={`${primaryButtonClass} h-11 cursor-pointer`}>
        {visit ? "고친 내용 저장" : "기록 저장"}
      </button>
    </form>
  );
}

export default async function ChildPage({ params, searchParams }: PageProps<"/staff/children/[id]">) {
  const staff = await requireStaff();
  const id = toInt((await params).id);
  const sp = await searchParams;
  // Children outside this teacher's scope look exactly like children that do not exist.
  const c = id === null ? null : await getChildDetail(staff, id);
  if (!c) notFound();
  const missions = c.can.proxy && c.active ? ((await proxyMissions(staff, c.id)) ?? []) : [];
  const editing = toInt(sp.visit);
  const adding = sp.visit === "new";
  const today = todayKst();
  const here = `/staff/children/${c.id}`;
  const school = [c.school, c.school_class].filter(Boolean).join(" ");

  return (
    <>
      <SubHeader back="/staff/children" backLabel="교적부로 돌아가기" right={c.can.edit ? <TextLink href={`${here}/edit`}>수정</TextLink> : null} />
      <div className="flex items-center gap-3.5 px-4 pt-1">
        <Face name={c.name} id={c.id} photo={c.photo_url} size={64} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="m-0 text-[22px] leading-7 font-bold tracking-[-0.5px]">{c.name}</h1>
          <div className="flex flex-wrap gap-[5px]">
            {c.class_name ? <Tag>{c.class_name}</Tag> : c.self_joined ? <Tag tone="danger">반 미정</Tag> : <Tag>반 없음</Tag>}
            {c.age !== null ? <Tag>{c.age}세</Tag> : null}
            {c.gender ? <Tag>{c.gender === "M" ? "남" : "여"}</Tag> : null}
            {!c.has_phone ? <Tag>휴대폰 없음</Tag> : null}
            {!c.consent_on ? <Tag tone="warn">동의서 확인 필요</Tag> : null}
          </div>
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      {!c.active ? <p className="mx-4 mt-3.5 mb-0 rounded-[10px] bg-fill px-3 py-3 text-[14px] font-bold text-sub">명단에서 뺀 아이예요.</p> : null}
      {c.self_joined && c.active && (c.class_id === null || !c.consent_on) ? (
        <div className="mx-4 mt-3.5 flex flex-col gap-2 rounded-[10px] bg-warn-tint px-3 py-3">
          <p className="m-0 text-[14px] leading-5 font-bold text-warn">함께 쓰는 QR로 스스로 가입한 아이예요.</p>
          <p className="m-0 text-[13px] leading-[19px] text-sub">
            {[c.class_id === null ? "반이 아직 없어요" : null, !c.consent_on ? "보호자 동의서를 아직 확인하지 않았어요" : null].filter(Boolean).join(" · ")}
          </p>
          <div className="flex flex-wrap gap-2">
            {c.class_id === null && c.can.assignClass ? (
              <SmallLink href={`${here}/edit#f-class`} width={74}>
                반 정하기
              </SmallLink>
            ) : null}
            {!c.consent_on && c.can.consent ? (
              <SmallLink href="#consent" width={96} tone="gray">
                동의서 기록하기
              </SmallLink>
            ) : null}
          </div>
        </div>
      ) : null}
      {c.streak.kind === "absent" && c.streak.n >= 2 ? (
        <p className="mx-4 mt-3.5 mb-0 flex min-h-11 items-center rounded-[10px] bg-danger-tint px-3 text-[14px] font-bold text-[#8E2A22]">{c.streak.n}주 연속 결석이에요. 연락해 보세요.</p>
      ) : null}

      <section className="flex flex-col px-4 pt-2">
        <InfoRow label="생년월일">{c.birth_date ? c.birth_date.replaceAll("-", ". ") : c.birth_year ? `${c.birth_year}년생` : "-"}</InfoRow>
        <InfoRow label="학교">{school || "-"}</InfoRow>
        <InfoRow label="주소">{c.address ?? "-"}</InfoRow>
        <InfoRow label="연락처">{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : "-"}</InfoRow>
        <InfoRow label="보호자">{c.guardian_phone ? <a href={`tel:${c.guardian_phone}`}>{c.guardian_phone}</a> : "-"}</InfoRow>
        <InfoRow label="친한 친구">{c.best_friend ?? "-"}</InfoRow>
        <InfoRow label="메모">{c.memo ? <span className="font-medium whitespace-pre-line">{c.memo}</span> : "-"}</InfoRow>
        <InfoRow label="출석">
          <span className="flex flex-col gap-1.5 py-1">
            <span>최근 8주 중 {c.attended}번</span>
            <span className="flex gap-1" role="img" aria-label={c.attendance.map((a) => `${shortDate(a.date)} ${a.status ? ATT[a.status].label : "기록 없음"}`).join(", ")}>
              {[...c.attendance].reverse().map((a) => (
                <span key={a.date} className={`flex h-[22px] w-[22px] items-center justify-center rounded-md text-[10px] font-bold ${a.status ? ATT[a.status].cls : "bg-fill text-faint"}`}>
                  {a.status ? ATT[a.status].label.slice(0, 1) : "·"}
                </span>
              ))}
            </span>
          </span>
        </InfoRow>
        <InfoRow label="앱 시작">{c.onboarded_on ? `${shortDate(c.onboarded_on)}에 ${c.self_joined ? "스스로 가입" : "시작"}${c.has_pin ? "" : " · 비밀번호 없음"}` : "아직 카드를 찍지 않았어요"}</InfoRow>
        <InfoRow label="보호자 동의" last>
          {c.consent_on ? `${c.consent_on.replaceAll("-", ". ")} · 사진 ${c.photo_consent ? "동의" : "동의 안 함"}` : "동의서 확인 필요"}
        </InfoRow>
      </section>

      <section className="flex flex-col px-4">
        <H2>나무와 포인트</H2>
        <div className="flex gap-2">
          <div className="flex h-16 flex-1 flex-col justify-center rounded-xl bg-fill px-3">
            <span className="text-[12px] text-sub">나무 {c.tree.harvested > 0 ? `(${c.tree.harvested + 1}번째)` : ""}</span>
            <span className="text-[15px] font-bold">
              {LEVEL_NAMES[c.tree.level - 1]} {c.tree.given}/{c.tree.need}
            </span>
          </div>
          <div className="flex h-16 flex-1 flex-col justify-center rounded-xl bg-fill px-3">
            <span className="text-[12px] text-sub">남은 물방울</span>
            <span className="text-[15px] font-bold">{c.drops}개</span>
          </div>
          <div className="flex h-16 flex-1 flex-col justify-center rounded-xl bg-fill px-3">
            <span className="text-[12px] text-sub">포인트</span>
            <span className="text-[15px] font-bold">{c.points}P</span>
          </div>
        </div>
      </section>

      {c.can.proxy && c.active ? (
        <section className="flex flex-col px-4">
          <H2>미션 대신 입력</H2>
          <Note>휴대폰이 없는 아이가 한 미션을 선생님이 대신 적어 줄 수 있어요. 바로 승인돼요.</Note>
          {missions.map((m, i) => (
            <Row
              key={m.id}
              last={i === missions.length - 1}
              left={
                <Circle>
                  <Icon name={m.icon} />
                </Circle>
              }
              title={m.title}
              sub={`${KIND_NAMES[m.kind as MissionKind]} · 물방울 ${m.drops}개 · ${m.points}P`}
              right={
                m.state === "done" ? (
                  <span className={`${pillClass} w-[74px] bg-navy-tint text-navy`}>완료</span>
                ) : m.state === "pending" ? (
                  <span className={`${pillClass} w-[74px] bg-warn-tint text-warn`}>확인 대기</span>
                ) : m.canEnter ? (
                  <form action={proxyMissionAction}>
                    <input type="hidden" name="child_id" value={c.id} />
                    <input type="hidden" name="mission_id" value={m.id} />
                    <SmallButton width={74} label={`${m.title} 대신 입력`}>
                      대신 입력
                    </SmallButton>
                  </form>
                ) : (
                  <span className={`${pillClass} w-[74px] bg-fill text-sub`}>{m.kind === "attendance" ? "출석 체크로" : "아이가 직접"}</span>
                )
              }
            />
          ))}
          {missions.length === 0 ? <Empty>이번 주에 열린 미션이 없어요.</Empty> : null}
        </section>
      ) : null}

      <section className="flex flex-col px-4">
        <H2>최근 미션</H2>
        {c.completions.map((m, i) => (
          <div key={m.id} className={`flex min-h-11 items-center gap-2 py-1.5 ${i === c.completions.length - 1 ? "" : "border-b border-line"}`}>
            <span className="min-w-0 grow truncate text-[15px] font-semibold text-ink2">{m.title}</span>
            <span className="shrink-0 text-[13px] text-mute">
              {shortDate(m.done_on)}
              {m.by_staff ? ` · ${m.by_staff} 교사 입력` : ""}
            </span>
            <Tag tone={m.status === "approved" ? "tint" : m.status === "pending" ? "warn" : "gray"}>{STATUS[m.status]}</Tag>
          </div>
        ))}
        {c.completions.length === 0 ? <Empty>아직 한 미션이 없어요.</Empty> : null}
      </section>

      {c.visits ? (
        <section className="flex flex-col px-4" id="visits">
          <H2 right={c.can.writeVisits && c.active && !adding ? <SmallLink href={`${here}?visit=new#visits`} width={74}>기록 추가</SmallLink> : null}>심방일지</H2>
          {adding && c.can.writeVisits ? <VisitForm childId={c.id} today={today} /> : null}
          {c.visits.map((v, i) => (
            <div key={v.id} className={`flex flex-col gap-1 py-3 ${i === c.visits!.length - 1 ? "" : "border-b border-line"}`}>
              {editing === v.id && v.canEdit ? (
                <VisitForm childId={c.id} visit={v} today={today} />
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <Tag>{METHOD[v.method]}</Tag>
                    <span className="min-w-0 grow text-[13px] text-mute">
                      {shortDate(v.visited_on)} · {v.staff_name ? `${v.staff_name} 교사` : "알 수 없음"}
                    </span>
                    {v.canEdit ? (
                      <>
                        <SmallLink href={`${here}?visit=${v.id}#visits`} tone="gray">
                          수정
                        </SmallLink>
                        <form action={visitAction}>
                          <input type="hidden" name="child_id" value={c.id} />
                          <input type="hidden" name="visit_id" value={v.id} />
                          <input type="hidden" name="op" value="delete" />
                          <ConfirmButton message="이 심방일지를 지울까요?">
                            <span className={`${pillClass} min-w-[46px] bg-fill text-sub`}>삭제</span>
                          </ConfirmButton>
                        </form>
                      </>
                    ) : null}
                  </div>
                  <p className="m-0 text-[14px] leading-[21px] whitespace-pre-line text-ink2">{v.content}</p>
                </>
              )}
            </div>
          ))}
          {c.visits.length === 0 && !adding ? <Empty>아직 심방 기록이 없어요.</Empty> : null}
        </section>
      ) : null}

      {c.can.consent ? (
        <section className="flex flex-col px-4" id="consent">
          <H2>보호자 동의서</H2>
          <Note>종이 동의서를 받으면 받은 날을 적어 주세요. 날짜를 비우고 저장하면 다시 ‘확인 필요’가 돼요.</Note>
          <form action={childOpAction} className="flex flex-col gap-2.5 pt-1">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="op" value="consent" />
            <div className="flex items-end gap-2">
              <div className="flex min-w-0 grow flex-col gap-1.5">
                <label htmlFor="consent-on" className={labelClass}>
                  보호자 동의 받은 날
                </label>
                <input id="consent-on" type="date" name="consent_on" max={today} defaultValue={c.consent_on ?? (c.self_joined ? today : "")} className={`${inputClass} px-2.5`} />
              </div>
              <SmallButton width={60} tone={c.consent_on ? "gray" : "navy"}>
                저장
              </SmallButton>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold text-ink2">
              <input type="checkbox" name="photo_consent" defaultChecked={c.photo_consent} className="h-5 w-5 accent-navy" />
              사진 올리는 것에 동의했어요
            </label>
          </form>
        </section>
      ) : null}

      {c.can.resetPin || c.can.admin ? (
        <section className="flex flex-col px-4">
          <H2>카드와 비밀번호</H2>
          {c.can.resetPin && c.active ? (
            <form action={childOpAction} className="flex min-h-[60px] items-center justify-between gap-3 border-b border-line">
              <input type="hidden" name="id" value={c.id} />
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold text-ink2">비밀번호 초기화</span>
                <span className="text-[12px] leading-[18px] text-mute">카드를 다시 찍으면 새 비밀번호를 정해요</span>
              </span>
              <ConfirmButton name="op" value="reset_pin" message={`${c.name}의 비밀번호를 지울까요?`}>
                <span className={`${pillClass} min-w-[60px] bg-fill text-sub`}>초기화</span>
              </ConfirmButton>
            </form>
          ) : null}
          {c.can.admin ? (
            <>
              <form action={childOpAction} className="flex min-h-[60px] items-center justify-between gap-3 border-b border-line">
                <input type="hidden" name="id" value={c.id} />
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold text-ink2">QR 카드 다시 만들기</span>
                  <span className="text-[12px] leading-[18px] text-mute">잃어버린 카드는 못 쓰게 되고 비밀번호도 지워져요</span>
                </span>
                <ConfirmButton name="op" value="reissue" message={`${c.name}의 카드를 새로 만들까요? 전에 쓰던 카드는 못 쓰게 돼요.`}>
                  <span className={`${pillClass} min-w-[60px] bg-fill text-sub`}>새 카드</span>
                </ConfirmButton>
              </form>
              <form action={childOpAction} className="flex min-h-[60px] items-center justify-between gap-3">
                <input type="hidden" name="id" value={c.id} />
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold text-ink2">{c.active ? "명단에서 빼기" : "다시 명단에 넣기"}</span>
                  <span className="text-[12px] leading-[18px] text-mute">{c.active ? "기록은 남고, 아이는 로그인할 수 없어요" : "아이가 다시 로그인할 수 있어요"}</span>
                </span>
                {c.active ? (
                  <ConfirmButton name="op" value="deactivate" message={`${c.name}을(를) 명단에서 뺄까요?`}>
                    <span className={`${pillClass} min-w-[60px] bg-danger text-white`}>빼기</span>
                  </ConfirmButton>
                ) : (
                  <SmallButton name="op" value="reactivate" width={60}>
                    넣기
                  </SmallButton>
                )}
              </form>
            </>
          ) : null}
        </section>
      ) : null}

      <p className="mx-4 mt-4 mb-6 text-[12px] leading-[18px] text-mute">이 화면은 담임, 부장, 교역자만 볼 수 있어요.</p>
    </>
  );
}
