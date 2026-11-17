"use client";

import { useState } from "react";
import { inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { talentEventAction } from "@/lib/staff/actions-festival";
import type { PreviewRow } from "@/lib/staff/festival";
import { MAX_RATE, MIN_RATE, summarize, talentsFor } from "@/lib/talent-math";

const TRY = [5, 10, 20, 50, 100];

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[12px] text-sub">{label}</span>
      <span className="text-[17px] font-bold tracking-[-0.3px]">{value}</span>
    </div>
  );
}

const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });

/**
 * A draft event: the pastor tries rates and sees what every child would get. The numbers on
 * this screen are only a preview; the server computes the real grants again when the event opens.
 */
export function TalentDraft({ id, name, rate: savedRate, rows }: { id: number; name: string; rate: number; rows: PreviewRow[] }) {
  const [text, setText] = useState(String(savedRate));
  const rate = /^\d{1,5}$/.test(text) ? Number(text) : 0;
  const valid = rate >= MIN_RATE && rate <= MAX_RATE;
  const talents = rows.map((r) => talentsFor(r.points, rate));
  const sum = summarize(talents);
  const totalPoints = rows.reduce((a, r) => a + Math.max(0, r.points), 0);
  const confirmText = [
    `${rate}P = 1달란트로 잔치를 시작할까요?`,
    "",
    `· 지금 포인트로 아이 ${sum.count}명에게 달란트 ${num(sum.total)}개를 나눠요.`,
    "· 시작한 뒤에는 비율을 바꿀 수 없어요.",
    "· 포인트는 줄어들지 않고 한 해 기록으로 그대로 남아요.",
    "· 선생님들 화면에 결제 버튼이, 아이들 화면에 내 달란트가 보여요.",
  ].join("\n");

  return (
    <form action={talentEventAction} className="flex flex-col px-4 pb-6">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="td-name" className={labelClass}>
            잔치 이름
          </label>
          <input id="td-name" name="name" defaultValue={name} required maxLength={30} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="td-rate" className={labelClass}>
            달란트 1개에 필요한 포인트
          </label>
          <div className="flex items-center gap-2">
            <input
              id="td-rate"
              name="rate"
              type="number"
              inputMode="numeric"
              min={MIN_RATE}
              max={MAX_RATE}
              required
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              aria-describedby="td-rate-help"
              className={`${inputClass} min-w-0 grow`}
            />
            <span className="shrink-0 text-[15px] font-semibold text-ink2">P = 1달란트</span>
          </div>
          <div className="flex flex-wrap gap-x-1.5" role="group" aria-label="비율 넣어 보기">
            {TRY.map((n) => (
              <button key={n} type="button" aria-pressed={rate === n} onClick={() => setText(String(n))} className="flex h-11 cursor-pointer items-center border-0 bg-transparent p-0">
                <span className={`flex h-[34px] items-center rounded-lg px-3 text-[14px] font-semibold ${rate === n ? "bg-navy text-white" : "bg-fill text-sub"}`}>{n}P</span>
              </button>
            ))}
          </div>
          <p id="td-rate-help" className="m-0 text-[12px] leading-[18px] text-mute">
            숫자를 바꾸면 아래 미리 보기가 바로 바뀌어요. 아직 아이들에게는 아무것도 바뀌지 않아요.
          </p>
        </div>
      </div>

      <div aria-live="polite" className="mt-4 flex flex-col gap-3 rounded-2xl bg-fill p-4">
        {valid ? (
          <>
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-sub">나눠 줄 달란트 (아이 {sum.count}명)</span>
                <span className="text-[28px] leading-[34px] font-bold tracking-[-0.6px]">{num(sum.total)}개</span>
              </div>
              <span className="pb-1 text-[13px] text-sub">포인트 합계 {num(totalPoints)}P</span>
            </div>
            <div className="grid grid-cols-3">
              <Tile label="가장 적은 아이" value={`${num(sum.min)}개`} />
              <Tile label="가운데 아이" value={`${num(sum.median)}개`} />
              <Tile label="가장 많은 아이" value={`${num(sum.max)}개`} />
            </div>
          </>
        ) : (
          <p className="m-0 text-[14px] leading-[21px] font-semibold text-danger">
            {MIN_RATE}에서 {MAX_RATE.toLocaleString("ko-KR")} 사이 숫자를 넣어 주세요.
          </p>
        )}
      </div>

      <table className="mt-3 w-full border-collapse text-[14px]">
        <caption className="sr-only">아이별 미리 보기</caption>
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-mute">
            <th scope="col" className="h-9 font-semibold">
              이름
            </th>
            <th scope="col" className="font-semibold">
              반
            </th>
            <th scope="col" className="text-right font-semibold">
              포인트
            </th>
            <th scope="col" className="w-[76px] text-right font-semibold">
              달란트
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-b border-line">
              <th scope="row" className="h-11 text-left font-bold text-ink2">
                {r.name}
              </th>
              <td className="text-sub">{r.class_name ?? "-"}</td>
              <td className="text-right text-sub">{r.points.toLocaleString("ko-KR")}P</td>
              <td className="text-right font-bold text-ink2">{valid ? `${talents[i]}개` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="m-0 py-6 text-center text-[14px] text-mute">아직 아이가 없어요.</p> : null}

      <div className="mt-5 flex flex-col gap-2">
        <button type="submit" name="op" value="save" disabled={!valid} className="flex h-[52px] w-full cursor-pointer items-center justify-center rounded-xl border-0 bg-fill text-[16px] font-bold text-ink2 disabled:text-faint">
          이 비율로 저장해 두기
        </button>
        <button
          type="submit"
          name="op"
          value="open"
          disabled={!valid}
          className={`${primaryButtonClass} cursor-pointer`}
          onClick={(e) => {
            if (!window.confirm(confirmText)) e.preventDefault();
          }}
        >
          잔치 시작
        </button>
        <p className="m-0 text-[12px] leading-[18px] text-mute">
          잔치를 시작하면 지금 포인트를 기준으로 달란트가 정해지고, 그 뒤로는 비율을 바꿀 수 없어요. 포인트는 줄어들지 않아요. 잔치 날 아침에 시작하는 것이 좋아요.
        </p>
        <button
          type="submit"
          name="op"
          value="delete"
          formNoValidate
          className="mt-2 flex h-11 w-fit cursor-pointer items-center border-0 bg-transparent p-0 text-[14px] font-bold text-danger"
          onClick={(e) => {
            if (!window.confirm("이 초안을 지울까요? 아이들에게는 아무것도 바뀌지 않아요.")) e.preventDefault();
          }}
        >
          초안 지우기
        </button>
      </div>
    </form>
  );
}
