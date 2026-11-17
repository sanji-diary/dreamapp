import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { SubHeader } from "@/components/staff/ui";
import { PrintButton } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { getMission } from "@/lib/staff/admin-missions";
import { publicOrigin } from "@/lib/staff/origin";
import { toInt } from "@/lib/staff/util";
import { formatKoreanDate } from "@/lib/time";

export const metadata = { title: "미션 QR 인쇄 · 꿈의숲키우기" };

/**
 * One A4 poster with a big QR for a QR mission (or an attendance mission with self check-in).
 * On screen it is a small preview; the print rules undo the phone-width column of the root layout.
 */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 16mm; }
@media print {
  html, body { background: #fff !important; height: auto !important; }
  body > div { max-width: none !important; min-height: 0 !important; box-shadow: none !important; display: block !important; }
  main { display: block !important; }
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
  const period = m.starts_on === m.ends_on ? formatKoreanDate(m.starts_on) : `${formatKoreanDate(m.starts_on)} - ${formatKoreanDate(m.ends_on)}`;

  return (
    <>
      <style>{PRINT_CSS}</style>
      <SubHeader back={`/staff/admin/missions/${m.id}`} backLabel="미션 수정으로 돌아가기" title="미션 QR" />
      <div className="flex flex-col gap-2.5 px-4 pt-1 print:hidden">
        <p className="m-0 text-[14px] leading-5 text-mute">A4 한 장으로 인쇄해서 교회에 붙여 주세요. 아이가 휴대폰 카메라로 찍으면 {m.kind === "attendance" ? "출석과 미션이 함께 기록돼요." : "미션이 바로 완료돼요."}</p>
        <PrintButton>QR 인쇄하기</PrintButton>
        {!m.active ? <p className="m-0 rounded-[10px] bg-warn-tint px-3 py-2.5 text-[13px] leading-[19px] font-semibold text-warn">이 미션은 내려져 있어요. 다시 올려야 QR이 동작해요.</p> : null}
      </div>
      <div className="qr-poster mx-4 mt-3 mb-6 flex flex-col items-center gap-3 rounded-2xl border border-solid border-line px-4 py-6 text-center">
        <span className="qr-poster-brand text-[13px] font-bold text-mute">꿈의숲키우기 · {m.kind === "attendance" ? "출석 QR" : "미션 QR"}</span>
        <span className="qr-poster-title text-[24px] leading-8 font-bold tracking-[-0.5px] text-ink">{m.title}</span>
        <span className="qr-poster-date text-[14px] font-semibold text-sub">{period}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`${m.title} QR 코드`} src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={220} height={220} className="h-[220px] w-[220px]" />
        <span className="qr-poster-help text-[15px] leading-[22px] font-semibold text-ink2">
          휴대폰 카메라로 QR을 찍어 주세요.
          <br />
          {m.kind === "attendance" ? "출석이 기록되고 물방울을 받아요." : "미션이 완료되고 물방울을 받아요."}
        </span>
        <span className="qr-poster-small text-[12px] leading-[18px] text-mute">처음이라면 먼저 내 QR 카드를 찍고 비밀번호를 눌러요.</span>
        <span className="text-[11px] break-all text-mute print:hidden">{url}</span>
      </div>
    </>
  );
}
