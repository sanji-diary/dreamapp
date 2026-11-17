"use client";

import { useState } from "react";
import { talentEventAction } from "@/lib/staff/actions-festival";
import type { PreviewRow } from "@/lib/staff/festival";
import { MAX_RATE, MIN_RATE, summarize, talentsFor } from "@/lib/talent-math";
import { rowClass, tableClass, tdClass, thClass } from "./admin-kit";
import { Field, HintText, SaveBar, SubmitButton, TextInput, errorFor, inputBoxClass } from "./form-kit";
import { Card, EmptyNote, StatTile } from "./kit";

const TRY = [5, 10, 20, 50, 100];

const num = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });

/**
 * A draft event: the pastor tries rates and sees what every child would get. The numbers on
 * this screen are only a preview; the server computes the real grants again when the event opens.
 */
export function TalentDraft({ id, name, rate: savedRate, rows, error }: { id: number; name: string; rate: number; rows: PreviewRow[]; error?: string }) {
  const [text, setText] = useState(String(savedRate));
  const rate = /^\d{1,5}$/.test(text) ? Number(text) : 0;
  const valid = rate >= MIN_RATE && rate <= MAX_RATE;
  const talents = rows.map((r) => talentsFor(r.points, rate));
  const sum = summarize(talents);
  const totalPoints = rows.reduce((a, r) => a + Math.max(0, r.points), 0);
  const rateError = valid ? errorFor(error, /필요한 포인트/) : `${MIN_RATE}에서 ${MAX_RATE.toLocaleString("ko-KR")} 사이 숫자를 넣어 주세요.`;
  const confirmText = [
    `${rate}P = 1달란트로 잔치를 시작할까요?`,
    "",
    `· 지금 포인트로 아이 ${sum.count}명에게 달란트 ${num(sum.total)}개를 나눠요.`,
    "· 시작한 뒤에는 비율을 바꿀 수 없어요.",
    "· 포인트는 줄어들지 않고 한 해 기록으로 그대로 남아요.",
    "· 선생님들 화면에 결제 버튼이, 아이들 화면에 내 달란트가 보여요.",
  ].join("\n");

  return (
    <form action={talentEventAction} className="flex grow flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
      <input type="hidden" name="id" value={id} />
      <div className="flex min-w-0 flex-col gap-3.5">
        <TextInput label="잔치 이름" name="name" id="td-name" defaultValue={name} required maxLength={30} error={errorFor(error, /이름/)} />
        <Field label="달란트 1개에 필요한 포인트" htmlFor="td-rate" error={rateError} hint="숫자를 바꾸면 미리 보기가 바로 바뀌어요. 아직 아이들에게는 아무것도 바뀌지 않아요.">
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
              aria-invalid={rateError ? true : undefined}
              aria-describedby={`${rateError ? "td-rate-error " : ""}td-rate-hint`}
              className={inputBoxClass(Boolean(rateError))}
            />
            <span className="shrink-0 text-[15px] font-semibold text-ink2">P = 1달란트</span>
          </div>
          <div className="-my-[5px] flex flex-wrap gap-x-[7px]" role="group" aria-label="비율 넣어 보기">
            {TRY.map((n) => (
              <button key={n} type="button" aria-pressed={rate === n} onClick={() => setText(String(n))} className="group flex h-11 cursor-pointer items-center border-0 bg-transparent p-0 outline-none">
                <span className={`rounded-full px-3.5 py-2 text-[13px] leading-[1.4] font-semibold whitespace-nowrap group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy ${rate === n ? "bg-navy text-white" : "bg-fill text-sub"}`}>{n}P</span>
              </button>
            ))}
          </div>
        </Field>

        <div aria-live="polite" className="flex flex-col gap-3 rounded-[20px] bg-fill p-4">
          {valid ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-x-3">
                <div className="flex flex-col">
                  <span className="text-[13px] text-mute">나눠 줄 달란트 (아이 {sum.count}명)</span>
                  <b className="text-[26px] leading-[1.3] tracking-[-0.035em] text-blue">{num(sum.total)}개</b>
                </div>
                <span className="pb-1 text-[13px] text-mute">포인트 합계 {num(totalPoints)}P</span>
              </div>
              <div className="grid grid-cols-3 gap-2 [&>div]:bg-white">
                <StatTile value={`${num(sum.min)}개`} label="가장 적은 아이" />
                <StatTile value={`${num(sum.median)}개`} label="가운데 아이" />
                <StatTile value={`${num(sum.max)}개`} label="가장 많은 아이" />
              </div>
            </>
          ) : (
            <p className="m-0 py-2 text-center text-[14px] text-mute">비율을 넣으면 여기에 미리 보기가 보여요.</p>
          )}
        </div>
      </div>

      <Card className="lg:row-span-2">
        <table className={tableClass}>
          <caption className="sr-only">아이별 미리 보기</caption>
          <thead>
            <tr>
              <th scope="col" className={thClass()}>
                이름
              </th>
              <th scope="col" className={thClass()}>
                반
              </th>
              <th scope="col" className={thClass({ center: true })}>
                포인트
              </th>
              <th scope="col" className={thClass({ center: true })}>
                달란트
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={rowClass}>
                <th scope="row" className={`${tdClass()} text-left font-bold`}>
                  {r.name}
                </th>
                <td className={`${tdClass()} text-mute`}>{r.class_name ?? "-"}</td>
                <td className={tdClass({ center: true, nowrap: true })}>{r.points.toLocaleString("ko-KR")}P</td>
                <td className={`${tdClass({ center: true, nowrap: true })} font-bold text-blue`}>{valid ? `${talents[i]}개` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <EmptyNote>아직 아이가 없어요.</EmptyNote> : null}
      </Card>

      <div className="flex flex-col gap-1">
        <HintText>잔치를 시작하면 지금 포인트를 기준으로 달란트가 정해지고, 그 뒤로는 비율을 바꿀 수 없어요. 포인트는 줄어들지 않아요. 잔치 날 아침에 시작하는 것이 좋아요.</HintText>
        <button
          type="submit"
          name="op"
          value="delete"
          formNoValidate
          className="flex h-11 w-fit cursor-pointer items-center border-0 bg-transparent p-0 text-[14px] font-bold text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          onClick={(e) => {
            if (!window.confirm("이 초안을 지울까요? 아이들에게는 아무것도 바뀌지 않아요.")) e.preventDefault();
          }}
        >
          초안 지우기
        </button>
      </div>

      <SaveBar className="lg:col-start-1">
        <SubmitButton tone="gray" name="op" value="save" disabled={!valid}>
          저장해 두기
        </SubmitButton>
        <SubmitButton
          name="op"
          value="open"
          disabled={!valid}
          onClick={(e) => {
            if (!window.confirm(confirmText)) e.preventDefault();
          }}
        >
          잔치 시작
        </SubmitButton>
      </SaveBar>
    </form>
  );
}
