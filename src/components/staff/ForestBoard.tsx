"use client";

import { useState } from "react";
import { ForestMap } from "@/components/kid/ForestMap";
import { EVENTS, eventOn, FOREST_ITEMS, FOREST_SIZE, SEASON_NAMES, seasonOn, timeOfDay, type ForestState } from "@/lib/forest";
import { applyForestControl, AUTO_FOREST, FOREST_EVENTS, FOREST_SEASONS, FOREST_TIMES, FRESH_MAX, isAutoForest, readForestControl, TIME_NAMES, type ForestControl } from "@/lib/forest-control";
import { ChoiceChips, FieldGroup, NumberStepper, SaveBar, SubmitButton } from "./form-kit";
import { Notice } from "./kit";

const same = (a: ForestControl, b: ForestControl) => (Object.keys(AUTO_FOREST) as (keyof ForestControl)[]).every((k) => a[k] === b[k]);

/** What is set by hand, in words, for the note at the top. */
function byHand(c: ForestControl): string[] {
  return [
    c.count !== null ? `숲의 크기(${c.count}가지)` : null,
    c.fresh !== null ? "새로 생긴 것" : null,
    c.rain !== "auto" ? "물방울 비" : null,
    c.season !== "auto" ? `계절(${SEASON_NAMES[c.season]})` : null,
    c.event !== "auto" ? `절기(${c.event === "none" ? "없음" : EVENTS[c.event].name})` : null,
    c.time !== "auto" ? `시간(${TIME_NAMES[c.time]})` : null,
    c.sunday !== "auto" ? "주일 모습" : null,
    c.aurora !== "auto" ? "오로라" : null,
  ].filter((x) => x !== null);
}

/**
 * "우리 숲" for admins: every part of the shared forest can be set by hand, and the forest beside the
 * controls changes at once. Saving sets it for every child. A part left on 자동 follows the forest's
 * own rules; a part set by hand stays until it is put back.
 *
 * The 64 things come in a fixed order, so the size is one number: everything up to it is there.
 * `now` is the server's time when the page was made (the preview's "자동" time of day starts from it).
 */
export function ForestBoard({ auto, saved, today, now, action }: { auto: ForestState; saved: ForestControl; today: string; now: string; action: (formData: FormData) => void | Promise<void> }) {
  const [c, setC] = useState<ForestControl>(saved);
  const set = (patch: Partial<ForestControl>) => setC((old) => readForestControl({ ...old, ...patch }));
  const view = applyForestControl(auto, c, today);
  const { timeFixed, ...forest } = view;
  const changed = !same(c, saved);
  const hand = byHand(saved);
  const autoEvent = eventOn(today);
  const autoSeason = autoEvent ? EVENTS[autoEvent].season : seasonOn(today);
  const autoTime = timeOfDay(new Date(now), view.season);
  const size = c.count ?? auto.count;

  return (
    <form action={action} className="flex grow flex-col gap-4">
      <Notice tone={hand.length > 0 ? "warn" : "gray"}>
        {hand.length > 0 ? `지금 직접 정해 둔 것: ${hand.join(", ")}. 자동으로 돌릴 때까지 모든 아이에게 이대로 보여요.` : "지금은 모두 자동이에요. 숲은 주일마다 자라고, 계절과 시간은 날짜와 시계를 따라가요."}
      </Notice>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-6">
        <div className="sticky top-2 z-[5] -mx-1 flex flex-col gap-2 rounded-[20px] bg-white px-1 pb-2 lg:top-4 lg:mx-0 lg:p-0">
          <div className="relative mx-auto h-[270px] w-full max-w-[400px] overflow-hidden rounded-[18px] bg-fill sm:h-[380px] lg:h-[620px]">
            <ForestMap {...forest} time={timeFixed ?? autoTime} timeFixed={timeFixed !== null} preview />
          </div>
          <p className="m-0 text-center text-[12.5px] leading-[18px] text-mute">미리 보기예요. 손가락으로 돌려 볼 수 있어요. 저장해야 아이들 화면이 바뀌어요.</p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <ChoiceChips
            legend="숲의 크기"
            name="count_mode"
            value={c.count === null ? "auto" : "hand"}
            onChange={(v) => set({ count: v === "auto" ? null : auto.count })}
            options={[
              { value: "auto", label: `자동 (지금 ${auto.count}가지)` },
              { value: "hand", label: "직접 정하기" },
            ]}
            hint={`숲에는 ${FOREST_SIZE}가지가 정해진 순서로 생겨요. 자동은 주일마다 하나씩(미션을 많이 한 주에는 더) 자라요. 직접 정한 동안에도 원래 숲은 계속 자라고 있어서, 자동으로 돌리면 그 숲이 다시 보여요.`}
          />
          {c.count !== null ? (
            <>
              <NumberStepper label="보여 줄 개수" name="count" value={c.count} onChange={(n) => set({ count: n })} min={0} max={FOREST_SIZE} unit="가지" hint={c.count > 0 ? `첫 번째 ‘${FOREST_ITEMS[0]}’부터 ${c.count}번째 ‘${FOREST_ITEMS[c.count - 1]}’까지 보여요.` : "아직 아무것도 없는 숲이에요. 교회만 보여요."} />
              <details className="rounded-xl bg-fill px-3.5 py-2.5">
                <summary className="cursor-pointer text-[13px] font-semibold text-ink2">목록에서 골라 정하기</summary>
                <p className="m-0 mt-2 text-[12.5px] leading-[18px] text-mute">누른 것까지 생겨요. 색이 칠해진 것이 지금 숲에 있는 것이에요.</p>
                <ol className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
                  {FOREST_ITEMS.map((name, i) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => set({ count: i + 1 })}
                        aria-pressed={i < size}
                        className={`flex min-h-9 cursor-pointer items-center rounded-full border-0 px-3 text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff ${i < size ? "bg-staff text-white" : "bg-white text-sub"}`}
                      >
                        {i + 1}. {name}
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          ) : null}
          <ChoiceChips
            legend="이번 주에 새로 생긴 것"
            name="fresh"
            value={c.fresh === null ? "auto" : String(c.fresh)}
            onChange={(v) => set({ fresh: v === "auto" ? null : Number(v) })}
            options={[{ value: "auto", label: "자동" }, { value: "0", label: "없음" }, ...Array.from({ length: FRESH_MAX }, (_, i) => ({ value: String(i + 1), label: `${i + 1}가지` }))]}
            hint="마지막에 생긴 것들이 반짝이고 이름이 아래에 나와요. 아이가 숲을 처음 열 때 화면이 새것마다 다가가서 보여 줘요. 크기를 직접 정했을 때 자동은 ‘없음’이에요."
          />
          <ChoiceChips
            legend="물방울 비"
            name="rain"
            value={c.rain}
            onChange={(v) => set({ rain: v as ForestControl["rain"] })}
            options={[
              { value: "auto", label: "자동" },
              { value: "on", label: "내리기" },
              { value: "off", label: "안 내리기" },
            ]}
            hint="새로 생긴 것이 있을 때만 내려요. 숲을 열면 잠깐 내리다 그치고 무지개가 떠요. 자동은 지난주에 미션을 많이 한 주에 내려요."
          />
          <ChoiceChips
            legend="계절"
            name="season"
            value={c.season}
            onChange={(v) => set({ season: v as ForestControl["season"] })}
            options={[{ value: "auto", label: `자동 (오늘은 ${SEASON_NAMES[autoSeason]})` }, ...FOREST_SEASONS.map((s) => ({ value: s, label: SEASON_NAMES[s] }))]}
          />
          <ChoiceChips
            legend="절기와 행사"
            name="event"
            value={c.event}
            onChange={(v) => set({ event: v as ForestControl["event"] })}
            options={[{ value: "auto", label: `자동 (오늘은 ${autoEvent ? EVENTS[autoEvent].name : "없음"})` }, { value: "none", label: "없음" }, ...FOREST_EVENTS.map((e) => ({ value: e, label: EVENTS[e].name }))]}
            hint="절기를 고르면 계절도 그 절기에 맞게 바뀌어요. 계절을 따로 고르면 고른 계절이 먼저예요."
          />
          <ChoiceChips
            legend="시간"
            name="time"
            value={c.time}
            onChange={(v) => set({ time: v as ForestControl["time"] })}
            options={[{ value: "auto", label: `자동 (지금은 ${TIME_NAMES[autoTime]})` }, ...FOREST_TIMES.map((t) => ({ value: t, label: TIME_NAMES[t] }))]}
            hint="자동은 한국 시각을 따라 낮, 저녁, 밤으로 바뀌어요."
          />
          <ChoiceChips
            legend="주일 모습"
            name="sunday"
            value={c.sunday}
            onChange={(v) => set({ sunday: v as ForestControl["sunday"] })}
            options={[
              { value: "auto", label: "자동 (주일에만)" },
              { value: "on", label: "교회 문 열기" },
            ]}
            hint="교회 문이 열리고 종이 흔들려요."
          />
          <ChoiceChips
            legend="오로라"
            name="aurora"
            value={c.aurora}
            onChange={(v) => set({ aurora: v as ForestControl["aurora"] })}
            options={[
              { value: "auto", label: "자동" },
              { value: "on", label: "보이기" },
              { value: "off", label: "안 보이기" },
            ]}
            hint="밤에만 보여요. 자동은 겨울 밤 가운데 사흘에 한 번이에요."
          />
          <FieldGroup legend="한꺼번에">
            <button
              type="button"
              onClick={() => setC(AUTO_FOREST)}
              disabled={isAutoForest(c)}
              className="flex h-11 cursor-pointer items-center self-start rounded-xl border-0 bg-fill px-4 text-[14px] font-semibold text-ink2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-staff disabled:cursor-default disabled:opacity-50"
            >
              모두 자동으로 돌리기
            </button>
          </FieldGroup>
        </div>
      </div>
      <SaveBar>
        <SubmitButton disabled={!changed}>{changed ? "이대로 정하기" : "지금 모습이에요"}</SubmitButton>
      </SaveBar>
    </form>
  );
}
