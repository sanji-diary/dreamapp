import Link from "next/link";
import { redirect } from "next/navigation";
import { BarLink, Box, Card, Chevron, Chip, Chips, EmptyNote, FlashNote, InfoField, LineIcon, List, ListRow, Notice, Page, PageHeader, RoundLink, Segmented, Tag, TreeAvatar, type TagTone } from "@/components/staff/kit";
import { AutoForm } from "@/components/staff/widgets";
import { requireStaff } from "@/lib/auth";
import { canApprove, canWriteVisits } from "@/lib/authz";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/game";
import { homeroomNames } from "@/lib/kid/queries";
import { approveScope, canWriteAnyVisits, hasScope, listClasses } from "@/lib/staff/access";
import { canSeeNewJoiners, childStats, getChildDetail, listChildren, newJoinerCount, type ChildDetail, type ChildListItem, type ChildStat } from "@/lib/staff/children";
import { homeKind, shortClassName } from "@/lib/staff/home";
import { shortDate, toInt } from "@/lib/staff/util";
import { LEVEL_NAMES } from "@/lib/types";

export const metadata = { title: "우리 반 · 꿈의숲키우기" };

type Filter = "all" | "absent" | "before" | "other";
type Pick = "visit" | "proxy";

interface View {
  q: string;
  classId: number | null;
  inactive: boolean;
  onlyNew: boolean;
  f: Filter;
  /** Phones: the search box is open. */
  search: boolean;
  pick: Pick | null;
  /** Wide screens: the child whose summary is open in the side panel. */
  id: number | null;
}

/** The address for this list with some of its choices changed. */
function href(v: View, patch: Partial<View> = {}): string {
  const n = { ...v, ...patch };
  const p = new URLSearchParams();
  if (n.pick) p.set("pick", n.pick);
  if (n.q) p.set("q", n.q);
  if (n.classId !== null) p.set("class", String(n.classId));
  if (n.inactive) p.set("inactive", "1");
  if (n.onlyNew) p.set("new", "1");
  if (n.f !== "all") p.set("f", n.f);
  if (n.search) p.set("s", "1");
  if (n.id !== null) p.set("id", String(n.id));
  const s = p.toString();
  return s ? `/staff/children?${s}` : "/staff/children";
}

/** Hidden fields that carry the other choices through a GET form (search box, class picker). */
function Keep({ v, omit }: { v: View; omit: "q" | "class" }) {
  return (
    <>
      {v.pick ? <input type="hidden" name="pick" value={v.pick} /> : null}
      {omit !== "q" && v.q ? <input type="hidden" name="q" value={v.q} /> : null}
      {omit !== "class" && v.classId !== null ? <input type="hidden" name="class" value={v.classId} /> : null}
      {v.inactive ? <input type="hidden" name="inactive" value="1" /> : null}
      {v.onlyNew ? <input type="hidden" name="new" value="1" /> : null}
      {v.f !== "all" ? <input type="hidden" name="f" value={v.f} /> : null}
    </>
  );
}

function ClassPicker({ v, classes, id }: { v: View; classes: { id: number; name: string }[]; id: string }) {
  return (
    <AutoForm className="flex h-11 shrink-0 items-center lg:h-10">
      <label className="sr-only" htmlFor={id}>
        반 고르기
      </label>
      <select id={id} name="class" defaultValue={v.classId ?? ""} className={`h-[34px] cursor-pointer rounded-full border-0 px-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${v.classId !== null ? "bg-navy text-white" : "bg-fill text-sub"}`}>
        <option value="">모든 반</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Keep v={v} omit="class" />
    </AutoForm>
  );
}

function SearchBox({ v, id, wide = false, autoFocus = false }: { v: View; id: string; wide?: boolean; autoFocus?: boolean }) {
  return (
    <form method="get" action="/staff/children" role="search" className={wide ? "flex h-[38px] w-60 items-center gap-2 rounded-full bg-fill px-3.5 text-faint focus-within:outline-2 focus-within:outline-navy" : "flex h-11 items-center gap-2 rounded-full bg-fill px-4 text-faint focus-within:outline-2 focus-within:outline-navy"}>
      <LineIcon name="search" size={17} />
      <label htmlFor={id} className="sr-only">
        이름으로 찾기
      </label>
      <input id={id} name="q" type="search" defaultValue={v.q} placeholder="이름으로 찾기" enterKeyHint="search" autoFocus={autoFocus} className={`h-full min-w-0 grow border-0 bg-transparent p-0 text-ink outline-none placeholder:text-faint ${wide ? "text-[13.5px]" : "text-[16px]"}`} />
      <Keep v={v} omit="q" />
    </form>
  );
}

interface StatusTag {
  tone: TagTone;
  text: string;
}

/** What needs a look for this child. Details only for children the teacher may open (the list item already hides the rest). */
function statusTags(k: ChildListItem, st: ChildStat | undefined): StatusTag[] {
  const t: StatusTag[] = [];
  if (!k.active) t.push({ tone: "danger", text: "명단 제외" });
  if (k.classPending) t.push({ tone: "danger", text: "반 미정" });
  if (st && st.absentWeeks >= 2) t.push({ tone: "danger", text: `${st.absentWeeks}주 결석` });
  if (st && st.worries > 0) t.push({ tone: "blue", text: `고민 ${st.worries}` });
  if (k.needsConsent) t.push({ tone: "warn", text: "동의서 확인 필요" });
  if (k.noPhone) t.push({ tone: "gray", text: "휴대폰 없음" });
  if (k.notOnboarded) t.push({ tone: "gray", text: "가입 전" });
  return t;
}

/** Missed two or more of the counted Sundays (two of four in the usual case). */
const lowAttendance = (st: ChildStat) => st.weeks.length - st.attended >= 2;

/* ---------- phones: cards ---------- */

function KidCard({ k, st, cap, showClass }: { k: ChildListItem; st: ChildStat | undefined; cap: number; showClass: boolean }) {
  const flag = st && st.absentWeeks >= 2 ? "absent" : st && st.worries > 0 ? "worry" : null;
  // The level tag and the dot already say these; the rest goes in a second row.
  const extra = statusTags(k, st).filter((t) => t.text !== "가입 전" && !t.text.endsWith("결석") && !t.text.startsWith("고민"));
  return (
    <li className="flex flex-col gap-3 rounded-[20px] bg-fill px-3.5 pt-3.5 pb-3">
      <div className="relative flex items-center gap-2.5">
        <TreeAvatar level={st ? st.level : null} photo={k.photo_url} size="m" onWhite className="max-[379px]:h-10 max-[379px]:w-10" />
        {flag ? (
          <span className={`absolute -top-px left-9 h-4 w-4 rounded-full border-2 border-fill max-[379px]:left-7 ${flag === "absent" ? "bg-count" : "bg-bar"}`}>
            <span className="sr-only">{flag === "absent" ? `${st!.absentWeeks}주 결석` : `새 고민 ${st!.worries}건`}</span>
          </span>
        ) : null}
        <div className="flex min-w-0 grow flex-col items-start gap-1">
          <span className="block max-w-full text-[16px] leading-[1.2] font-bold tracking-[-0.02em]">{k.name}</span>
          <span className="flex flex-wrap gap-1">
            {showClass && k.class_name ? <Tag onWhite>{shortClassName(k.class_name)}</Tag> : null}
            {st ? (
              <Tag onWhite tone={k.notOnboarded ? "gray" : "navy"}>
                {k.notOnboarded ? "가입 전" : LEVEL_NAMES[st.level - 1]}
              </Tag>
            ) : !k.class_name && !k.classPending ? (
              <Tag onWhite>반 없음</Tag>
            ) : null}
          </span>
        </div>
      </div>
      {extra.length > 0 ? (
        <div className="-mt-1 flex flex-wrap gap-1">
          {extra.map((t) => (
            <Tag key={t.text} tone={t.tone} onWhite>
              {t.text}
            </Tag>
          ))}
        </div>
      ) : null}
      {st ? (
        <>
          {/* mt-auto: in a row of cards of different heights the numbers and the button line up at the bottom. */}
          <div className="mt-auto grid grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11.5px] text-mute">4주 출석</span>
              <b className={`text-[20px] leading-[1.15] tracking-[-0.02em] ${lowAttendance(st) ? "text-danger" : ""}`}>
                {st.weeks.length > 0 ? st.attended : "–"}
                {st.weeks.length > 0 ? <span className="ml-px text-[12.5px] font-medium text-faint">/{st.weeks.length}</span> : null}
              </b>
            </div>
            <div className="flex flex-col gap-0.5 border-l border-track pl-3">
              <span className="text-[11.5px] text-mute">물방울</span>
              <b className="text-[20px] leading-[1.15] tracking-[-0.02em]">
                {st.drops}
                <span className="ml-px text-[12.5px] font-medium text-faint">/{cap}</span>
              </b>
            </div>
          </div>
          <Link
            href={`/staff/children/${k.id}`}
            aria-label={`${k.name} 정보 보기`}
            className="relative grid h-9 place-items-center rounded-xl bg-white text-[13px] font-bold text-ink2 no-underline after:absolute after:inset-x-0 after:-inset-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            정보 보기
          </Link>
        </>
      ) : null}
    </li>
  );
}

/* ---------- wide screens: table and side panel ---------- */

function Dots({ st }: { st: ChildStat }) {
  const pad = Math.max(0, 4 - st.weeks.length);
  return (
    <span role="img" aria-label={st.weeks.length > 0 ? `최근 ${st.weeks.length}주 중 ${st.attended}번 출석` : "출석 기록 없음"} className="flex gap-1">
      {Array.from({ length: pad }, (_, i) => (
        <span key={`pad-${i}`} className="h-2 w-2 rounded-full border border-track" />
      ))}
      {st.weeks.map((w) => (
        <span key={w.date} className={`h-2 w-2 rounded-full ${w.status === "present" || w.status === "late" ? "bg-bar" : "bg-faint/40"}`} />
      ))}
    </span>
  );
}

function KidTable({ kids, stats, v }: { kids: ChildListItem[]; stats: Map<number, ChildStat>; v: View }) {
  const th = "border-b border-line px-2.5 py-[9px] text-left text-[12px] font-medium whitespace-nowrap text-mute";
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th scope="col" className={th}>
            이름
          </th>
          <th scope="col" className={th}>
            반
          </th>
          <th scope="col" className={th}>
            학교
          </th>
          <th scope="col" className={th}>
            최근 4주
          </th>
          <th scope="col" className={th}>
            나무
          </th>
          <th scope="col" className={th}>
            포인트
          </th>
          <th scope="col" className={th}>
            상태
          </th>
        </tr>
      </thead>
      <tbody>
        {kids.map((k) => {
          const st = stats.get(k.id);
          const on = v.id === k.id;
          const td = `border-b border-line p-2.5 ${on ? "bg-navy-tint" : ""}`;
          const tags = statusTags(k, st);
          return (
            <tr key={k.id} className="[&:last-child>td]:border-b-0">
              <td className={td}>
                {k.canOpen ? (
                  <Link href={href(v, { id: on ? null : k.id })} scroll={false} aria-current={on ? "true" : undefined} className="font-bold text-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">
                    {k.name}
                  </Link>
                ) : (
                  <b>{k.name}</b>
                )}
              </td>
              <td className={`${td} whitespace-nowrap`}>{k.class_name ? shortClassName(k.class_name) : k.classPending ? "반 미정" : "반 없음"}</td>
              <td className={td}>{st ? (st.school ?? <span className="text-mute">미입력</span>) : <span className="text-faint">–</span>}</td>
              <td className={td}>{st ? <Dots st={st} /> : <span className="text-faint">–</span>}</td>
              <td className={`${td} whitespace-nowrap`}>{st ? LEVEL_NAMES[st.level - 1] : <span className="text-faint">–</span>}</td>
              <td className={td}>{st ? st.points : <span className="text-faint">–</span>}</td>
              <td className={td}>
                <span className="flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <Tag key={t.text} tone={t.tone} onWhite={on && t.tone === "gray"}>
                      {t.text}
                    </Tag>
                  ))}
                  {tags.length === 0 && k.canOpen ? <Tag tone="navy">활동 중</Tag> : null}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const METHOD: Record<string, string> = { in_person: "만남", phone: "전화", message: "문자" };

/** The side panel of the table: a child's summary without leaving the list. */
function SidePanel({ c, st, homeroom, v }: { c: ChildDetail; st: ChildStat | undefined; homeroom: string[]; v: View }) {
  const profile = `/staff/children/${c.id}`;
  const last = c.visits?.[0];
  const contact = c.guardian_phone ? `보호자 ${c.guardian_phone}` : c.phone ? c.phone : "미입력";
  return (
    <Box className="sticky top-4">
      <div className="flex items-center gap-3">
        <TreeAvatar level={st?.level ?? c.tree.level} photo={c.photo_url} size={60} onWhite />
        <div className="flex min-w-0 grow flex-col">
          <b className="truncate text-[18px] tracking-[-0.02em]">{c.name}</b>
          <span className="text-[13px] text-mute">
            {c.class_name ?? (c.self_joined ? "반 미정" : "반 없음")}
            {homeroom.length > 0 ? ` · 담임 ${homeroom.join(", ")}` : ""}
          </span>
        </div>
        <Link href={href(v, { id: null })} scroll={false} aria-label="닫기" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mute no-underline hover:bg-white focus-visible:outline-2 focus-visible:outline-navy">
          <LineIcon name="close" size={18} />
        </Link>
      </div>
      <Segmented
        onGray
        label={`${c.name} 정보`}
        items={[
          { href: `${profile}?tab=info`, label: "정보", on: true },
          ...(c.visits ? [{ href: `${profile}?tab=visits`, label: `심방 ${c.visits.length}`, on: false }] : []),
          { href: `${profile}?tab=activity`, label: "활동", on: false },
        ]}
      />
      <div>
        <InfoField onGray label="태어난 해">
          {c.birth_date ? `${c.birth_date.slice(0, 4)}년` : c.birth_year ? `${c.birth_year}년` : "미입력"}
        </InfoField>
        <InfoField onGray label="연락처">
          {contact}
        </InfoField>
        <InfoField onGray label="가장 친한 친구">
          {c.best_friend ?? "미입력"}
        </InfoField>
        <InfoField onGray label="휴대폰">
          {c.has_phone ? `있음 · ${c.onboarded_on ? "가입 완료" : "가입 전"}` : "없음 · 선생님이 대신 입력"}
        </InfoField>
      </div>
      {last ? (
        <div className="rounded-[14px] bg-white px-3.5 py-3 text-[13px] leading-[1.5]">
          <b>
            최근 심방 · {shortDate(last.visited_on)} {METHOD[last.method]}
          </b>
          <p className="m-0 line-clamp-3 whitespace-pre-line text-mute">{last.content}</p>
        </div>
      ) : null}
      <div className="mt-1 flex gap-2">
        {c.can.edit ? (
          <BarLink href={`${profile}/edit`} tone="white" className="min-w-0 flex-1">
            정보 고치기
          </BarLink>
        ) : null}
        {c.can.writeVisits && c.active ? (
          <BarLink href={`${profile}?tab=visits&visit=new#visits`} tone="solid" className="min-w-0 flex-1">
            심방 기록 쓰기
          </BarLink>
        ) : (
          <BarLink href={profile} tone="solid" className="min-w-0 flex-1">
            자세히 보기
          </BarLink>
        )}
      </div>
    </Box>
  );
}

/* ---------- "+" sheet: choose a child for a visit note or a mission ---------- */

const PICK: Record<Pick, { title: string; ask: string; to: (id: number) => string }> = {
  visit: { title: "심방 기록 쓰기", ask: "누구의 심방 기록을 쓸까요?", to: (id) => `/staff/children/${id}?tab=visits&visit=new#visits` },
  proxy: { title: "미션 대신 입력", ask: "누가 한 미션을 대신 입력할까요?", to: (id) => `/staff/children/${id}?tab=activity#proxy` },
};

async function PickPage({ v, pick }: { v: View; pick: Pick }) {
  const staff = await requireStaff();
  // Only teachers who may do it get the picker, and only the children they may do it for are listed.
  if (!(pick === "visit" ? canWriteAnyVisits(staff) : hasScope(approveScope(staff)))) redirect("/staff/children");
  const all = await listChildren(staff, { q: v.q, classId: v.classId });
  const kids = all.filter((k) => k.active && (pick === "visit" ? canWriteVisits(staff, k.class_id) : canApprove(staff, k.class_id)));
  const [stats, classes] = await Promise.all([childStats(staff, kids.map((k) => k.id)), homeKind(staff) === "all" ? listClasses(db) : []]);
  return (
    <Page narrow>
      <PageHeader back="/staff" backLabel="홈으로 돌아가기" title={PICK[pick].title} />
      <p className="m-0 text-[15px] font-semibold text-ink2">{PICK[pick].ask}</p>
      <div className="flex flex-col gap-1">
        <SearchBox v={v} id="pick-q" />
        {classes.length > 1 ? (
          <div className="flex">
            <ClassPicker v={v} classes={classes} id="pick-class" />
          </div>
        ) : null}
      </div>
      <List>
        {kids.map((k) => (
          <ListRow key={k.id} href={PICK[pick].to(k.id)} left={<TreeAvatar level={stats.get(k.id)?.level ?? 1} photo={k.photo_url} size="m" />} title={k.name} sub={`${k.class_name ?? "반 없음"}${k.noPhone ? " · 휴대폰 없음" : ""}`} right={<Chevron />} />
        ))}
      </List>
      {kids.length === 0 ? <EmptyNote>찾는 아이가 없어요.</EmptyNote> : null}
    </Page>
  );
}

/* ---------- page ---------- */

export default async function ChildrenPage({ searchParams }: PageProps<"/staff/children">) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const isAdmin = staff.role === "admin";
  // "새로 가입한 아이": for teachers who see every class (부장, 교역자). Children without a class are invisible to the others.
  const seesNew = canSeeNewJoiners(staff);
  const kind = homeKind(staff);
  const f: Filter = sp.f === "absent" || sp.f === "before" || (sp.f === "other" && kind === "class") ? sp.f : "all";
  const v: View = {
    q: typeof sp.q === "string" ? sp.q.trim().slice(0, 30) : "",
    // A homeroom teacher's own class needs no class picker; it is offered for the other classes only.
    classId: kind === "class" && f !== "other" ? null : toInt(sp.class),
    inactive: isAdmin && sp.inactive === "1",
    onlyNew: seesNew && sp.new === "1",
    f: kind === "none" ? "all" : f,
    search: sp.s === "1",
    pick: sp.pick === "visit" || sp.pick === "proxy" ? sp.pick : null,
    id: toInt(sp.id),
  };
  if (v.pick) return <PickPage v={v} pick={v.pick} />;

  const [classes, everyone, newCount, settings] = await Promise.all([listClasses(db), listChildren(staff, { q: v.q, classId: v.classId, includeInactive: v.inactive, onlyNew: v.onlyNew }), newJoinerCount(staff), getSettings()]);
  const stats = await childStats(staff, everyone.map((k) => k.id));

  // A homeroom teacher starts with their own class; the other classes (names only) are one chip away,
  // and a search by name looks through everyone, as before.
  const mine = everyone.filter((k) => k.canOpen);
  const others = everyone.filter((k) => !k.canOpen);
  const home = kind !== "class" || v.q ? everyone : mine;
  const absent = home.filter((k) => (stats.get(k.id)?.absentWeeks ?? 0) >= 2);
  const before = home.filter((k) => k.notOnboarded);
  const shown = v.f === "other" ? others : v.f === "absent" ? absent : v.f === "before" ? before : home;
  const showClass = kind !== "class" || v.f === "other" || v.q !== "";
  const anyFlag = shown.some((k) => {
    const st = stats.get(k.id);
    return st !== undefined && (st.absentWeeks >= 2 || st.worries > 0);
  });

  const title = v.onlyNew ? "새로 가입한 아이" : kind === "class" ? "우리 반" : "교적부";
  const panel = v.id !== null ? await getChildDetail(staff, v.id) : null;
  const panelHomeroom = panel ? await homeroomNames(panel.class_id) : [];
  const plain = { f: "all" as Filter, id: null };

  return (
    <Page wide>
      <PageHeader
        title={title}
        count={<span className="hidden lg:inline">{shown.length}명</span>}
        sub={kind === "none" ? "이름과 반만 볼 수 있어요" : undefined}
        right={
          <>
            {/* From lg: the search box and the admin's buttons, as in the top bar of the mock. */}
            <span className="hidden items-center gap-2.5 lg:flex">
              <SearchBox v={v} id="c-q-wide" wide />
              {isAdmin ? (
                <>
                  <BarLink href="/staff/admin/cards">QR 카드 인쇄</BarLink>
                  <BarLink href="/staff/children/new" tone="solid">
                    + 아이 추가
                  </BarLink>
                </>
              ) : null}
            </span>
            {/* Below lg: round buttons. */}
            <span className="flex items-center lg:hidden">
              {isAdmin ? <RoundLink href="/staff/children/new" label="아이 추가" icon="plus" /> : null}
              <RoundLink href={href(v, { search: !v.search })} label={v.search ? "찾기 닫기" : "이름으로 찾기"} icon={v.search ? "close" : "search"} />
            </span>
          </>
        }
      />
      <FlashNote ok={sp.ok} error={sp.error} />
      {v.search || v.q ? (
        <div className="sm:max-w-[420px] lg:hidden">
          <SearchBox v={v} id="c-q" autoFocus={v.search && !v.q} />
        </div>
      ) : null}
      {v.q ? (
        <p className="m-0 -my-1 text-[13px] text-mute">
          ‘{v.q}’ 찾은 결과예요.{" "}
          <Link href={href(v, { q: "", search: false })} className="font-bold text-navy">
            전체 보기
          </Link>
        </p>
      ) : null}

      <Chips label="골라 보기">
        <Chip href={href(v, { ...plain, onlyNew: false })} on={v.f === "all" && !v.onlyNew}>
          전체 {v.onlyNew ? "" : home.length}
        </Chip>
        {kind !== "none" && !v.onlyNew ? (
          <>
            <Chip href={href(v, { ...plain, f: "absent" })} on={v.f === "absent"}>
              결석 {absent.length}
            </Chip>
            <Chip href={href(v, { ...plain, f: "before" })} on={v.f === "before"}>
              가입 전 {before.length}
            </Chip>
          </>
        ) : null}
        {kind === "class" && !v.q ? (
          <Chip href={href(v, { ...plain, f: "other" })} on={v.f === "other"}>
            다른 반 {others.length}
          </Chip>
        ) : null}
        {seesNew && (newCount > 0 || v.onlyNew) ? (
          <Chip href={href(v, { ...plain, onlyNew: true })} on={v.onlyNew}>
            새로 가입 {newCount}
          </Chip>
        ) : null}
        {kind !== "class" || v.f === "other" ? <ClassPicker v={v} classes={classes} id="c-class" /> : null}
      </Chips>
      {v.onlyNew ? <Notice tone="navy">함께 쓰는 QR로 가입한 아이예요. 반과 동의서를 확인해 주세요.</Notice> : null}
      {v.f === "other" ? <p className="m-0 -my-1 text-[13px] text-mute">다른 반 아이는 이름과 반만 볼 수 있어요.</p> : null}

      {/* Below lg: cards. One across on a folded cover screen, two on a phone, three or four on an unfolded phone or a tablet. */}
      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 max-[329px]:grid-cols-1 sm:grid-cols-3 min-[840px]:grid-cols-4 lg:hidden">
        {shown.map((k) => (
          <KidCard key={k.id} k={k} st={stats.get(k.id)} cap={settings.weeklyDropCap} showClass={showClass} />
        ))}
      </ul>
      {anyFlag ? <p className="m-0 text-[12px] leading-[18px] text-mute lg:hidden">빨간 점은 2주 넘게 결석, 파란 점은 새 고민이 있다는 표시예요.</p> : null}

      {/* wide screens */}
      <div className="hidden grid-cols-[minmax(0,1fr)_304px] items-start gap-3.5 lg:grid">
        <Card>{shown.length > 0 ? <KidTable kids={shown} stats={stats} v={v} /> : <EmptyNote>{v.onlyNew ? "새로 가입한 아이가 없어요." : "찾는 아이가 없어요."}</EmptyNote>}</Card>
        {panel ? (
          <SidePanel c={panel} st={stats.get(panel.id)} homeroom={panelHomeroom} v={v} />
        ) : (
          <Box>
            <p className="m-0 py-6 text-center text-[13px] leading-[1.5] whitespace-pre-line text-mute">{v.id !== null ? "이 아이의 정보는 볼 수 없어요." : kind === "none" ? "이름과 반만 볼 수 있어요." : "표에서 아이 이름을 누르면\n여기에 정보가 열려요."}</p>
          </Box>
        )}
      </div>

      {shown.length === 0 ? <div className="lg:hidden"><EmptyNote>{v.onlyNew ? "새로 가입한 아이가 없어요." : "찾는 아이가 없어요."}</EmptyNote></div> : null}
      {isAdmin ? (
        <p className="m-0 text-[13px]">
          <Link href={href(v, { inactive: !v.inactive, id: null })} className="inline-flex h-11 items-center font-bold text-navy">
            {v.inactive ? "명단에 있는 아이만 보기" : "명단에서 뺀 아이도 보기"}
          </Link>
        </p>
      ) : null}
    </Page>
  );
}
