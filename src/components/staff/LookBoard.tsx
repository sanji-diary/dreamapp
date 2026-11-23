"use client";

import { useRef, useState } from "react";
import { TreeScene, useSceneFit } from "@/components/kid/TreeScene";
import { SEASON_NAMES } from "@/lib/forest";
import { FESTIVAL_NAMES, FESTIVALS, homeLook, lookName, readLookChoice, SEASONS, type LookChoice } from "@/lib/kid/home-look";
import { LEVEL_NAMES } from "@/lib/types";
import { ChoiceChips, SaveBar, SubmitButton } from "./form-kit";
import { Notice } from "./kit";

/**
 * "첫 화면 모습": the admin picks a season and a special time and sees the child's tree screen change
 * at once. Saving sets it for every child. 자동 follows the calendar; a hand-set look stays until it is
 * changed back. The tree stage here is only for looking: each child keeps their own tree.
 */
export function LookBoard({ saved, today, action }: { saved: LookChoice; today: string; action: (formData: FormData) => void | Promise<void> }) {
  const [choice, setChoice] = useState<LookChoice>(saved);
  const [level, setLevel] = useState(4);
  const box = useRef<HTMLDivElement>(null);
  const floor = useRef<HTMLDivElement>(null);
  const fit = useSceneFit(box, floor, 24);

  const auto = homeLook(today);
  const now = homeLook(today, saved);
  const look = homeLook(today, choice);
  const byHand = saved.season !== "auto" || saved.festival !== "auto";
  const changed = choice.season !== saved.season || choice.festival !== saved.festival;

  return (
    <form action={action} className="flex grow flex-col gap-4">
      <Notice tone={byHand ? "warn" : "gray"}>
        지금 아이들 화면은 {lookName(now)} 모습이에요. {byHand ? "직접 고른 모습이라 날짜가 바뀌어도 그대로예요." : "날짜대로 바뀌고 있어요."}
      </Notice>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-6">
        <div className="sticky top-2 z-[5] -mx-1 flex flex-col gap-2 rounded-[20px] bg-white px-1 pb-2 lg:static lg:mx-0 lg:p-0">
          <div ref={box} className="relative mx-auto h-[250px] w-full max-w-[360px] overflow-hidden rounded-[18px] bg-fill sm:h-[330px] lg:h-[400px]">
            <TreeScene level={level} fit={fit} look={look} />
            <div ref={floor} aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3" />
            <p className="absolute top-2.5 left-2.5 m-0 rounded-full bg-white/90 px-3 py-1 text-[12px] font-bold text-ink2">미리 보기 · {lookName(look)}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <ChoiceChips
            legend="계절"
            name="season"
            value={choice.season}
            onChange={(v) => setChoice((c) => readLookChoice({ ...c, season: v }))}
            options={[{ value: "auto", label: `자동 (오늘은 ${SEASON_NAMES[auto.season]})` }, ...SEASONS.map((s) => ({ value: s, label: SEASON_NAMES[s] }))]}
          />
          <ChoiceChips
            legend="절기와 행사"
            name="festival"
            value={choice.festival}
            onChange={(v) => setChoice((c) => readLookChoice({ ...c, festival: v }))}
            options={[
              { value: "auto", label: `자동 (오늘은 ${auto.festival ? FESTIVAL_NAMES[auto.festival] : "없음"})` },
              { value: "none", label: "없음" },
              ...FESTIVALS.map((f) => ({ value: f, label: FESTIVAL_NAMES[f] })),
            ]}
            hint="자동은 날짜대로 바뀌어요. 직접 고르면 다시 자동으로 돌릴 때까지 그대로예요."
          />
          <ChoiceChips
            legend="미리 볼 나무"
            name="preview_level"
            value={String(level)}
            onChange={(v) => setLevel(Number(v))}
            options={LEVEL_NAMES.map((n, i) => ({ value: String(i + 1), label: n }))}
            hint="여기서만 바꿔 보는 거예요. 아이들 나무는 그대로예요."
          />
        </div>
      </div>
      <SaveBar>
        <SubmitButton disabled={!changed}>{changed ? "이 모습으로 정하기" : "지금 모습이에요"}</SubmitButton>
      </SaveBar>
    </form>
  );
}
