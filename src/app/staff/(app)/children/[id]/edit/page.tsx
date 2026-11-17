import { notFound } from "next/navigation";
import { ChildForm } from "@/components/staff/ChildForm";
import { FlashNote, Page, PageHeader } from "@/components/staff/kit";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { getChildDetail, listChildren } from "@/lib/staff/children";
import { toInt } from "@/lib/staff/util";
import { todayKst } from "@/lib/time";

export const metadata = { title: "정보 고치기 · 꿈의숲키우기" };

export default async function EditChildPage({ params, searchParams }: PageProps<"/staff/children/[id]/edit">) {
  const staff = await requireStaff();
  const id = toInt((await params).id);
  const sp = await searchParams;
  const c = id === null ? null : await getChildDetail(staff, id);
  if (!c || !c.can.edit) notFound();
  const [classes, all] = await Promise.all([listClasses(db), listChildren(staff)]);
  return (
    <Page>
      <PageHeader back={`/staff/children/${c.id}`} backLabel="아이 정보로 돌아가기" title={`${c.name} 정보 고치기`} />
      <FlashNote error={sp.error} />
      <ChildForm today={todayKst()} canChangeClass={c.can.assignClass} classes={classes} friends={all.filter((f) => f.id !== c.id)} values={c} error={typeof sp.error === "string" ? sp.error : undefined} />
    </Page>
  );
}
