import QRCode from "qrcode";
import { Empty, Flash, H2, SmallLink, SubHeader } from "@/components/staff/ui";
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
  .join-poster { display: flex !important; flex-direction: column; align-items: center; justify-content: center; height: 270mm; gap: 9mm; text-align: center; padding: 0 !important; }
  .join-poster img { width: 120mm !important; height: 120mm !important; }
  .join-brand { font-size: 20pt !important; }
  .join-title { font-size: 40pt !important; line-height: 1.25 !important; }
  .join-steps { font-size: 17pt !important; line-height: 1.6 !important; }
}
`;

const qrImage = async (url: string) => `data:image/svg+xml;utf8,${encodeURIComponent(await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }))}`;

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
      <>
        <style>{PRINT_CSS}</style>
        <SubHeader back="/staff/admin/cards" backLabel="QR 카드로 돌아가기" title="가입 QR 인쇄" />
        <div className="flex flex-col gap-2.5 px-4 pt-1 print:hidden">
          <p className="m-0 text-[14px] leading-5 text-mute">A4 한 장에 크게 인쇄돼요. 소년부실 문이나 벽에 붙여 주세요.</p>
          {join.on ? null : <p className="m-0 rounded-[10px] bg-danger-tint px-3 py-[11px] text-[14px] leading-5 font-bold text-[#8E2A22]">지금은 QR 가입이 꺼져 있어요. 켜야 이 QR로 가입할 수 있어요.</p>}
          <PrintButton>가입 QR 인쇄하기</PrintButton>
        </div>
        <div className="join-poster flex flex-col items-center gap-4 px-6 pt-6 pb-8 text-center">
          <span className="join-brand text-[14px] font-bold text-navy">꿈의숲키우기</span>
          <span className="join-title text-[26px] leading-[34px] font-bold tracking-[-0.6px] text-ink">
            QR을 찍고
            <br />
            가입해요
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="함께 쓰는 가입 QR 코드" src={joinQr} width={220} height={220} className="h-[220px] w-[220px]" />
          <span className="join-steps text-[14px] leading-[22px] text-sub">
            1. 휴대폰 카메라로 QR을 비춰요
            <br />
            2. 이름, 학교, 반을 알려 줘요
            <br />
            3. 나만 아는 비밀번호 숫자 4개를 만들어요
          </span>
        </div>
      </>
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
    <>
      <style>{PRINT_CSS}</style>
      <SubHeader back="/staff/admin" backLabel="관리로 돌아가기" title="QR 카드" />
      <Flash ok={sp.ok} error={sp.error} />
      {join && joinQr && joinUrl ? (
        <section aria-label="함께 쓰는 가입 QR" className="mx-4 mb-2 flex flex-col rounded-2xl bg-fill px-4 pb-3 print:hidden">
          <H2 right={<span className={`flex h-[26px] items-center rounded-md px-[9px] text-[12px] font-bold ${join.on ? "bg-navy-tint text-navy" : "bg-danger-tint text-danger"}`}>{join.on ? "가입 받는 중" : "꺼져 있음"}</span>}>함께 쓰는 가입 QR</H2>
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="함께 쓰는 가입 QR 코드" src={joinQr} width={104} height={104} className={`h-[104px] w-[104px] shrink-0 rounded-lg bg-white p-1 ${join.on ? "" : "opacity-30"}`} />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="m-0 text-[13px] leading-[19px] text-sub">아이들이 이 QR 하나로 스스로 가입해요. 지금까지 {join.joined}명이 가입했어요.</p>
              <p className="m-0 text-[12px] leading-[17px] break-all text-mute">{joinUrl}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Opens the sign-up a child would see, in a new tab, so a teacher can try it without a phone. */}
            {join.on ? (
              <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 shrink-0 items-center no-underline">
                <span className="flex h-[30px] min-w-[96px] items-center justify-center rounded-md bg-white px-2 text-[12px] font-semibold whitespace-nowrap text-sub">가입 화면 열기</span>
              </a>
            ) : null}
            <SmallLink href="/staff/admin/cards?sheet=join" width={96}>
              크게 인쇄하기
            </SmallLink>
            <form action={joinQrAction}>
              <input type="hidden" name="op" value="reissue" />
              <ConfirmButton message="새 가입 QR을 만들까요? 전에 인쇄한 QR은 바로 못 쓰게 돼요." className="flex h-11 cursor-pointer items-center border-0 bg-transparent p-0">
                <span className="flex h-[30px] min-w-[96px] items-center justify-center rounded-md bg-white px-2 text-[12px] font-semibold whitespace-nowrap text-sub">새 QR 만들기</span>
              </ConfirmButton>
            </form>
            <form action={joinQrAction}>
              <input type="hidden" name="op" value={join.on ? "off" : "on"} />
              <button type="submit" role="switch" aria-checked={join.on} aria-label="QR로 가입 받기" className="flex h-11 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[13px] font-semibold text-ink2">
                <span className={`flex h-[30px] w-[52px] shrink-0 items-center rounded-full px-[3px] ${join.on ? "justify-end bg-navy" : "bg-faint"}`}>
                  <span className="h-6 w-6 rounded-full bg-white" />
                </span>
                {join.on ? "켜짐" : "꺼짐"}
              </button>
            </form>
          </div>
          <p className="m-0 mt-1 text-[12px] leading-[18px] text-mute">가입한 아이는 교적부의 ‘새로 가입한 아이’에서 반과 동의서를 확인해 주세요.</p>
        </section>
      ) : null}
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
