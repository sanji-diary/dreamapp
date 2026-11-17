import { JoinWizard } from "@/components/kid/JoinWizard";
import { Stop } from "@/components/kid/Stop";
import { classChoices } from "@/lib/kid/onboarding";
import { joinCodeOpen } from "@/lib/self-join";
import { todayKst } from "@/lib/time";

export const metadata = { title: "가입하기 · 꿈의숲키우기" };

/**
 * Where the shared join QR lands: a child registers themselves, no teacher needed first.
 * The code is checked here and again when the answers are saved.
 */
export default async function StartPage({ params }: PageProps<"/start/[code]">) {
  const { code } = await params;
  if (!(await joinCodeOpen(code))) {
    return <Stop title={"이 QR로는\n가입할 수 없어요"} lines={["QR이 바뀌었거나 지금은 가입을 받지 않아요.", "선생님께 새 QR을 보여 달라고 말해 주세요."]} />;
  }
  return <JoinWizard entry={{ kind: "self", code }} today={todayKst()} classes={await classChoices()} prefill={{ name: "", gender: "", birthYear: null, school: "", classId: null }} />;
}
