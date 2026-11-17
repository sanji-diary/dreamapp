import { redirect } from "next/navigation";
import { JoinWizard } from "@/components/kid/JoinWizard";
import { childByToken } from "@/lib/auth";
import { friendChoices } from "@/lib/kid/onboarding";
import { todayKst } from "@/lib/time";

export const metadata = { title: "시작하기 · 꿈의숲키우기" };

function Stop({ title, lines }: { title: string; lines: string[] }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-6 pt-[max(72px,env(safe-area-inset-top))] text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/img/tree-seed.webp" width={84} height={84} style={{ width: 84, height: 84 }} />
      <h1 className="mt-5 mb-0 text-[24px] leading-8 font-bold tracking-[-0.5px] whitespace-pre-line">{title}</h1>
      {lines.map((l) => (
        <p key={l} className="mt-3 mb-0 text-[15px] leading-[22px] text-sub">
          {l}
        </p>
      ))}
    </main>
  );
}

/** Where a scanned QR card lands. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const child = await childByToken(token);
  if (!child) return <Stop title={"카드를 다시 확인해 주세요"} lines={["이 카드로는 들어갈 수 없어요.", "카드를 다시 찍어 보고, 계속 안 되면 선생님께 보여 주세요."]} />;
  if (!child.consent_on) {
    return <Stop title={"부모님 동의서가\n먼저 필요해요"} lines={["부모님이 동의서를 내 주시면 바로 시작할 수 있어요.", "동의서는 선생님께 받을 수 있어요."]} />;
  }
  // Setting the "remembered card" cookie has to happen in a route handler, not while rendering a page.
  if (child.has_pin) redirect(`/join/${encodeURIComponent(token)}/card`);

  const friends = await friendChoices(child.id);
  return (
    <JoinWizard
      token={token}
      name={child.name}
      today={todayKst()}
      friends={friends}
      pinOnly={child.onboarded_at !== null}
      prefill={{
        birth: child.birth_date ? child.birth_date.replaceAll("-", "") : "",
        gender: child.gender ?? "",
        school: child.school ?? "",
        schoolClass: child.school_class ?? "",
        hasPhone: child.has_phone,
        phone: child.phone ?? "",
        guardianPhone: child.guardian_phone ?? "",
        address: child.address ?? "",
        friendId: child.best_friend_id,
        friendName: child.best_friend_name ?? "",
      }}
    />
  );
}
