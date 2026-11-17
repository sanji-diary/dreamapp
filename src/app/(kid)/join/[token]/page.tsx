import { redirect } from "next/navigation";
import { JoinWizard } from "@/components/kid/JoinWizard";
import { Stop } from "@/components/kid/Stop";
import { childByToken } from "@/lib/auth";
import { classChoices } from "@/lib/kid/onboarding";
import { todayKst } from "@/lib/time";

export const metadata = { title: "시작하기 · 꿈의숲키우기" };

/**
 * Where a scanned personal QR card lands. Parental consent does not stop a child here:
 * teachers see "동의서 확인 필요" on the profile and collect the paper form later.
 */
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const child = await childByToken(token);
  if (!child) return <Stop title={"카드를 다시 확인해 주세요"} lines={["이 카드로는 들어갈 수 없어요.", "카드를 다시 찍어 보고, 계속 안 되면 선생님께 보여 주세요."]} />;
  // Setting the "remembered card" cookie has to happen in a route handler, not while rendering a page.
  if (child.has_pin) redirect(`/join/${encodeURIComponent(token)}/card`);

  return (
    <JoinWizard
      entry={{ kind: "card", token }}
      today={todayKst()}
      classes={await classChoices()}
      pinOnly={child.onboarded_at !== null}
      prefill={{
        name: child.name,
        gender: child.gender ?? "",
        birthYear: child.birth_year ?? (child.birth_date ? Number(child.birth_date.slice(0, 4)) : null),
        school: child.school ?? "",
        classId: child.class_id,
      }}
    />
  );
}
