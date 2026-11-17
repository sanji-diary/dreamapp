import QRCode from "qrcode";
import { BackLink } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { publicOrigin } from "@/lib/staff/origin";

export const metadata = { title: "내 카드 · 꿈의숲키우기" };

/**
 * The child's own QR card on screen: scan it with a new phone, or let a parent take a picture of it.
 * Like the paper card it only leads to the PIN screen; it never signs anyone in by itself.
 */
export default async function MyCardPage() {
  const kid = await requireKid();
  const url = `${await publicOrigin()}/join/${encodeURIComponent(kid.qr_token)}/card`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="flex h-[52px] shrink-0 items-center pt-[env(safe-area-inset-top)] pl-2">
        <BackLink href="/me" label="나로 돌아가기" />
      </div>
      <div className="flex grow flex-col items-center px-6 pt-2 pb-8 text-center">
        <h1 className="m-0 text-[25px] leading-[34px] font-bold tracking-[-0.6px]">{kid.name}의 카드</h1>
        <p className="m-0 mt-2 text-[15px] leading-[22px] text-sub">
          새 휴대폰 카메라로 찍으면
          <br />
          내 나무로 들어올 수 있어요
        </p>
        <div className="mt-6 rounded-3xl border border-solid border-line p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={`${kid.name}의 QR 카드`} src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={232} height={232} className="block h-[232px] w-[232px]" />
        </div>
        <ul className="m-0 mt-6 flex list-none flex-col gap-1.5 p-0 text-[14px] leading-5 text-sub">
          <li>부모님 휴대폰으로 사진을 찍어 두면 잃어버리지 않아요</li>
          <li>들어올 때는 내 비밀번호도 눌러야 해요</li>
          <li>다른 친구에게는 보여 주지 않아요</li>
        </ul>
      </div>
    </main>
  );
}
