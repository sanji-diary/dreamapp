import type { ReactNode } from "react";
import { BackLink } from "@/components/ui";

/**
 * Top bar, headline and sub line shared by every mission screen (server component).
 * `notice` is one quiet line above the headline, for something the child should know first
 * (a teacher asked for the mission again).
 */
export function MissionShell({
  back = "/missions",
  backLabel = "미션 목록으로 돌아가기",
  reward,
  notice,
  title,
  sub,
  children,
}: {
  back?: string;
  backLabel?: string;
  reward?: string;
  notice?: string | null;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="flex items-center justify-between pt-[max(8px,env(safe-area-inset-top))] pr-4 pl-2">
        <BackLink href={back} label={backLabel} />
        {reward ? <div className="flex h-8 items-center rounded-2xl bg-navy-tint px-3 text-[13px] font-bold text-navy">{reward}</div> : null}
      </div>
      <div className="flex flex-col gap-1.5 px-5 pt-3">
        {notice ? <p className="m-0 mb-1 self-start rounded-lg bg-warn-tint px-2.5 py-1.5 text-[13px] leading-[18px] font-bold break-keep text-warn">{notice}</p> : null}
        <h1 className="m-0 text-[24px] leading-[33px] font-bold tracking-[-0.5px] whitespace-pre-line">{title}</h1>
        {sub ? <p className="m-0 text-[15px] leading-[22px] text-sub">{sub}</p> : null}
      </div>
      {children}
    </main>
  );
}

/** A quiet explanation block with an icon, for missions the child cannot finish on this screen. */
export function MissionNote({ icon, lines }: { icon: string; lines: string[] }) {
  return (
    <div className="mx-5 mt-5 flex items-center gap-3.5 rounded-2xl bg-fill px-4 py-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={`/img/icon-${icon}.webp`} style={{ width: 52, height: 52 }} />
      <div className="flex min-w-0 flex-col gap-0.5">
        {lines.map((l, i) => (
          <p key={l} className={`m-0 break-keep [overflow-wrap:anywhere] ${i === 0 ? "text-[16px] font-bold text-ink2" : "text-[14px] leading-5 text-sub"}`}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}
