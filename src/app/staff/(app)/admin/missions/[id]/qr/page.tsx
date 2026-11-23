import { notFound } from "next/navigation";
import { Small } from "@/components/staff/admin-kit";
import { Notice, Page, PageHeader } from "@/components/staff/kit";
import { QrPoster } from "@/components/staff/QrPoster";
import { PrintButton } from "@/components/staff/widgets";
import { comingSunday, weeklyAttendanceCode } from "@/lib/attendance-code";
import { requireAdmin } from "@/lib/auth";
import { getMission } from "@/lib/staff/admin-missions";
import { publicOrigin } from "@/lib/staff/origin";
import { toInt } from "@/lib/staff/util";
import { formatKoreanDate } from "@/lib/time";

export const metadata = { title: "미션 QR 인쇄 · 꿈의숲키우기" };

/** The A4 poster of a QR mission (or of an attendance mission with self check-in). */
export default async function MissionQrPage({ params }: PageProps<"/staff/admin/missions/[id]/qr">) {
  const staff = await requireAdmin();
  const id = toInt((await params).id);
  const m = id === null ? null : await getMission(staff, id);
  if (!m || !m.qr_code || (m.kind !== "qr" && m.kind !== "attendance")) notFound();
  // The attendance QR is a new one every Sunday; a QR mission keeps its one code.
  const sunday = comingSunday();
  const url = `${await publicOrigin()}/q/${m.kind === "attendance" ? weeklyAttendanceCode(m.qr_code, sunday) : m.qr_code}`;
  // A fixed or rotating mission has no dates of its own: the poster says how it comes instead.
  const period = m.mode === "fixed" ? "매주 나와요" : m.mode === "pool" ? "순환 미션이에요" : m.starts_on === m.ends_on ? formatKoreanDate(m.starts_on) : `${formatKoreanDate(m.starts_on)} - ${formatKoreanDate(m.ends_on)}`;

  return (
    <Page narrow>
      <PageHeader back={`/staff/admin/missions/${m.id}`} backLabel="미션 고치기로 돌아가기" title="미션 QR" />
      <div className="flex flex-col gap-2.5 print:hidden">
        <p className="m-0 text-[14px] leading-[21px] text-sub">A4 한 장으로 인쇄해서 교회에 붙여 주세요. 아이가 앱에서(또는 휴대폰 카메라로) 찍으면 {m.kind === "attendance" ? "출석과 미션이 함께 기록돼요." : "미션이 바로 완료돼요."}</p>
        {!m.active ? <Notice tone="warn">지금은 받지 않는 미션이에요. 미션 목록에서 ‘다시 받기’를 눌러야 QR이 동작해요.</Notice> : null}
        <PrintButton>QR 인쇄하기</PrintButton>
      </div>
      <QrPoster
        url={url}
        brand={`꿈의숲키우기 · ${m.kind === "attendance" ? "출석 QR" : "미션 QR"}`}
        title={m.title}
        sub={m.kind === "attendance" ? formatKoreanDate(sunday) : period}
        help={
          <>
            {m.kind === "attendance" ? "꿈의숲 앱 첫 화면에서 ‘출석 체크’를" : "꿈의숲 앱의 미션에서 ‘QR 찍기’를"} 눌러 찍어 주세요.
            <br />
            {m.kind === "attendance" ? "출석이 기록되고 물방울을 받아요." : "미션이 완료되고 물방울을 받아요."}
          </>
        }
        small="휴대폰 카메라로 찍어도 돼요. 처음이라면 먼저 내 QR 카드를 찍고 비밀번호를 눌러요."
      />
      <Small className="print:hidden">{m.kind === "attendance" ? `출석 QR은 주일마다 바뀌어요. 이 QR은 ${formatKoreanDate(sunday)}에만 쓰고, 다음 주일에는 새로 인쇄해 주세요.` : m.mode === "dated" ? "미션마다 QR이 달라요. 다음 주로 복사한 미션은 새 QR을 인쇄해 주세요." : "이 QR은 매주 그대로 쓸 수 있어요."}</Small>
    </Page>
  );
}
