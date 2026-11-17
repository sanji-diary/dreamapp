import { AdminGrid } from "@/components/staff/AdminMenu";
import { Chevron, ClayIcon, List, ListRow, Page, PageHeader, PillLink, RoundLink, SectionHead, StatTile, TeacherAvatar, Tile, ctaClass } from "@/components/staff/kit";
import { requireStaff } from "@/lib/auth";
import { detailScope } from "@/lib/authz";
import { fifthTab, staffTabs } from "@/lib/staff/access";
import { signOutAction } from "@/lib/staff/actions";
import { longAbsent, newJoinerCount } from "@/lib/staff/children";
import { classStats, sumStats } from "@/lib/staff/home";
import { pendingCount, unreadWorryCount } from "@/lib/staff/review";
import { openEvent } from "@/lib/talents";
import { weekStart } from "@/lib/time";
import { ROLE_NAMES } from "@/lib/types";

export const metadata = { title: "더보기 · 꿈의숲키우기" };

/**
 * 더보기 / 내 정보: who is signed in, the screens that have no tab, and sign-out.
 * It is the fifth tab for teachers who see every class (and for 교사 기본); a homeroom teacher,
 * whose fifth tab is 출석, opens it from the round button on the home screen.
 * Each block is shown only to those who may use it; the pages behind the links check again.
 */
export default async function MorePage() {
  const staff = await requireStaff();
  const tabs = staffTabs(staff);
  const isTab = fifthTab(staff) === "more";
  const scope = detailScope(staff);
  const seesAll = scope === null;
  const [classes, pending, absent, newCount, unread, festival] = await Promise.all([
    classStats(staff, weekStart()),
    seesAll ? pendingCount(staff) : 0,
    seesAll ? longAbsent(staff) : [],
    newJoinerCount(staff),
    tabs.worries ? unreadWorryCount(staff) : 0,
    openEvent(),
  ]);
  const totals = sumStats(classes);
  const scopeText = seesAll ? "모든 반" : classes.length > 0 ? classes.map((c) => c.name).join(", ") : "담당 반 없음";

  return (
    <Page narrow>
      <PageHeader
        title={isTab ? "더보기" : "내 정보"}
        back={isTab ? undefined : "/staff"}
        backLabel="홈으로 돌아가기"
        right={tabs.admin ? <RoundLink href="/staff/admin/settings" label="설정" icon="gear" /> : undefined}
      />
      <Tile className="flex items-center gap-3">
        <TeacherAvatar name={staff.name} size="m" onWhite />
        <div className="flex min-w-0 flex-col">
          <b className="text-[16px] tracking-[-0.02em]">{staff.name} 선생님</b>
          <span className="truncate text-[13px] text-mute">
            {ROLE_NAMES[staff.role]} · {scopeText}
          </span>
        </div>
      </Tile>

      {(tabs.attendance && isTab) || tabs.worries || tabs.admin || festival ? (
        <List>
          {tabs.attendance && isTab ? <ListRow href="/staff/attendance" left={<ClayIcon name="stamp" size="s" />} title="출석 체크" sub="반을 골라 이번 주일 출석 체크하기" right={<Chevron />} /> : null}
          {tabs.worries ? <ListRow href="/staff/worries" left={<ClayIcon name="bubble" size="s" />} title={unread > 0 ? `고민함 · 새 고민 ${unread}건` : "고민함"} sub="아이가 보여 주기로 한 고민이에요" right={<Chevron />} /> : null}
          {festival ? <ListRow href="/staff/festival" left={<ClayIcon name="pouch" size="s" />} title="달란트 결제" sub={`${festival.name} 진행 중`} right={<Chevron />} /> : null}
          {tabs.admin ? (
            <>
              <ListRow href="/staff/admin/worship" left={<ClayIcon name="bible" size="s" />} title="예배 순서" sub="이번 주 예배와 암송 말씀" right={<Chevron />} />
              <ListRow href="/staff/admin/posts" left={<ClayIcon name="leaf" size="s" />} title="소식" sub="숲 소식 올리기, 댓글 관리" right={<Chevron />} />
            </>
          ) : null}
        </List>
      ) : null}

      {seesAll ? (
        <section className="flex flex-col gap-2.5">
          <SectionHead>부서 현황</SectionHead>
          <div className="grid grid-cols-3 gap-2">
            <StatTile value={totals.recorded > 0 && totals.kids > 0 ? `${Math.round((totals.present / totals.kids) * 100)}%` : "–"} label="지난 주일 출석" tone="blue" href={tabs.attendance ? "/staff/attendance" : undefined} />
            <StatTile value={`${pending}건`} label="확인할 미션" href="/staff/approvals" />
            <StatTile value={`${absent.length}명`} label="장기 결석" tone={absent.length > 0 ? "danger" : undefined} href="/staff/children?f=absent" />
          </div>
        </section>
      ) : null}

      {newCount > 0 ? (
        <List>
          <ListRow left={<ClayIcon name="bird" size="s" />} title={`새로 가입한 아이 ${newCount}명`} sub="반 배정과 동의서 확인하기" right={<PillLink href="/staff/children?new=1" label="새로 가입한 아이 보기">보기</PillLink>} />
        </List>
      ) : null}

      {tabs.admin ? (
        <section className="flex flex-col gap-3">
          <SectionHead note="관리자만 보여요">운영</SectionHead>
          <AdminGrid />
        </section>
      ) : null}

      <span className="grow" />
      <form action={signOutAction}>
        <button type="submit" className={ctaClass("gray")}>
          로그아웃
        </button>
      </form>
    </Page>
  );
}
