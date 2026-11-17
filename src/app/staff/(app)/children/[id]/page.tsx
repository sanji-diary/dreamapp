import Link from "next/link";
import { notFound } from "next/navigation";
import { ClayIcon, CtaLink, EmptyNote, FlashNote, InfoField, List, ListRow, Notice, Page, PageHeader, PillButton, PillLink, PillNote, RoundLink, SectionHead, Segmented, StatTile, Tag, TreeAvatar, pillClass } from "@/components/staff/kit";
import { selectClass, textareaClass } from "@/components/staff/ui";
import { ConfirmButton } from "@/components/staff/widgets";
import { inputClass, labelClass } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { childOpAction, proxyMissionAction, visitAction } from "@/lib/staff/actions";
import { childStats, getChildDetail, proxyMissions, type ChildDetail, type ProxyMission, type VisitRow } from "@/lib/staff/children";
import { shortDate, toInt } from "@/lib/staff/util";
import { todayKst } from "@/lib/time";
import { KIND_NAMES, LEVEL_NAMES, type MissionKind } from "@/lib/types";

export const metadata = { title: "아이 정보 · 꿈의숲키우기" };

const METHOD: Record<string, string> = { in_person: "대면", phone: "전화", message: "메시지" };
const STATUS: Record<string, string> = { approved: "완료", pending: "확인 대기", rejected: "반려" };
const ATT: Record<string, { label: string; cls: string }> = {
  present: { label: "출석", cls: "bg-navy text-white" },
  late: { label: "지각", cls: "bg-warn text-white" },
  absent: { label: "결석", cls: "bg-danger text-white" },
};

type Tab = "info" | "visits" | "activity";

const formButton = "flex h-11 min-w-0 items-center justify-center rounded-xl px-3 text-[15px] font-bold whitespace-nowrap no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

function VisitForm({ childId, visit, today }: { childId: number; visit?: VisitRow; today: string }) {
  const key = visit ? `v${visit.id}` : "new";
  return (
    <form action={visitAction} className="flex flex-col gap-2.5 rounded-[20px] bg-fill p-3.5">
      <input type="hidden" name="child_id" value={childId} />
      <input type="hidden" name="op" value={visit ? "update" : "add"} />
      {visit ? <input type="hidden" name="visit_id" value={visit.id} /> : null}
      <div className="flex gap-2 max-[359px]:flex-col">
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
      <div className="flex gap-2 max-[339px]:flex-col-reverse">
        <Link href={`/staff/children/${childId}?tab=visits`} scroll={false} className={`${formButton} flex-1 bg-white text-ink2 max-[339px]:flex-none`}>
          그만두기
        </Link>
        <button type="submit" className={`${formButton} flex-[1.3] cursor-pointer border-0 bg-navy text-white max-[339px]:flex-none`}>
          {visit ? "고친 내용 저장" : "기록 저장"}
        </button>
      </div>
    </form>
  );
}

/** 정보: who the child is and how to reach the family, then the consent form and the card and PIN controls. */
function InfoTab({ c, today }: { c: ChildDetail; today: string }) {
  const school = [c.school, c.school_class].filter(Boolean).join(" ");
  return (
    <>
      <div>
        <InfoField label="성별">{c.gender ? (c.gender === "M" ? "남" : "여") : "미입력"}</InfoField>
        <InfoField label="생년월일">{c.birth_date ? `${c.birth_date.replaceAll("-", ". ")}${c.age !== null ? ` (${c.age}세)` : ""}` : c.birth_year ? `${c.birth_year}년생` : "미입력"}</InfoField>
        <InfoField label="학교">{school || "미입력"}</InfoField>
        <InfoField label="주소">{c.address ?? "미입력"}</InfoField>
        <InfoField label="연락처">{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : "미입력"}</InfoField>
        <InfoField label="보호자">{c.guardian_phone ? <a href={`tel:${c.guardian_phone}`}>{c.guardian_phone}</a> : "미입력"}</InfoField>
        <InfoField label="가장 친한 친구">{c.best_friend ?? "미입력"}</InfoField>
        <InfoField label="휴대폰">{c.has_phone ? "있음" : "없음 · 선생님이 대신 입력"}</InfoField>
        <InfoField label="앱 시작">{c.onboarded_on ? `${shortDate(c.onboarded_on)}에 ${c.self_joined ? "스스로 가입" : "시작"}${c.has_pin ? "" : " · 비밀번호 없음"}` : "아직 카드를 찍지 않았어요"}</InfoField>
        <InfoField label="보호자 동의">{c.consent_on ? `${c.consent_on.replaceAll("-", ". ")} · 사진 ${c.photo_consent ? "동의" : "동의 안 함"}` : "동의서 확인 필요"}</InfoField>
      </div>
      {c.memo ? (
        <div className="flex flex-col gap-1 rounded-[14px] bg-fill px-3.5 py-3">
          <span className="text-[13px] text-mute">메모</span>
          <p className="m-0 text-[14px] leading-[21px] whitespace-pre-line text-ink2">{c.memo}</p>
        </div>
      ) : null}

      {c.can.consent ? (
        <section className="flex flex-col gap-2" id="consent">
          <SectionHead className="mt-2">보호자 동의서</SectionHead>
          <p className="m-0 text-[13px] leading-[19px] text-mute">종이 동의서를 받으면 받은 날을 적어 주세요. 날짜를 비우고 저장하면 다시 ‘확인 필요’가 돼요.</p>
          <form action={childOpAction} className="flex flex-col gap-2.5">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="op" value="consent" />
            <div className="flex items-end gap-2">
              <div className="flex min-w-0 grow flex-col gap-1.5">
                <label htmlFor="consent-on" className={labelClass}>
                  보호자 동의 받은 날
                </label>
                <input id="consent-on" type="date" name="consent_on" max={today} defaultValue={c.consent_on ?? (c.self_joined ? today : "")} className={`${inputClass} px-2.5`} />
              </div>
              <span className="flex h-12 items-center">
                <PillButton tone={c.consent_on ? "gray" : "navy"} label="보호자 동의 저장">
                  저장
                </PillButton>
              </span>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold text-ink2">
              <input type="checkbox" name="photo_consent" defaultChecked={c.photo_consent} className="h-5 w-5 accent-navy" />
              사진 올리는 것에 동의했어요
            </label>
          </form>
        </section>
      ) : null}

      {c.can.resetPin || c.can.admin ? (
        <section className="flex flex-col">
          <SectionHead className="mt-2">카드와 비밀번호</SectionHead>
          <List>
            {c.can.resetPin && c.active ? (
              <ListRow
                compact
                title="비밀번호 초기화"
                sub="카드를 다시 찍으면 새 비밀번호를 정해요"
                right={
                  <form action={childOpAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmButton name="op" value="reset_pin" message={`${c.name}의 비밀번호를 지울까요?`}>
                      <span className={pillClass("gray")}>초기화</span>
                    </ConfirmButton>
                  </form>
                }
              />
            ) : null}
            {c.can.admin ? (
              <>
                <ListRow
                  compact
                  title="QR 카드 다시 만들기"
                  sub="잃어버린 카드는 못 쓰게 되고 비밀번호도 지워져요"
                  right={
                    <form action={childOpAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton name="op" value="reissue" message={`${c.name}의 카드를 새로 만들까요? 전에 쓰던 카드는 못 쓰게 돼요.`}>
                        <span className={pillClass("gray")}>새 카드</span>
                      </ConfirmButton>
                    </form>
                  }
                />
                <ListRow
                  compact
                  title={c.active ? "명단에서 빼기" : "다시 명단에 넣기"}
                  sub={c.active ? "기록은 남고, 아이는 로그인할 수 없어요" : "아이가 다시 로그인할 수 있어요"}
                  right={
                    <form action={childOpAction}>
                      <input type="hidden" name="id" value={c.id} />
                      {c.active ? (
                        <ConfirmButton name="op" value="deactivate" message={`${c.name}을(를) 명단에서 뺄까요?`}>
                          <span className="rounded-[9px] bg-danger px-3 py-2 text-[13px] leading-[1.4] font-bold whitespace-nowrap text-white">빼기</span>
                        </ConfirmButton>
                      ) : (
                        <PillButton name="op" value="reactivate">
                          넣기
                        </PillButton>
                      )}
                    </form>
                  }
                />
              </>
            ) : null}
          </List>
        </section>
      ) : null}
      <p className="m-0 text-[12px] leading-[18px] text-mute">이 화면은 담임, 부장, 교역자만 볼 수 있어요.</p>
    </>
  );
}

/** 심방: visit notes, newest first. Only teachers who may read them get this tab. */
function VisitsTab({ c, here, today, adding, editing }: { c: ChildDetail; here: string; today: string; adding: boolean; editing: number | null }) {
  const visits = c.visits ?? [];
  const canAdd = c.can.writeVisits && c.active;
  return (
    <section className="flex flex-col gap-2" id="visits">
      <SectionHead
        right={
          canAdd && !adding ? (
            <PillLink href={`${here}?tab=visits&visit=new#visits`} label="심방 기록 쓰기">
              기록 쓰기
            </PillLink>
          ) : undefined
        }
      >
        심방 기록
      </SectionHead>
      {adding && canAdd ? <VisitForm childId={c.id} today={today} /> : null}
      <div className="flex flex-col">
        {visits.map((v) => (
          <div key={v.id} className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0">
            {editing === v.id && v.canEdit ? (
              <VisitForm childId={c.id} visit={v} today={today} />
            ) : (
              <>
                <div className="flex min-h-9 items-center gap-1.5">
                  <Tag>{METHOD[v.method]}</Tag>
                  <span className="min-w-0 grow text-[13px] text-mute">
                    {shortDate(v.visited_on)} · {v.staff_name ? `${v.staff_name} 교사` : "알 수 없음"}
                  </span>
                  {v.canEdit ? (
                    <>
                      <PillLink href={`${here}?tab=visits&visit=${v.id}#visits`} tone="gray" label={`${shortDate(v.visited_on)} 심방 기록 고치기`}>
                        수정
                      </PillLink>
                      <form action={visitAction}>
                        <input type="hidden" name="child_id" value={c.id} />
                        <input type="hidden" name="visit_id" value={v.id} />
                        <input type="hidden" name="op" value="delete" />
                        <ConfirmButton message="이 심방일지를 지울까요?">
                          <span className={pillClass("gray")}>삭제</span>
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
      </div>
      {visits.length === 0 && !adding ? <EmptyNote>아직 심방 기록이 없어요.</EmptyNote> : null}
    </section>
  );
}

/** 활동: attendance, the tree, missions a teacher enters for the child, and what the child did lately. */
function ActivityTab({ c, missions }: { c: ChildDetail; missions: ProxyMission[] }) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <SectionHead note={`최근 8주 중 ${c.attended}번`}>출석</SectionHead>
        <span className="flex gap-1.5" role="img" aria-label={c.attendance.map((a) => `${shortDate(a.date)} ${a.status ? ATT[a.status].label : "기록 없음"}`).join(", ")}>
          {[...c.attendance].reverse().map((a) => (
            <span key={a.date} className={`flex h-[30px] min-w-0 flex-1 items-center justify-center rounded-lg text-[12px] font-bold ${a.status ? ATT[a.status].cls : "bg-fill text-faint"}`}>
              {a.status ? ATT[a.status].label.slice(0, 1) : "·"}
            </span>
          ))}
        </span>
      </section>
      <section className="flex flex-col gap-2">
        <SectionHead note={c.tree.harvested > 0 ? `${c.tree.harvested + 1}번째 나무` : undefined}>나무</SectionHead>
        <div className="grid grid-cols-3 gap-2">
          <StatTile value={LEVEL_NAMES[c.tree.level - 1]} label="지금 단계" />
          <StatTile value={`${c.tree.given} / ${c.tree.need}`} label="이 단계에 준 물" />
          <StatTile value={`${c.drops}개`} label="남은 물방울" />
        </div>
      </section>

      {c.can.proxy && c.active ? (
        <section className="flex flex-col" id="proxy">
          <SectionHead>미션 대신 입력</SectionHead>
          <p className="m-0 text-[13px] leading-[19px] text-mute">휴대폰이 없는 아이가 한 미션을 선생님이 대신 적어 줄 수 있어요. 바로 승인돼요.</p>
          <List>
            {missions.map((m) => (
              <ListRow
                key={m.id}
                left={<ClayIcon name={m.icon} size="s" />}
                title={m.title}
                sub={`${KIND_NAMES[m.kind as MissionKind]} · 물방울 ${m.drops}개 · ${m.points}P`}
                right={
                  m.state === "done" ? (
                    <PillNote tone="navy">완료</PillNote>
                  ) : m.state === "pending" ? (
                    <PillNote tone="warn">확인 대기</PillNote>
                  ) : m.canEnter ? (
                    <form action={proxyMissionAction}>
                      <input type="hidden" name="child_id" value={c.id} />
                      <input type="hidden" name="mission_id" value={m.id} />
                      <PillButton label={`${m.title} 대신 입력`}>대신 입력</PillButton>
                    </form>
                  ) : (
                    <PillNote>{m.kind === "attendance" ? "출석 체크로" : "아이가 직접"}</PillNote>
                  )
                }
              />
            ))}
          </List>
          {missions.length === 0 ? <EmptyNote>이번 주에 열린 미션이 없어요.</EmptyNote> : null}
        </section>
      ) : null}

      <section className="flex flex-col">
        <SectionHead>최근 미션</SectionHead>
        <div className="flex flex-col">
          {c.completions.map((m) => (
            <div key={m.id} className="flex items-center gap-2 border-b border-line py-2 last:border-b-0">
              <span className="flex min-w-0 grow flex-col">
                <span className="text-[15px] font-semibold text-ink2">{m.title}</span>
                <span className="text-[13px] text-mute">
                  {shortDate(m.done_on)}
                  {m.by_staff ? ` · ${m.by_staff} 교사 입력` : ""}
                </span>
              </span>
              <Tag tone={m.status === "approved" ? "navy" : m.status === "pending" ? "warn" : "gray"}>{STATUS[m.status]}</Tag>
            </div>
          ))}
        </div>
        {c.completions.length === 0 ? <EmptyNote>아직 한 미션이 없어요.</EmptyNote> : null}
      </section>
    </>
  );
}

export default async function ChildPage({ params, searchParams }: PageProps<"/staff/children/[id]">) {
  const staff = await requireStaff();
  const id = toInt((await params).id);
  const sp = await searchParams;
  // Children outside this teacher's scope look exactly like children that do not exist.
  const c = id === null ? null : await getChildDetail(staff, id);
  if (!c) notFound();
  const st = (await childStats(staff, [c.id])).get(c.id);
  const editing = toInt(sp.visit);
  const adding = sp.visit === "new";
  // ?tab= chooses the section. Older links (?visit=new) still open the visit notes.
  const tab: Tab = sp.tab === "activity" ? "activity" : c.visits && (sp.tab === "visits" || (sp.tab === undefined && sp.visit !== undefined)) ? "visits" : "info";
  const missions = tab === "activity" && c.can.proxy && c.active ? ((await proxyMissions(staff, c.id)) ?? []) : [];
  const today = todayKst();
  const here = `/staff/children/${c.id}`;
  const birthYear = c.birth_date ? c.birth_date.slice(0, 4) : c.birth_year ? String(c.birth_year) : null;
  const line = [c.class_name ?? (c.self_joined ? null : "반 없음"), birthYear ? `${birthYear}년생` : null, c.school].filter(Boolean).join(" · ");
  const canProxy = c.can.proxy && c.active;
  const canVisit = c.can.writeVisits && c.active;
  // The two buttons at the bottom are for starting; while a note is being written they would only be in the way.
  const showButtons = (canProxy || canVisit) && !(tab === "visits" && (adding || editing !== null));

  return (
    <Page>
      <PageHeader back="/staff/children" backLabel="우리 반으로 돌아가기" right={c.can.edit ? <RoundLink href={`${here}/edit`} label="정보 고치기" icon="pen" /> : undefined} />
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-7 lg:gap-y-4">
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3.5">
            <TreeAvatar level={st?.level ?? c.tree.level} photo={c.photo_url} size="l" className="max-[339px]:h-14 max-[339px]:w-14" />
            <div className="flex min-w-0 flex-col">
              <h1 className="m-0 text-[22px] leading-[1.35] font-bold tracking-[-0.035em]">{c.name}</h1>
              <span className="text-[13px] text-mute">{line}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-[7px] empty:hidden">
            {!c.active ? <Tag tone="danger">명단 제외</Tag> : null}
            {c.class_id === null && c.self_joined ? <Tag tone="danger">반 미정</Tag> : null}
            {st && st.absentWeeks >= 2 ? <Tag tone="danger">{st.absentWeeks}주 결석</Tag> : null}
            {st && st.worries > 0 ? (
              <Link href="/staff/worries" aria-label={`새 고민 ${st.worries}건 읽으러 가기`} className="relative no-underline after:absolute after:-inset-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
                <Tag tone="blue">고민 {st.worries}</Tag>
              </Link>
            ) : null}
            {!c.consent_on ? <Tag tone="warn">동의서 확인 필요</Tag> : null}
            {!c.has_phone ? <Tag>휴대폰 없음</Tag> : null}
            {!c.onboarded_on ? <Tag>가입 전</Tag> : null}
          </div>
          <FlashNote ok={sp.ok} error={sp.error} />
          {!c.active ? <Notice>명단에서 뺀 아이예요.</Notice> : null}
          {c.self_joined && c.active && (c.class_id === null || !c.consent_on) ? (
            <div className="flex flex-col gap-1.5 rounded-xl bg-warn-tint px-3.5 py-3">
              <p className="m-0 text-[14px] leading-5 font-bold text-warn">함께 쓰는 QR로 스스로 가입한 아이예요.</p>
              <p className="m-0 text-[13px] leading-[19px] text-sub">{[c.class_id === null ? "반이 아직 없어요" : null, !c.consent_on ? "보호자 동의서를 아직 확인하지 않았어요" : null].filter(Boolean).join(" · ")}</p>
              <div className="flex flex-wrap gap-2">
                {c.class_id === null && c.can.assignClass ? <PillLink href={`${here}/edit#f-class`}>반 정하기</PillLink> : null}
                {!c.consent_on && c.can.consent ? (
                  <PillLink href={`${here}?tab=info#consent`} tone="white">
                    동의서 기록하기
                  </PillLink>
                ) : null}
              </div>
            </div>
          ) : null}
          {c.streak.kind === "absent" && c.streak.n >= 2 ? <Notice tone="danger">{c.streak.n}주 연속 결석이에요. 연락해 보세요.</Notice> : null}
          <div className="grid grid-cols-3 gap-2">
            <StatTile value={st && st.weeks.length > 0 ? `${st.attended} / ${st.weeks.length}` : "–"} label="최근 4주 출석" />
            <StatTile value={LEVEL_NAMES[c.tree.level - 1]} label="나무 단계" />
            <StatTile value={`${c.points}P`} label="포인트" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Segmented
            label={`${c.name} 정보 나누어 보기`}
            items={[
              { href: here, label: "정보", on: tab === "info", scroll: false },
              ...(c.visits ? [{ href: `${here}?tab=visits`, label: `심방 ${c.visits.length}`, on: tab === "visits", scroll: false }] : []),
              { href: `${here}?tab=activity`, label: "활동", on: tab === "activity", scroll: false },
            ]}
          />
          {tab === "info" ? <InfoTab c={c} today={today} /> : null}
          {tab === "visits" ? <VisitsTab c={c} here={here} today={today} adding={adding} editing={editing} /> : null}
          {tab === "activity" ? <ActivityTab c={c} missions={missions} /> : null}
        </div>

        {showButtons ? (
          <div className="sticky bottom-[76px] z-10 -mx-[18px] flex gap-2.5 bg-white px-[18px] py-2.5 max-[359px]:gap-2 lg:static lg:col-start-1 lg:row-start-2 lg:mx-0 lg:p-0">
            {canProxy ? (
              <div className="min-w-0 flex-1">
                <CtaLink href={`${here}?tab=activity#proxy`} tone={canVisit ? "gray" : "navy"}>
                  미션 대신 입력
                </CtaLink>
              </div>
            ) : null}
            {canVisit ? (
              <div className="min-w-0 flex-[1.3] max-[359px]:flex-1">
                <CtaLink href={`${here}?tab=visits&visit=new#visits`}>심방 기록 쓰기</CtaLink>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Page>
  );
}
