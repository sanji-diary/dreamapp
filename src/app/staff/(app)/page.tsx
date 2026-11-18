import Link from "next/link";
import { rowClass, tableClass, tdClass, thClass } from "@/components/staff/admin-kit";
import { ForestScene, type ForestTree } from "@/components/staff/Forest";
import { BarLink, ClayIcon, EmptyNote, Kpi, LineIcon, List, ListRow, Page, PageHeader, PillLink, ProgressBar, SectionHead, Tag, TeacherAvatar, barButtonClass, pageColumn } from "@/components/staff/kit";
import { requireStaff } from "@/lib/auth";
import { listPosts, recentNotices, type NoticeRow, type PostRow } from "@/lib/staff/admin-misc";
import { attendanceTrend, forestLevel, homeData, pickTrees, type HomeData, type SundayCount, type Totals, type WeekRef } from "@/lib/staff/home";
import { OVERDUE_DAYS } from "@/lib/staff/review";
import { shortDate } from "@/lib/staff/util";
import { openEvent } from "@/lib/talents";
import { formatKoreanDate, todayKst } from "@/lib/time";
import type { WorryAudience } from "@/lib/types";

export const metadata = { title: "교사 홈 · 꿈의숲키우기" };

const SENT_TO: Record<WorryAudience, string> = { teacher: "선생님에게 보냄", pastor: "전도사님에게 보냄", both: "선생님과 전도사님에게 보냄" };

interface Todo {
  key: string;
  icon: string;
  title: string;
  sub: string;
  href: string;
  /** Word on the navy button. */
  action: string;
  /** Opening a worry records that it was read, so those links are never prefetched. */
  prefetch?: boolean;
  /** Shown only in the wide dashboard: on phones the two tiles above the list already say it. */
  wideOnly?: boolean;
}

/** What is waiting for this teacher right now, most pressing first. */
function todos(d: HomeData, isSunday: boolean): Todo[] {
  const out: Todo[] = [];
  if (d.canAttend && d.unchecked > 0) {
    out.push({ key: "att", icon: "stamp", title: `출석 체크 ${d.unchecked}명 남았어요`, sub: isSunday ? "오늘 주일 출석을 체크해 주세요" : `${shortDate(d.thisWeek)} 주일 출석이 비어 있어요`, href: "/staff/attendance", action: "체크", wideOnly: true });
  }
  if (d.pending.total > 0) {
    const texts = d.pending.total - d.pending.photos;
    const parts = [d.pending.photos > 0 ? `사진 ${d.pending.photos}` : null, texts > 0 ? `글 ${texts}` : null].filter(Boolean);
    out.push({ key: "missions", icon: "bible", title: `미션 확인 ${d.pending.total}건`, sub: `${parts.join(" · ")} · 확인하면 물방울이 가요`, href: "/staff/approvals", action: "확인", wideOnly: true });
  }
  if (d.overdue.count > 0 && d.overdue.oldest) {
    // Shown on phones too: the "미션 확인" tile says how many wait, not how long.
    out.push({
      key: "overdue",
      icon: "bible",
      title: `${d.overdue.count}건이 ${OVERDUE_DAYS}일 넘게 확인을 기다려요`,
      sub: `${d.overdue.classes.slice(0, 2).join(" · ")}${d.overdue.classes.length > 2 ? ` 외 ${d.overdue.classes.length - 2}반` : ""} · ${shortDate(d.overdue.oldest)}부터 · 대신 확인할 수 있어요`,
      href: "/staff/approvals",
      action: "확인",
    });
  }
  if (d.worries.length > 0) {
    const names = [...new Set(d.worries.map((w) => w.child_name))];
    const one = d.worries.length === 1;
    out.push({
      key: "worries",
      icon: "bubble",
      title: `새 고민 ${d.worries.length}건`,
      sub: one ? `${names[0]} · ${SENT_TO[d.worries[0].audience]}` : `${names.slice(0, 2).join(" · ")}${names.length > 2 ? ` 외 ${names.length - 2}명` : ""}`,
      href: one ? `/staff/worries/${d.worries[0].id}` : "/staff/worries",
      action: "읽기",
      prefetch: false,
    });
  }
  if (d.absent.length > 3) {
    const names = d.absent.map((k) => k.name);
    out.push({ key: "absent", icon: "house", title: `장기 결석 ${d.absent.length}명`, sub: `${names.slice(0, 2).join(" · ")} 외 ${names.length - 2}명`, href: "/staff/children?f=absent", action: "보기" });
  } else {
    for (const k of d.absent) {
      out.push({
        key: `absent-${k.id}`,
        icon: "house",
        title: `${k.name} ${k.weeks}주 결석`,
        sub: k.canWriteVisit ? "연락하고 심방 기록 남기기" : `${k.class_name ?? "반 없음"} · 연락이 필요해요`,
        href: k.canWriteVisit ? `/staff/children/${k.id}?tab=visits&visit=new#visits` : `/staff/children/${k.id}`,
        action: k.canWriteVisit ? "기록" : "보기",
      });
    }
  }
  if (d.reports > 0) out.push({ key: "reports", icon: "badge", title: `신고된 댓글 ${d.reports}건`, sub: "숲 소식 댓글을 확인해 주세요", href: "/staff/approvals?tab=comments", action: "확인" });
  if (d.joiners > 0) out.push({ key: "joiners", icon: "bird", title: `새로 가입한 아이 ${d.joiners}명`, sub: "반 배정과 동의서 확인하기", href: "/staff/children?new=1", action: "보기" });
  return out;
}

function TodoRows({ items, wide = false }: { items: Todo[]; wide?: boolean }) {
  return (
    <List>
      {items.map((t) => (
        <ListRow
          key={t.key}
          compact={wide}
          left={<ClayIcon name={t.icon} size={wide ? "xs" : "s"} onWhite={wide} />}
          title={t.title}
          sub={t.sub}
          right={
            <PillLink href={t.href} prefetch={t.prefetch} label={`${t.title} ${t.action}`}>
              {t.action}
            </PillLink>
          }
        />
      ))}
    </List>
  );
}

/** A past week, read-only: how many came, how many drops, how many missions. */
function PastRows({ week, past, wide = false }: { week: WeekRef; past: Totals; wide?: boolean }) {
  const size = wide ? "xs" : "s";
  return (
    <List>
      <ListRow
        compact={wide}
        left={<ClayIcon name="stamp" size={size} onWhite={wide} />}
        title={past.recorded > 0 ? `출석 ${past.present}명` : "출석 기록이 없어요"}
        sub={`${formatKoreanDate(week.start)}${past.recorded > 0 ? ` · ${past.recorded}명 체크했어요` : ""}`}
      />
      <ListRow compact={wide} left={<ClayIcon name="drop" size={size} onWhite={wide} />} title={`물방울 ${past.drops}개`} sub="그 주에 미션으로 모았어요" />
      <ListRow compact={wide} left={<ClayIcon name="bible" size={size} onWhite={wide} />} title={`미션 ${past.approved}건 완료`} sub="확인까지 끝난 미션이에요" />
    </List>
  );
}

/** ‹ › : one week back or forward with ?w=. There is no going past this week. */
function WeekNav({ week, thisWeek, onGray = false }: { week: WeekRef; thisWeek: string; onGray?: boolean }) {
  const href = (w: string) => (w === thisWeek ? "/staff" : `/staff?w=${w}`);
  const box = "group grid h-11 w-11 place-items-center outline-none";
  const dot = `grid h-8 w-8 place-items-center rounded-full text-sub group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-staff ${onGray ? "bg-white" : "bg-fill"}`;
  return (
    <div className="-mr-1.5 flex shrink-0 items-center">
      {week.prev ? (
        <Link href={href(week.prev)} scroll={false} aria-label="지난주 보기" className={box}>
          <span className={dot}>
            <LineIcon name="back" size={16} />
          </span>
        </Link>
      ) : null}
      {week.next ? (
        <Link href={href(week.next)} scroll={false} aria-label="다음 주 보기" className={box}>
          <span className={dot}>
            <LineIcon name="next" size={16} />
          </span>
        </Link>
      ) : (
        <span aria-hidden="true" className={`${box} opacity-40`}>
          <span className={dot}>
            <LineIcon name="next" size={16} />
          </span>
        </span>
      )}
    </div>
  );
}

/** Shown to every teacher, but only while a 달란트 잔치 is open. */
function FestivalBanner({ name }: { name: string }) {
  return (
    <Link href="/staff/festival" className="flex min-h-[72px] items-center gap-3 rounded-[20px] bg-staff px-4 py-3 text-white no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
      <ClayIcon name="pouch" size="s" onWhite />
      <span className="flex min-w-0 grow flex-col">
        <b className="text-[16px] tracking-[-0.02em]">달란트 결제하기</b>
        <span className="truncate text-[13px] text-white/85">{name} 진행 중</span>
      </span>
      <LineIcon name="next" />
    </Link>
  );
}

function Notices({ notices }: { notices: NoticeRow[] }) {
  if (notices.length === 0) return null;
  return (
    <section className="flex flex-col">
      <SectionHead>공지</SectionHead>
      {notices.map((n) => (
        <div key={n.id} className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {n.staff_only ? <Tag tone="navy">교사용</Tag> : null}
            {n.important ? <Tag tone="warn">중요</Tag> : null}
            <b className="min-w-0 text-[15px]">{n.title}</b>
          </div>
          {n.body ? <p className="m-0 text-[14px] leading-[21px] whitespace-pre-line text-ink2">{n.body}</p> : null}
          <span className="text-[13px] text-mute">
            {n.event_date ? `${shortDate(n.event_date)} 행사 · ` : ""}
            {shortDate(n.created_on)} 올림
          </span>
        </div>
      ))}
    </section>
  );
}

/** The round button with the teacher's initial: opens "내 정보" (profile, sign-out). */
function MeLink({ name }: { name: string }) {
  return (
    <Link href="/staff/more" aria-label="내 정보" className="group -mt-0.5 -mr-0.5 grid h-11 w-11 shrink-0 place-items-center no-underline outline-none">
      <span className="rounded-full shadow-[0_2px_10px_rgba(25,31,40,0.1)] group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-staff">
        <TeacherAvatar name={name} size="round" onWhite />
      </span>
    </Link>
  );
}

/** The white card of the wide screens. */
const cardClass = "flex flex-col rounded-2xl border border-staff-line bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04)]";

/**
 * 주일 출석 over the last eight Sundays, one bar each; the latest is drawn in the accent, the others
 * lighter. Pointing at a bar shows its date and count; the same numbers are in a table for screen readers.
 */
function AttendanceChart({ trend, kids }: { trend: SundayCount[]; kids: number }) {
  const top = Math.max(10, Math.ceil(Math.max(kids, ...trend.map((w) => w.present)) / 10) * 10);
  const H = 176;
  const marked = trend.filter((w) => w.recorded > 0);
  const avg = marked.length > 0 ? Math.round((marked.reduce((n, w) => n + w.present, 0) / marked.length) * 10) / 10 : null;
  const best = marked.reduce<SundayCount | null>((b, w) => (b === null || w.present > b.present ? w : b), null);
  const last = trend.length - 1;
  return (
    <section aria-labelledby="trend-h" className={`${cardClass} min-w-0 grow-[2] basis-0 gap-3.5 px-[22px] pt-[18px] pb-[18px]`}>
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h2 id="trend-h" className="m-0 text-[18px] font-bold tracking-[-0.02em]">
          주일 출석 · 최근 8주
        </h2>
        <span className="text-[13.5px] text-mute">지금 반에 있는 아이 {kids}명</span>
      </div>
      <div aria-hidden="true" className="relative flex gap-2 pl-7" style={{ height: H + 52 }}>
        <div className="pointer-events-none absolute inset-x-0" style={{ top: 24, height: H }}>
          {[top / 2, top].map((v) => (
            <div key={v} className="absolute inset-x-0 flex items-center gap-1.5" style={{ bottom: Math.round((v / top) * H) - 6 }}>
              <span className="w-[22px] text-right text-[11.5px] text-mute">{v}</span>
              <span className="h-px grow bg-[#f0f2f6]" />
            </div>
          ))}
        </div>
        {trend.map((w, i) => {
          const h = w.recorded > 0 ? Math.max(2, Math.round((w.present / top) * H)) : 0;
          const [, m, dd] = w.week.split("-");
          return (
            <div key={w.week} className="group relative flex min-w-0 flex-1 flex-col">
              <div className="relative flex flex-col items-center justify-end" style={{ height: H + 24 }}>
                {i === last && w.recorded > 0 ? <span className="mb-1 text-[12.5px] font-bold text-ink group-hover:invisible">{w.present}명</span> : null}
                <span className={`w-full max-w-[34px] rounded-t ${i === last ? "bg-staff" : "bg-staff/30 group-hover:bg-staff/50"}`} style={{ height: h }} />
                <span className="absolute left-1/2 z-[2] hidden -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] whitespace-nowrap text-white shadow-[0_6px_16px_rgba(17,24,39,0.2)] group-hover:block" style={{ bottom: h + 8 }}>
                  {Number(m)}월 {Number(dd)}일 · <b>{w.recorded > 0 ? `${w.present}명` : "기록 없음"}</b>
                </span>
              </div>
              <span className="h-px bg-[#d5dae2]" />
              <span className={`pt-1.5 text-center text-[12px] whitespace-nowrap ${i === last ? "font-bold text-ink" : "text-mute"}`}>
                {Number(m)}.{Number(dd)}
              </span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>주일 출석 · 최근 8주</caption>
        <tbody>
          {trend.map((w) => (
            <tr key={w.week}>
              <th scope="row">{formatKoreanDate(w.week)}</th>
              <td>{w.recorded > 0 ? `${w.present}명` : "기록 없음"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 border-t border-[#f1f3f6] pt-3 text-[13.5px] text-sub">
        {avg === null || best === null ? (
          "아직 출석 기록이 없어요"
        ) : (
          <>
            기록한 주일 평균 <b className="text-ink">{avg}명</b> · 가장 많이 온 날은 {shortDate(best.week)} <b className="text-ink">{best.present}명</b>이에요
          </>
        )}
      </p>
    </section>
  );
}

/** Admins: the three newest 숲 소식 posts. */
function RecentPosts({ posts }: { posts: PostRow[] }) {
  return (
    <section aria-labelledby="post-h" className={cardClass}>
      <div className="flex min-h-[58px] items-center gap-2.5 px-[22px] pt-3">
        <h2 id="post-h" className="m-0 grow text-[18px] font-bold tracking-[-0.02em]">
          최근 올린 글
        </h2>
        <Link href="/staff/admin/posts" className="inline-flex min-h-9 items-center gap-0.5 text-[14px] font-semibold text-staff no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
          글 목록
          <LineIcon name="next" size={15} />
        </Link>
      </div>
      {posts.length === 0 ? (
        <EmptyNote>아직 올린 글이 없어요.</EmptyNote>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0 px-2.5 pb-2.5">
          {posts.slice(0, 3).map((p) => (
            <li key={p.id}>
              <Link href={`/staff/admin/posts?edit=${p.id}`} className="flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-ink no-underline hover:bg-staff-canvas focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-staff">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={p.image_url} className="h-[60px] w-[60px] shrink-0 rounded-xl object-cover" />
                ) : (
                  <span aria-hidden="true" className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded-xl bg-[#f2f4f8] text-mute">
                    <LineIcon name="list" size={22} stroke={1.7} />
                  </span>
                )}
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <b className="truncate text-[15px] font-semibold">{firstLine(p.body)}</b>
                  <span className="text-[13px] text-mute">{p.created_on ? `${shortDate(p.created_on)} 올림` : "올린 날 모름"}</span>
                  <span className="text-[13px] text-sub">
                    좋아요 {p.likes} · {p.comments_open ? `댓글 ${p.comments.length}` : "댓글 받지 않음"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The first line of a post, for lists. */
function firstLine(body: string): string {
  const line = body.split("\n").find((l) => l.trim()) ?? "";
  return line.trim().slice(0, 60);
}

export default async function StaffHome({ searchParams }: PageProps<"/staff">) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const today = todayKst();
  const [d, notices, festival, posts] = await Promise.all([homeData(staff, { week: sp.w, today }), recentNotices(), openEvent(), staff.role === "admin" ? listPosts(staff) : null]);
  const trend = await attendanceTrend(staff, d.thisWeek);
  const items = todos(d, d.thisWeek === today);
  const teacher = `${staff.name} 선생님`;

  // A teacher without a class (교사 기본): no forest, just the notices and what they can do.
  if (d.kind === "none") {
    return (
      <Page narrow>
        <PageHeader title={teacher} sub={formatKoreanDate(today)} right={<MeLink name={staff.name} />} />
        {festival ? <FestivalBanner name={festival.name} /> : null}
        <section className="flex flex-col">
          <SectionHead>할 수 있는 일</SectionHead>
          <List>
            <ListRow left={<ClayIcon name="leaf" size="s" />} title="아이들 이름과 반 보기" sub="이름으로 찾아볼 수 있어요" right={<PillLink href="/staff/children" label="아이들 이름과 반 보기">보기</PillLink>} />
            {items.map((t) => (
              <ListRow
                key={t.key}
                left={<ClayIcon name={t.icon} size="s" />}
                title={t.title}
                sub={t.sub}
                right={
                  <PillLink href={t.href} prefetch={t.prefetch} label={`${t.title} ${t.action}`}>
                    {t.action}
                  </PillLink>
                }
              />
            ))}
            {d.reports === 0 ? <ListRow left={<ClayIcon name="badge" size="s" />} title="숲 소식 댓글 살피기" sub="신고된 댓글이 생기면 할 일에 보여요" right={<PillLink href="/staff/approvals" tone="gray" label="할 일 열기">열기</PillLink>} /> : null}
          </List>
        </section>
        <Notices notices={notices} />
        <p className="m-0 text-[13px] leading-[19px] text-mute">담당 반이 정해지면 여기에서 우리 반 나무와 이번 주 할 일을 볼 수 있어요.</p>
      </Page>
    );
  }

  const all = d.kind === "all";
  const where = all ? "소년부" : "우리 반";
  const scopeLine = `${all ? "소년부 전체" : d.classes.map((c) => c.name).join(", ")} · ${teacher}`;
  // Phones: a homeroom teacher sees one tree per child (at most eight, the widest range of sizes);
  // teachers who see every class get one tree per class, sized by how far the class is toward its goal.
  const classTrees: ForestTree[] = d.classes.map((c) => ({ key: c.id, level: forestLevel(c.drops, d.classGoal), label: `${c.short} · ${c.drops}` }));
  const kidTrees: ForestTree[] = pickTrees(d.kidTrees).map((k) => ({ key: k.id, level: k.level, label: k.name }));
  const phoneTrees = all ? pickTrees(classTrees) : kidTrees;
  const left = Math.max(0, d.goal - d.totals.drops);
  const dropsLine = d.goal === 0 ? "아직 반이 없어요" : left > 0 ? `이번 주 목표까지 ${left}개 남았어요` : "이번 주 목표를 채웠어요!";
  const attLine = d.totals.recorded > 0 ? `${d.totals.kids}명 중 ${d.totals.present}명` : "아직 안 했어요";
  const missionLine = d.pending.total > 0 ? `${d.pending.total}건 기다려요` : "모두 확인했어요";
  const phoneItems = items.filter((t) => !t.wideOnly);
  const weekTitle = d.week.current ? `${d.week.label} 할 일` : `${d.week.label} 돌아보기`;
  const tileClass = "relative flex min-h-[88px] flex-col rounded-[18px] bg-fill p-3.5 text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff";
  // The clay picture sits in the corner of each tile; on a folded cover screen there is no room beside the words, so it is left out.
  const tileIcon = "absolute right-2.5 bottom-2.5 h-[42px] w-[42px] object-contain max-[359px]:hidden";
  const attTile = (
    <>
      <b className="text-[16px] tracking-[-0.02em]">출석 체크</b>
      <span className="text-[13px] text-mute">{attLine}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/img/icon-stamp.webp" width={42} height={42} className={tileIcon} />
    </>
  );

  // Wide screens: the four numbers.
  const pct = d.totals.kids > 0 ? Math.round((d.totals.present / d.totals.kids) * 100) : 0;
  const diff = d.lastWeekPresent === null ? null : d.totals.present - d.lastWeekPresent;
  const attNote = d.totals.recorded === 0 ? "아직 출석 체크 전이에요" : `${pct}%${diff === null ? "" : diff === 0 ? " · 지난주와 같음" : ` · 지난주보다 ${Math.abs(diff)}명 ${diff > 0 ? "많음" : "적음"}`}`;
  const waiting = d.pending.total + d.worries.length + d.reports;
  const waitingNote = [d.pending.total > 0 ? `미션 ${d.pending.total}` : null, d.worries.length > 0 ? `고민 ${d.worries.length}` : null, d.reports > 0 ? `댓글 ${d.reports}` : null].filter(Boolean).join(" · ") || "모두 확인했어요";

  return (
    <Page flush>
      {/* ---------- phones, folded or unfolded, and tablets ---------- */}
      <div className="flex flex-col pb-6 lg:hidden">
        <ForestScene trees={phoneTrees}>
          <div className="min-w-0 grow">
            <p className="m-0 mb-1.5 line-clamp-2 text-[13px] font-semibold text-sub">{scopeLine}</p>
            <h1 className="m-0 text-[22px] leading-[1.35] font-bold tracking-[-0.035em] max-[339px]:text-[19px]">
              {where} 나무 {d.trees}그루가
              <br />
              자라고 있어요
            </h1>
          </div>
          <MeLink name={staff.name} />
        </ForestScene>
        <div className="relative z-[1] mx-auto -mt-20 flex w-[calc(100%-28px)] max-w-[572px] flex-col gap-2.5 rounded-3xl bg-white p-[18px] shadow-[0_2px_18px_rgba(25,31,40,0.08)] max-[339px]:p-3.5">
          <div className="flex items-center gap-3">
            <h2 className="m-0 grow text-[17px] font-bold tracking-[-0.025em]">{where} 물방울</h2>
            <span className="text-[17px] font-bold text-blue">
              {d.totals.drops} / {d.goal}
            </span>
          </div>
          <ProgressBar value={d.totals.drops} max={d.goal} label={`${where} 물방울`} />
          <span className="text-[13px] text-mute">{dropsLine}</span>
          <div className="mt-1 grid grid-cols-2 gap-2.5">
            {d.canAttend ? (
              <Link href="/staff/attendance" className={tileClass}>
                {attTile}
              </Link>
            ) : (
              <div className={tileClass}>{attTile}</div>
            )}
            <Link href="/staff/approvals" className={tileClass}>
              <b className="text-[16px] tracking-[-0.02em]">미션 확인</b>
              <span className="text-[13px] text-mute">{missionLine}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src="/img/icon-bible.webp" width={42} height={42} className={tileIcon} />
            </Link>
          </div>
        </div>
        {festival ? (
          <div className={`${pageColumn} px-3.5 pt-3`}>
            <FestivalBanner name={festival.name} />
          </div>
        ) : null}
        <section className={`${pageColumn} flex flex-col px-5 pt-[18px]`}>
          <SectionHead right={<WeekNav week={d.week} thisWeek={d.thisWeek} />}>{weekTitle}</SectionHead>
          {d.past ? <PastRows week={d.week} past={d.past} /> : phoneItems.length > 0 ? <TodoRows items={phoneItems} /> : <EmptyNote>지금 기다리는 일이 없어요. 수고하셨어요!</EmptyNote>}
        </section>
        {notices.length > 0 ? (
          <div className={`${pageColumn} px-5 pt-3`}>
            <Notices notices={notices} />
          </div>
        ) : null}
      </div>

      {/* ---------- wide screens (design-reference/admin2/Main.dc.html) ---------- */}
      <div className="hidden flex-col gap-5 lg:flex">
        <PageHeader
          title="홈"
          sub={`${d.week.label} · ${formatKoreanDate(d.thisWeek)} 주일부터`}
          right={
            <span className="flex shrink-0 items-center gap-2.5">
              {d.canAttend ? (
                <BarLink href="/staff/attendance">
                  <LineIcon name="check" size={18} />
                  출석 체크
                </BarLink>
              ) : null}
              {staff.role === "admin" ? (
                <BarLink href="/staff/admin/posts/new" tone="solid">
                  <LineIcon name="pen" size={18} />
                  글쓰기
                </BarLink>
              ) : null}
            </span>
          }
        />
        {festival ? <FestivalBanner name={festival.name} /> : null}
        <div className="grid grid-cols-4 gap-4">
          <Kpi label="지난 주일 출석" value={d.totals.recorded > 0 ? `${d.totals.present} / ${d.totals.kids}` : "–"} note={attNote} tone={diff !== null && diff > 0 ? "blue" : undefined} href={d.canAttend ? "/staff/attendance" : undefined} />
          <Kpi label="확인 기다리는 일" value={`${waiting}건`} note={waitingNote} tone={waiting > 0 ? "danger" : undefined} href="/staff/approvals" />
          <Kpi label="이번 주 미션 참여" value={`${d.participants.did}명`} note={`가입한 ${d.participants.joined}명 중`} />
          <Kpi label="장기 결석" value={`${d.absent.length}명`} note="2주 이상 연속" tone={d.absent.length > 0 ? "danger" : undefined} href="/staff/children?f=absent" />
        </div>
        <div className="flex items-stretch gap-5">
          <section aria-labelledby="todo-h" className={`${cardClass} min-w-0 grow-[3] basis-0`}>
            <div className="flex min-h-[58px] items-center gap-2.5 px-[22px] pt-3">
              <h2 id="todo-h" className="m-0 text-[18px] font-bold tracking-[-0.02em]">
                {d.week.current ? "지금 할 일" : weekTitle}
              </h2>
              {d.week.current && items.length > 0 ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#fff0e5] px-2 text-[13px] font-bold text-badge">{items.length}</span> : null}
              <span className="grow" />
              <WeekNav week={d.week} thisWeek={d.thisWeek} />
            </div>
            <div className="px-2 pb-2">
              {d.past ? (
                <div className="px-3.5">
                  <PastRows wide week={d.week} past={d.past} />
                </div>
              ) : items.length > 0 ? (
                <ul className="m-0 flex list-none flex-col p-0">
                  {items.map((t) => (
                    <li key={t.key} className="flex min-h-[72px] items-center gap-3.5 border-t border-[#f1f3f6] px-3.5 py-2.5">
                      <ClayIcon name={t.icon} size="xs" />
                      <span className="flex min-w-0 grow flex-col leading-[1.4]">
                        <b className="text-[15px] tracking-[-0.02em]">{t.title}</b>
                        <span className="text-[13.5px] text-sub">{t.sub}</span>
                      </span>
                      <Link href={t.href} prefetch={t.prefetch} aria-label={`${t.title} ${t.action}`} className={barButtonClass("ghost")}>
                        {t.action}
                        <LineIcon name="next" size={15} className="text-mute" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>지금 기다리는 일이 없어요. 수고하셨어요!</EmptyNote>
              )}
            </div>
          </section>
          <AttendanceChart trend={trend} kids={d.totals.kids} />
        </div>
        <div className="flex items-start gap-5">
          <section aria-labelledby="cls-h" className={`${cardClass} min-w-0 grow-[3] basis-0`}>
            <div className="flex min-h-[58px] items-center gap-2.5 px-[22px] pt-3">
              <h2 id="cls-h" className="m-0 grow text-[18px] font-bold tracking-[-0.02em]">
                반별 현황
              </h2>
              {staff.role === "admin" ? (
                <Link href="/staff/admin/classes" className="inline-flex min-h-9 items-center gap-0.5 text-[14px] font-semibold text-staff no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff">
                  반 편성
                  <LineIcon name="next" size={15} />
                </Link>
              ) : null}
            </div>
            {d.classes.length === 0 ? (
              <EmptyNote>아직 반이 없어요.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass()}>
                        반
                      </th>
                      <th scope="col" className={thClass()}>
                        이번 주 출석
                      </th>
                      <th scope="col" className={thClass()}>
                        물방울 <span className="font-medium">· 목표 {d.classGoal}개</span>
                      </th>
                      <th scope="col" className={thClass({ center: true })}>
                        확인 끝난 미션
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.classes.map((c) => (
                      <tr key={c.id} className={rowClass}>
                        <th scope="row" className={`${tdClass({ nowrap: true })} text-left font-semibold`}>
                          {c.name}
                        </th>
                        <td className={tdClass()}>
                          <span className="flex items-center gap-2.5">
                            <span className="w-[88px]">
                              <ProgressBar thin value={c.present} max={c.kids} label={`${c.name} 출석`} />
                            </span>
                            <span className="whitespace-nowrap text-ink2">{c.recorded > 0 ? `${c.present} / ${c.kids}명` : "체크 전"}</span>
                          </span>
                        </td>
                        <td className={tdClass()}>
                          <span className="flex items-center gap-2.5">
                            <span className="w-[88px]">
                              <ProgressBar thin soft value={c.drops} max={d.classGoal} label={`${c.name} 물방울`} />
                            </span>
                            <span className="whitespace-nowrap text-ink2">{c.drops}개</span>
                          </span>
                        </td>
                        <td className={tdClass({ center: true })}>{c.approved}건</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="flex min-w-0 grow-[2] basis-0 flex-col gap-5">
            {posts ? <RecentPosts posts={posts} /> : null}
            {notices.length > 0 ? (
              <section className={`${cardClass} px-[22px] pt-3 pb-2`}>
                <Notices notices={notices} />
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </Page>
  );
}
