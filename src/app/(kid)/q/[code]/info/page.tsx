import Link from "next/link";
import { Icon, primaryButtonClass } from "@/components/ui";
import { requireKid } from "@/lib/auth";

export const metadata = { title: "QR 미션 · 꿈의숲키우기" };

/** What to say when a scanned mission QR did not finish a mission. `why` only picks one of these fixed texts. */
const NOTES: Record<string, { icon: string; title: string; lines: string[] }> = {
  already: { icon: "stamp", title: "이미 했어요", lines: ["이 QR 미션은 벌써 마쳤어요.", "물방울은 처음 찍었을 때 잘 들어갔어요."] },
  closed: { icon: "cloud", title: "지금은 열려 있지 않아요", lines: ["이 QR은 정해진 날에만 찍을 수 있어요.", "언제 찍는지 선생님께 물어봐 주세요."] },
  not_yours: { icon: "cloud", title: "다른 반 친구들의 미션이에요", lines: ["이 QR은 다른 친구들을 위한 거예요.", "내 미션은 미션 목록에서 볼 수 있어요."] },
  ask_teacher: { icon: "pray", title: "선생님께 말해 주세요", lines: ["오늘 출석이 다르게 적혀 있어요.", "선생님께 왔다고 말하면 바로 고쳐 주세요."] },
  unknown: { icon: "cloud", title: "QR을 다시 찍어 볼까요?", lines: ["이 QR로는 미션을 찾지 못했어요.", "교회에 붙어 있는 QR을 다시 찍어 보고, 계속 안 되면 선생님께 보여 주세요."] },
};

export default async function ScanInfoPage({ searchParams }: { searchParams: Promise<{ why?: string | string[] }> }) {
  await requireKid();
  const { why } = await searchParams;
  const note = NOTES[typeof why === "string" && why in NOTES ? why : "unknown"];
  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="step-in flex grow flex-col items-center justify-center gap-2 px-6 text-center">
        <div aria-hidden="true" className="mb-3 flex h-[112px] w-[112px] items-center justify-center rounded-full bg-fill">
          <Icon name={note.icon} size={72} />
        </div>
        <h1 className="m-0 text-[26px] leading-[35px] font-bold tracking-[-0.6px]">{note.title}</h1>
        {note.lines.map((l) => (
          <p key={l} className="m-0 text-[15px] leading-[22px] text-sub">
            {l}
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-1 px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
        <Link href="/home" className={`${primaryButtonClass} h-[54px] rounded-[14px] text-[17px] no-underline`}>
          내 나무로 가기
        </Link>
        <Link href="/missions" className="flex h-11 items-center justify-center text-[15px] font-semibold text-sub underline underline-offset-2">
          다른 미션 보기
        </Link>
      </div>
    </main>
  );
}
