import QRCode from "qrcode";
import { AdminHeader, Small } from "@/components/staff/admin-kit";
import { SwitchSubmit } from "@/components/staff/form-kit";
import { BarLink, Box, EmptyNote, FlashNote, Notice, Page, PageHeader, SectionHead, Tag, barButtonClass } from "@/components/staff/kit";
import { AutoForm, ConfirmButton, PrintButton } from "@/components/staff/widgets";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listClasses } from "@/lib/staff/access";
import { joinQrAction } from "@/lib/staff/actions-admin";
import { cardRows, sharedJoin } from "@/lib/staff/admin-misc";
import { publicOrigin } from "@/lib/staff/origin";
import { toInt } from "@/lib/staff/util";

export const metadata = { title: "QR 카드 · 꿈의숲키우기" };

/**
 * A4, eight cards a page (2 x 4). On screen the same cards are shown small as a preview.
 * The print rules undo the page frame (the column, its paddings and gaps) so that the sheet
 * starts at the top-left corner of the paper, and they fix the two columns whatever the screen was.
 */
const PRINT_CSS = `
@page { size: A4; margin: 10mm; }
@media print {
  html, body { background: #fff !important; height: auto !important; }
  body > div { max-width: none !important; min-height: 0 !important; box-shadow: none !important; display: block !important; }
  main { display: block !important; }
  [data-wide] { display: block !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
  .qr-sheet { display: grid !important; grid-template-columns: 95mm 95mm !important; gap: 0 !important; padding: 0 !important; }
  .qr-card { width: 95mm; height: 69mm; border: 0.3mm dashed #8b95a1 !important; border-radius: 0 !important; break-inside: avoid; padding: 6mm !important; gap: 5mm !important; }
  .qr-card:nth-child(8n) { break-after: page; }
  .qr-card img { width: 46mm !important; height: 46mm !important; }
  .qr-name { font-size: 20pt !important; line-height: 1.2 !important; }
  .qr-class { font-size: 11pt !important; }
  .qr-help { font-size: 8.5pt !important; line-height: 1.35 !important; word-break: keep-all; }
  .qr-brand { font-size: 9pt !important; }
  .join-poster { display: flex !important; flex-direction: column; align-items: center; justify-content: center; height: 270mm; gap: 9mm; text-align: center; padding: 0 !important; }
  .join-poster img { width: 120mm !important; height: 120mm !important; }
  .join-brand { font-size: 20pt !important; }
  .join-title { font-size: 40pt !important; line-height: 1.25 !important; }
  .join-steps { font-size: 17pt !important; line-height: 1.6 !important; }
}
`;

const qrImage = async (url: string) => `data:image/svg+xml;utf8,${encodeURIComponent(await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }))}`;

// 44px tall on phones (they stand alone in their row there), the size of a chip on wide screens.
const pickerClass = "h-11 min-w-0 max-w-full cursor-pointer rounded-full border-0 bg-fill px-3.5 text-[13px] font-semibold text-sub focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff lg:h-[34px]";

export default async function CardsPage({ searchParams }: PageProps<"/staff/admin/cards">) {
  const staff = await requireAdmin();
  const sp = await searchParams;
  const classId = toInt(sp.class);
  const only = sp.only === "new";
  const [classes, rows, origin, join] = await Promise.all([listClasses(db), cardRows(staff, classId), publicOrigin(), sharedJoin(staff)]);
  const joinUrl = join ? `${origin}/start/${join.code}` : null;
  const joinQr = joinUrl ? await qrImage(joinUrl) : null;

  // ?sheet=join: only the poster with the shared QR, ready to print on one A4 page.
  if (sp.sheet === "join" && join && joinQr) {
    return (
      <Page narrow>
        <style>{PRINT_CSS}</style>
        <PageHeader back="/staff/admin/cards" backLabel="QR 카드로 돌아가기" title="가입 QR 인쇄" />
        <div className="flex flex-col gap-2.5 print:hidden">
          <p className="m-0 text-[14px] leading-[21px] text-sub">A4 한 장에 크게 인쇄돼요. 소년부실 문이나 벽에 붙여 주세요.</p>
          {join.on ? null : <Notice tone="danger">지금은 QR 가입이 꺼져 있어요. 켜야 이 QR로 가입할 수 있어요.</Notice>}
          <PrintButton>가입 QR 인쇄하기</PrintButton>
        </div>
        <div className="join-poster flex flex-col items-center gap-4 rounded-[20px] border border-line px-4 pt-6 pb-8 text-center print:border-0">
          <span className="join-brand text-[14px] font-bold text-staff">꿈의숲키우기</span>
          <span className="join-title text-[26px] leading-[34px] font-bold tracking-[-0.035em] text-ink">
            QR을 찍고
            <br />
            가입해요
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="함께 쓰는 가입 QR 코드" src={joinQr} width={220} height={220} className="aspect-square w-[220px] max-w-full" />
          <span className="join-steps text-[14px] leading-[22px] text-sub">
            1. 휴대폰 카메라로 QR을 비춰요
            <br />
            2. 이름, 학교, 반을 알려 줘요
            <br />
            3. 나만 아는 비밀번호 숫자 4개를 만들어요
          </span>
        </div>
      </Page>
    );
  }

  const kids = (rows ?? []).filter((k) => !only || !k.onboarded);
  const waiting = (rows ?? []).filter((k) => !k.onboarded).length;
  const cards = await Promise.all(
    kids.map(async (k) => {
      return { ...k, qr: await qrImage(`${origin}/join/${k.qr_token}`) };
    }),
  );

  return (
    <Page wide>
      <style>{PRINT_CSS}</style>
      <AdminHeader title="QR 카드" />
      <div className="empty:hidden print:hidden">
        <FlashNote ok={sp.ok} error={sp.error} />
      </div>
      {/* The shared QR and the print controls: one under the other on phones, side by side from 768px. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3.5 md:grid-cols-2 print:hidden">
        {join && joinQr && joinUrl ? (
          <section aria-label="함께 쓰는 가입 QR">
            <Box className="max-[339px]:p-3.5">
              <SectionHead right={<Tag tone={join.on ? "navy" : "danger"} onWhite>{join.on ? "가입 받는 중" : "꺼져 있음"}</Tag>}>함께 쓰는 가입 QR</SectionHead>
              <div className="flex items-center gap-3.5 max-[339px]:flex-col max-[339px]:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="함께 쓰는 가입 QR 코드" src={joinQr} width={104} height={104} className={`h-[104px] w-[104px] shrink-0 rounded-xl bg-white p-1.5 ${join.on ? "" : "opacity-30"}`} />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="m-0 text-[13px] leading-[19px] text-sub">아이들이 이 QR 하나로 스스로 가입해요. 지금까지 {join.joined}명이 가입했어요.</p>
                  <p className="m-0 text-[12px] leading-[17px] break-all text-mute">{joinUrl}</p>
                </div>
              </div>
              <form action={joinQrAction} className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-white py-1 pr-2.5 pl-4">
                <input type="hidden" name="op" value={join.on ? "off" : "on"} />
                <span className="flex min-w-0 grow flex-col">
                  <b className="text-[15px] tracking-[-0.02em]">QR로 가입 받기</b>
                  <span className="text-[13px] text-mute">{join.on ? "켜짐 · 누구나 이 QR로 가입할 수 있어요" : "꺼짐 · 지금은 가입할 수 없어요"}</span>
                </span>
                <SwitchSubmit on={join.on} label="QR로 가입 받기" />
              </form>
              <div className="flex flex-wrap gap-2">
                {/* Opens the sign-up a child would see, in a new tab, so a teacher can try it without a phone. */}
                {join.on ? (
                  <a href={joinUrl} target="_blank" rel="noopener noreferrer" className={barButtonClass("white")}>
                    가입 화면 열기
                  </a>
                ) : null}
                <BarLink href="/staff/admin/cards?sheet=join" tone="white">
                  크게 인쇄하기
                </BarLink>
                <form action={joinQrAction} className="flex">
                  <input type="hidden" name="op" value="reissue" />
                  <ConfirmButton message="새 가입 QR을 만들까요? 전에 인쇄한 QR은 바로 못 쓰게 돼요." className={barButtonClass("white")}>
                    새 QR 만들기
                  </ConfirmButton>
                </form>
              </div>
              <Small>가입한 아이는 교적부의 ‘새로 가입’에서 반과 동의서를 확인해 주세요.</Small>
            </Box>
          </section>
        ) : null}
        <section aria-label="아이 QR 카드 인쇄" className="flex min-w-0 flex-col gap-2.5">
          <SectionHead note={`${kids.length}장`}>아이 QR 카드</SectionHead>
          <p className="m-0 text-[14px] leading-[21px] text-sub">
            아직 시작하지 않은 아이 {waiting}명. A4 한 장에 8장씩 인쇄돼요.
          </p>
          <AutoForm className="flex flex-wrap items-center gap-x-[7px] gap-y-1.5">
            <span className="flex min-w-0 items-center lg:h-10">
              <label className="sr-only" htmlFor="card-class">
                반 고르기
              </label>
              <select id="card-class" name="class" defaultValue={classId ?? ""} className={pickerClass}>
                <option value="">모든 반</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
            <span className="flex min-w-0 items-center lg:h-10">
              <label className="sr-only" htmlFor="card-only">
                보여 줄 아이
              </label>
              <select id="card-only" name="only" defaultValue={only ? "new" : ""} className={pickerClass}>
                <option value="">모든 아이</option>
                <option value="new">시작 전인 아이만</option>
              </select>
            </span>
          </AutoForm>
          <PrintButton>카드 인쇄하기</PrintButton>
          <Small>카드는 아이 본인에게만 주세요. 카드와 비밀번호가 둘 다 있어야 들어갈 수 있어요.</Small>
        </section>
      </div>
      {cards.length === 0 ? (
        <div className="print:hidden">
          <EmptyNote>인쇄할 카드가 없어요.</EmptyNote>
        </div>
      ) : null}
      <div className="qr-sheet grid grid-cols-2 gap-2 max-[329px]:grid-cols-1 sm:grid-cols-3 md:grid-cols-4">
        {cards.map((k) => (
          <div key={k.id} className="qr-card flex items-center gap-2 rounded-[14px] border border-solid border-line p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`${k.name} QR 코드`} src={k.qr} width={64} height={64} className="h-16 w-16 shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className="qr-brand text-[9px] font-bold text-mute">꿈의숲키우기</span>
              <span className="qr-name text-[15px] leading-5 font-bold text-ink">{k.name}</span>
              <span className="qr-class text-[11px] text-sub">{k.class_name ?? "반 없음"}</span>
              <span className="qr-help hidden text-sub print:block">휴대폰 카메라로 QR을 찍고 내 비밀번호 숫자 4개를 눌러요.</span>
              {!k.onboarded ? (
                <span className="mt-0.5 print:hidden">
                  <Tag tone="warn">시작 전</Tag>
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}
