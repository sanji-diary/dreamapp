import Link from "next/link";
import { Empty, Face, Flash, SmallLink, TabHeader } from "@/components/staff/ui";
import { AutoForm } from "@/components/staff/widgets";
import { Chevron, Row, Tag } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { canSeeNewJoiners, listChildren, newJoinerCount } from "@/lib/staff/children";
import { toInt } from "@/lib/staff/util";

export const metadata = { title: "교적부 · 꿈의숲키우기" };

export default async function ChildrenPage({ searchParams }: PageProps<"/staff/children">) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 30) : "";
  const classId = toInt(sp.class);
  const isAdmin = staff.role === "admin";
  const inactive = isAdmin && sp.inactive === "1";
  // "새로 가입한 아이": for teachers who see every class (부장, 교역자). Children without a class are invisible to the others.
  const seesNew = canSeeNewJoiners(staff);
  const onlyNew = seesNew && sp.new === "1";
  const [classes, kids, newCount] = await Promise.all([listClasses(db), listChildren(staff, { q, classId, includeInactive: inactive, onlyNew }), newJoinerCount(staff)]);
  const basic = staff.role === "basic";

  return (
    <>
      <TabHeader
        title={onlyNew ? "새로 가입한 아이" : "교적부"}
        sub={`${kids.length}명${basic ? " · 이름과 반만 볼 수 있어요" : ""}`}
        right={isAdmin ? <SmallLink href="/staff/children/new" width={74}>아이 등록</SmallLink> : null}
      />
      <Flash ok={sp.ok} error={sp.error} />
      <AutoForm className="flex items-center gap-2 px-4 pt-3">
        <label className="sr-only" htmlFor="c-q">
          이름으로 찾기
        </label>
        <input id="c-q" name="q" type="search" defaultValue={q} placeholder="이름으로 찾기" enterKeyHint="search" className="h-11 min-w-0 grow-[2] basis-0 rounded-[22px] border-0 bg-fill px-4 text-[15px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-navy" />
        <label className="sr-only" htmlFor="c-class">
          반
        </label>
        <select id="c-class" name="class" defaultValue={classId ?? ""} className="h-11 min-w-0 grow basis-0 rounded-[22px] border-0 bg-fill px-3 text-[14px] font-bold text-ink outline-none focus-visible:outline-2 focus-visible:outline-navy">
          <option value="">전체 반</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {inactive ? <input type="hidden" name="inactive" value="1" /> : null}
        {onlyNew ? <input type="hidden" name="new" value="1" /> : null}
      </AutoForm>
      {seesNew && (newCount > 0 || onlyNew) ? (
        <Link
          href={onlyNew ? "/staff/children" : "/staff/children?new=1"}
          aria-pressed={onlyNew}
          className={`mx-4 mt-2.5 flex min-h-12 items-center gap-2 rounded-xl px-3.5 py-2 no-underline ${onlyNew ? "bg-navy text-white" : "bg-navy-tint text-navy"}`}
        >
          <span className="flex min-w-0 grow flex-col">
            <span className="text-[15px] leading-5 font-bold">{onlyNew ? "전체 명단 보기" : `새로 가입한 아이 ${newCount}명`}</span>
            <span className={`text-[12px] leading-[18px] ${onlyNew ? "text-white/80" : "text-sub"}`}>{onlyNew ? "함께 쓰는 QR로 가입한 아이만 보고 있어요" : "함께 쓰는 QR로 가입했어요. 반과 동의서를 확인해 주세요"}</span>
          </span>
          {onlyNew ? null : <Chevron />}
        </Link>
      ) : null}
      <ul className="m-0 flex list-none flex-col px-4 py-0">
        {kids.map((k, i) => {
          const row = (
            <Row
              left={<Face name={k.name} id={k.id} photo={k.photo_url} />}
              title={k.name}
              sub={k.class_name ?? (k.classPending ? "반 미정" : "반 없음")}
              subTone={k.classPending ? "danger" : undefined}
              last={i === kids.length - 1}
              extra={
                <>
                  {k.noPhone ? <Tag>휴대폰 없음</Tag> : null}
                  {k.notOnboarded ? <Tag tone="warn">시작 전</Tag> : null}
                  {k.needsConsent ? <Tag tone="warn">동의서 확인 필요</Tag> : null}
                  {!k.active ? <Tag tone="danger">명단 제외</Tag> : null}
                </>
              }
              right={k.canOpen ? <Chevron /> : null}
            />
          );
          return (
            <li key={k.id}>
              {k.canOpen ? (
                <Link href={`/staff/children/${k.id}`} className="block text-inherit no-underline">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      {kids.length === 0 ? <Empty>{onlyNew ? "새로 가입한 아이가 없어요." : "찾는 아이가 없어요."}</Empty> : null}
      {isAdmin ? (
        <p className="m-0 px-4 pt-2 pb-6 text-[13px]">
          <Link href={inactive ? "/staff/children" : "/staff/children?inactive=1"} className="inline-flex h-11 items-center font-bold text-navy">
            {inactive ? "명단에 있는 아이만 보기" : "명단에서 뺀 아이도 보기"}
          </Link>
        </p>
      ) : null}
    </>
  );
}
