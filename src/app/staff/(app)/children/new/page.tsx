import { ChildForm } from "@/components/staff/ChildForm";
import { FlashNote, Notice, Page, PageHeader } from "@/components/staff/kit";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { listChildren } from "@/lib/staff/children";
import { toInt } from "@/lib/staff/util";
import { todayKst } from "@/lib/time";

export const metadata = { title: "아이 추가 · 꿈의숲키우기" };

export default async function NewChildPage({ searchParams }: PageProps<"/staff/children/new">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const [classes, friends] = await Promise.all([listClasses(db), listChildren(staff)]);
  return (
    <Page>
      <PageHeader back="/staff/children" backLabel="교적부로 돌아가기" title="아이 추가" />
      <FlashNote error={sp.error} />
      <Notice>추가하면 아이의 QR 카드가 만들어져요. 운영 › QR 카드에서 인쇄해 주세요.</Notice>
      <ChildForm
        today={todayKst()}
        canChangeClass
        classes={classes}
        friends={friends}
        error={typeof sp.error === "string" ? sp.error : undefined}
        values={{ id: null, name: "", class_id: toInt(sp.class), birth_date: null, gender: null, school: null, school_class: null, address: null, phone: null, guardian_phone: null, best_friend_id: null, best_friend_name: null, has_phone: true, memo: null, photo_url: null }}
      />
    </Page>
  );
}
