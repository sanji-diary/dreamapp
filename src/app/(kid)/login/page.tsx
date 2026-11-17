import { redirect } from "next/navigation";
import { LoginForm } from "@/components/kid/LoginForm";
import { childByToken, getKid } from "@/lib/auth";
import { readCard } from "@/lib/card";
import { callName } from "@/lib/kid/korean";
import { lockMinutes } from "@/lib/kid/queries";

export const metadata = { title: "로그인 · 꿈의숲키우기" };

/** No card remembered on this device: the only way in is to scan the QR card. */
function ScanCard() {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-6 pt-[max(72px,env(safe-area-inset-top))] text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/img/tree-seed.webp" width={84} height={84} style={{ width: 84, height: 84 }} />
      <h1 className="mt-5 mb-0 text-[24px] leading-8 font-bold tracking-[-0.5px]">
        QR 카드를 휴대폰 카메라로
        <br />
        찍어 주세요
      </h1>
      <p className="mt-3 mb-0 text-[15px] leading-[22px] text-sub">
        선생님께 받은 내 카드를 카메라로 비추면
        <br />
        내 나무로 들어갈 수 있어요.
      </p>
      <div aria-hidden="true" className="mt-8 flex h-[150px] w-[150px] items-center justify-center rounded-3xl bg-fill">
        <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#4E5968" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <path d="M14 14h2v2h-2zM18 14h2M14 18v2h2M19 17v3" />
        </svg>
      </div>
      <p className="mt-8 mb-0 text-[13px] leading-[19px] text-mute">카드가 없거나 잃어버렸으면 선생님께 말해 주세요</p>
    </main>
  );
}

export default async function LoginPage() {
  if (await getKid()) redirect("/home");
  const token = await readCard();
  const child = token ? await childByToken(token) : null;
  if (!token || !child) return <ScanCard />;
  if (!child.has_pin) redirect(`/join/${encodeURIComponent(token)}`);
  return <LoginForm greeting={`${callName(child.name)}, 반가워!`} lockedMinutes={await lockMinutes(token)} />;
}
