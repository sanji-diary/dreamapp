import { redirect } from "next/navigation";
import { LoginForm } from "@/components/kid/LoginForm";
import { childByToken, getKid } from "@/lib/auth";
import { readCard } from "@/lib/card";
import { Avatar } from "@/components/ui";
import { pickFriendAction } from "@/lib/kid/actions";
import { rememberedFriends, type RememberedFriend } from "@/lib/kid/friends";
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

/**
 * Friends who have used this device before. Reached by "다른 친구예요" or when no card is current.
 * Picking a name only chooses whose PIN to ask for; the PIN screen comes next.
 */
function PickFriend({ friends }: { friends: RememberedFriend[] }) {
  return (
    <main className="flex min-h-dvh flex-col bg-white px-6 pt-[max(64px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <h1 className="m-0 text-[26px] leading-[35px] font-bold tracking-[-0.6px]">누구예요?</h1>
      <p className="mt-2 mb-0 text-[15px] leading-[22px] text-sub">이름을 누르고 비밀번호를 넣으면 내 나무로 들어가요.</p>
      <ul aria-label="이 휴대폰으로 들어온 친구" className="m-0 mt-7 flex list-none flex-col gap-2.5 p-0">
        {friends.map((f, i) => (
          <li key={f.key}>
            <form action={pickFriendAction}>
              <input type="hidden" name="k" value={f.key} />
              <button type="submit" className="flex h-[72px] w-full cursor-pointer items-center gap-3.5 rounded-2xl border-[1.5px] border-solid border-[#D9DEE3] bg-white px-4 text-left">
                <Avatar name={f.name} id={i} size={44} />
                <span className="min-w-0 grow truncate text-[19px] font-bold tracking-[-0.3px] text-ink">{f.name}</span>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <div className="mt-8 rounded-2xl bg-fill px-4 py-4">
        <p className="m-0 text-[15px] leading-[22px] font-bold text-ink2">내 이름이 없어요</p>
        <p className="mt-1.5 mb-0 text-[14px] leading-[21px] text-sub">
          가입한 적이 있으면 내 QR 카드를, 처음이면 교회에 있는 가입 QR을 휴대폰 카메라로 찍어 주세요. 카드가 없으면 선생님께 말해 주세요.
        </p>
      </div>
    </main>
  );
}

export default async function LoginPage() {
  if (await getKid()) redirect("/home");
  const token = await readCard();
  const child = token ? await childByToken(token) : null;
  if (token && child) {
    if (!child.has_pin) redirect(`/join/${encodeURIComponent(token)}`);
    return <LoginForm greeting={`${callName(child.name)}, 반가워!`} lockedMinutes={await lockMinutes(token)} />;
  }
  // No card is current (first visit, or "다른 친구예요"): offer the friends this device remembers.
  const friends = await rememberedFriends();
  return friends.length > 0 ? <PickFriend friends={friends} /> : <ScanCard />;
}
