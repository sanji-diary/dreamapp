import QRCode from "qrcode";
import { Empty, SubHeader } from "@/components/staff/ui";
import { AutoForm, PrintButton } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { cardRows } from "@/lib/staff/admin-misc";
import { publicOrigin } from "@/lib/staff/origin";
import { toInt } from "@/lib/staff/util";

export const metadata = { title: "QR 카드 · 꿈의숲키우기" };

/**
 * A4, eight cards a page (2 x 4). On screen the same cards are shown small as a preview.
 * The print rules also undo the phone-width column of the root layout for this page.
 */
const PRINT_CSS = `
@page { size: A4; margin: 10mm; }
@media print {
  html, body { background: #fff !important; height: auto !important; }
  body > div { max-width: none !important; min-height: 0 !important; box-shadow: none !important; display: block !important; }
  main { display: block !important; }
  .qr-sheet { display: grid !important; grid-template-columns: 95mm 95mm; gap: 0 !important; padding: 0 !important; }
  .qr-card { width: 95mm; height: 69mm; border: 0.3mm dashed #8b95a1 !important; border-radius: 0 !important; break-inside: avoid; padding: 6mm !important; gap: 5mm !important; }
  .qr-card:nth-child(8n) { break-after: page; }
  .qr-card img { width: 46mm !important; height: 46mm !important; }
  .qr-name { font-size: 20pt !important; line-height: 1.2 !important; }
  .qr-class { font-size: 11pt !important; }
  .qr-help { font-size: 8.5pt !important; line-height: 1.35 !important; word-break: keep-all; }
  .qr-brand { font-size: 9pt !important; }
}
`;

export default async function CardsPage({ searchParams }: PageProps<"/staff/admin/cards">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const classId = toInt(sp.class);
  const only = sp.only === "new";
  const [classes, rows, origin] = await Promise.all([listClasses(db), cardRows(staff, classId), publicOrigin()]);
  const kids = (rows ?? []).filter((k) => !only || !k.onboarded);
  const waiting = (rows ?? []).filter((k) => !k.onboarded).length;
  const cards = await Promise.all(
    kids.map(async (k) => {
      const svg = await QRCode.toString(`${origin}/join/${k.qr_token}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      return { ...k, qr: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
    }),
  );

  return (
    <>
      <style>{PRINT_CSS}</style>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="QR 카드" />
      <div className="flex flex-col gap-2.5 px-4 pt-1 print:hidden">
        <p className="m-0 text-[14px] leading-5 text-mute">
          {kids.length}장 · 아직 시작하지 않은 아이 {waiting}명. A4 한 장에 8장씩 인쇄돼요.
        </p>
        <AutoForm className="flex items-center gap-2">
          <label className="sr-only" htmlFor="card-class">
            반
          </label>
          <select id="card-class" name="class" defaultValue={classId ?? ""} className="h-11 min-w-0 grow basis-0 rounded-[22px] border-0 bg-fill px-3 text-[14px] font-bold text-ink outline-none focus-visible:outline-2 focus-visible:outline-navy">
            <option value="">전체 반</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="card-only">
            보여 줄 아이
          </label>
          <select id="card-only" name="only" defaultValue={only ? "new" : ""} className="h-11 min-w-0 grow basis-0 rounded-[22px] border-0 bg-fill px-3 text-[14px] font-bold text-ink outline-none focus-visible:outline-2 focus-visible:outline-navy">
            <option value="">모든 아이</option>
            <option value="new">시작 전인 아이만</option>
          </select>
        </AutoForm>
        <PrintButton>카드 인쇄하기</PrintButton>
        <p className="m-0 text-[12px] leading-[18px] text-mute">카드는 아이 본인에게만 주세요. 카드와 비밀번호가 둘 다 있어야 들어갈 수 있어요.</p>
      </div>
      {cards.length === 0 ? <Empty>인쇄할 카드가 없어요.</Empty> : null}
      <div className="qr-sheet grid grid-cols-2 gap-2 px-4 pt-3 pb-6">
        {cards.map((k) => (
          <div key={k.id} className="qr-card flex items-center gap-2 rounded-xl border border-solid border-line p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`${k.name} QR 코드`} src={k.qr} width={64} height={64} className="h-16 w-16 shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className="qr-brand text-[9px] font-bold text-mute">꿈의숲키우기</span>
              <span className="qr-name truncate text-[15px] leading-5 font-bold text-ink">{k.name}</span>
              <span className="qr-class text-[11px] text-sub">{k.class_name ?? "반 없음"}</span>
              <span className="qr-help hidden text-sub print:block">휴대폰 카메라로 QR을 찍고 내 비밀번호 숫자 4개를 눌러요.</span>
              {!k.onboarded ? <span className="mt-0.5 w-fit rounded bg-warn-tint px-1.5 text-[10px] leading-4 font-bold text-warn print:hidden">시작 전</span> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
