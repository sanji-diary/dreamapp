import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Small } from "@/components/staff/admin-kit";
import { Notice, Page, PageHeader } from "@/components/staff/kit";
import { PrintButton } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { getMission } from "@/lib/staff/admin-missions";
import { publicOrigin } from "@/lib/staff/origin";
import { toInt } from "@/lib/staff/util";
import { formatKoreanDate } from "@/lib/time";

export const metadata = { title: "미션 QR 인쇄 · 꿈의숲키우기" };

/**
 * One A4 poster with a big QR for a QR mission (or an attendance mission with self check-in).
 * On screen it is a small preview; the print rules undo the page frame (column width, paddings)
 * so that only the poster is printed, from the top of the sheet.
 */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 16mm; }
@media print {
  html, body { background: #fff !important; height: auto !important; }
  body > div { max-width: none !important; min-height: 0 !important; box-shadow: none !important; display: block !important; }
  main { display: block !important; }
  [data-wide] { display: block !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
  .qr-poster { border: 0 !important; border-radius: 0 !important; margin: 0 !important; padding: 8mm 0 0 !important; gap: 7mm !important; break-inside: avoid; }
  .qr-poster-brand { font-size: 16pt !important; }
  .qr-poster-title { font-size: 34pt !important; line-height: 1.25 !important; }
  .qr-poster-date { font-size: 16pt !important; }
  .qr-poster img { width: 130mm !important; height: 130mm !important; }
  .qr-poster-help { font-size: 18pt !important; line-height: 1.45 !important; }
  .qr-poster-small { font-size: 11pt !important; }
}
`;

export default async function MissionQrPage({ params }: PageProps<"/staff/admin/missions/[id]/qr">) {
  const staff = await requireAdmin();
  const id = toInt((await params).id);
  const m = id === null ? null : await getMission(staff, id);
  if (!m || !m.qr_code || (m.kind !== "qr" && m.kind !== "attendance")) notFound();
  const url = `${await publicOrigin()}/q/${m.qr_code}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  // A fixed or rotating mission has no dates of its own: the poster says how it comes instead.
  const period = m.mode === "fixed" ? "매주 나와요" : m.mode === "pool" ? "순환 미션이에요" : m.starts_on === m.ends_on ? formatKoreanDate(m.starts_on) : `${formatKoreanDate(m.starts_on)} - ${formatKoreanDate(m.ends_on)}`;

  return (
    <Page narrow>
      <style>{PRINT_CSS}</style>
      <PageHeader back={`/staff/admin/missions/${m.id}`} backLabel="미션 고치기로 돌아가기" title="미션 QR" />
      <div className="flex flex-col gap-2.5 print:hidden">
        <p className="m-0 text-[14px] leading-[21px] text-sub">A4 한 장으로 인쇄해서 교회에 붙여 주세요. 아이가 휴대폰 카메라로 찍으면 {m.kind === "attendance" ? "출석과 미션이 함께 기록돼요." : "미션이 바로 완료돼요."}</p>
        {!m.active ? <Notice tone="warn">지금은 받지 않는 미션이에요. 미션 목록에서 ‘다시 받기’를 눌러야 QR이 동작해요.</Notice> : null}
        <PrintButton>QR 인쇄하기</PrintButton>
      </div>
      <div className="qr-poster flex flex-col items-center gap-3 rounded-[20px] border border-solid border-line px-4 py-6 text-center">
        <span className="qr-poster-brand text-[13px] font-bold text-mute">꿈의숲키우기 · {m.kind === "attendance" ? "출석 QR" : "미션 QR"}</span>
        <span className="qr-poster-title text-[24px] leading-8 font-bold tracking-[-0.035em] text-ink">{m.title}</span>
        <span className="qr-poster-date text-[14px] font-semibold text-sub">{period}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`${m.title} QR 코드`} src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={220} height={220} className="aspect-square w-[220px] max-w-full" />
        <span className="qr-poster-help text-[15px] leading-[22px] font-semibold text-ink2">
          휴대폰 카메라로 QR을 찍어 주세요.
          <br />
          {m.kind === "attendance" ? "출석이 기록되고 물방울을 받아요." : "미션이 완료되고 물방울을 받아요."}
        </span>
        <span className="qr-poster-small text-[12px] leading-[18px] text-mute">처음이라면 먼저 내 QR 카드를 찍고 비밀번호를 눌러요.</span>
        <span className="text-[11px] break-all text-mute print:hidden">{url}</span>
      </div>
      <Small className="print:hidden">{m.mode === "dated" ? "미션마다 QR이 달라요. 다음 주로 복사한 미션은 새 QR을 인쇄해 주세요." : "이 QR은 매주 그대로 쓸 수 있어요."}</Small>
    </Page>
  );
}
