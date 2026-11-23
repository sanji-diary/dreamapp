import QRCode from "qrcode";
import type { ReactNode } from "react";

/**
 * One A4 poster with a big QR (a mission QR, the attendance QR). On screen it is a preview that is
 * large enough to scan straight from a tablet; the print rules undo the page frame (column width,
 * paddings) so that only the poster is printed, from the top of the sheet.
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

export async function QrPoster({ url, brand, title, sub, help, small, big = false }: { url: string; brand: string; title: string; sub: string; help: ReactNode; small: string; /** A larger QR on screen, for scanning from this screen. */ big?: boolean }) {
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="qr-poster flex flex-col items-center gap-3 rounded-[20px] border border-solid border-line px-4 py-6 text-center">
        <span className="qr-poster-brand text-[13px] font-bold text-mute">{brand}</span>
        <span className="qr-poster-title text-[24px] leading-8 font-bold tracking-[-0.035em] text-ink">{title}</span>
        <span className="qr-poster-date text-[14px] font-semibold text-sub">{sub}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`${title} QR 코드`} src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={220} height={220} className={`aspect-square max-w-full ${big ? "w-[min(100%,340px)]" : "w-[220px]"}`} />
        <span className="qr-poster-help text-[15px] leading-[22px] font-semibold text-ink2">{help}</span>
        <span className="qr-poster-small text-[12px] leading-[18px] text-mute">{small}</span>
        <span className="text-[11px] break-all text-mute print:hidden">{url}</span>
      </div>
    </>
  );
}
