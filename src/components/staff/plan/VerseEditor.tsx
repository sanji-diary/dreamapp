"use client";

import { useState } from "react";
import type { Verse } from "@/lib/types";
import { splitVerses, VERSE_MAX_COUNT, VERSE_MAX_LENGTH, VERSE_REF_MAX } from "@/lib/verse";
import { ErrorText, HintText, TextInput, fieldLabelClass, inputBoxClass, textareaBoxClass } from "../form-kit";
import { barButtonClass } from "../kit";

/**
 * The verses a child copies, one box per verse, with a paste helper: Bible text copied from an app
 * or a website is cut into verses by their numbers (splitVerses in src/lib/verse.ts).
 * Posts two fields with the form: `refName` (the reference) and `name` (the verses as JSON).
 * Lives inside a gray panel, so its boxes are white.
 */
export function VerseEditor({
  name = "verses",
  refName = "verse_ref",
  initialRef,
  initialVerses,
  error,
  idPrefix = "v",
}: {
  name?: string;
  refName?: string;
  initialRef: string | null;
  initialVerses: Verse[];
  error?: string;
  idPrefix?: string;
}) {
  const [verses, setVerses] = useState<Verse[]>(initialVerses.length > 0 ? initialVerses : [{ n: null, text: "" }]);
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  const change = (i: number, patch: Partial<Verse>) => setVerses((list) => list.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const remove = (i: number) => setVerses((list) => (list.length === 1 ? [{ n: null, text: "" }] : list.filter((_, j) => j !== i)));
  const add = () =>
    setVerses((list) => {
      if (list.length >= VERSE_MAX_COUNT) return list;
      // The next number follows the last one when it is a number.
      const last = Number(list[list.length - 1]?.n);
      return [...list, { n: Number.isInteger(last) && last > 0 ? String(last + 1) : null, text: "" }];
    });
  const split = () => {
    const found = splitVerses(paste);
    if (found.length === 0) {
      setPasteNote("나눌 말씀이 없어요. 본문을 붙여 넣어 주세요.");
      return;
    }
    const kept = found.slice(0, VERSE_MAX_COUNT);
    setVerses(kept);
    setPaste("");
    setPasteNote(found.length > VERSE_MAX_COUNT ? `${found.length}절 중 앞의 ${VERSE_MAX_COUNT}절만 넣었어요.` : `${kept.length}절로 나눴어요. 아래에서 확인해 주세요.`);
  };

  // Empty boxes are not sent: a half-filled list still saves what was written.
  const filled = verses.filter((v) => v.text.trim() !== "");

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <TextInput label="말씀 주소" name={refName} id={`${idPrefix}-ref`} maxLength={VERSE_REF_MAX} defaultValue={initialRef ?? ""} placeholder="예: 요한복음 3:16-17" />

      <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-white p-3">
        <label htmlFor={`${idPrefix}-paste`} className={fieldLabelClass}>
          붙여넣기 도우미
        </label>
        <textarea
          id={`${idPrefix}-paste`}
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setPasteNote(null);
          }}
          rows={5}
          placeholder={"16 하나님이 세상을 이처럼 사랑하사…\n17 하나님이 그 아들을 세상에 보내신 것은…"}
          aria-describedby={`${idPrefix}-paste-hint`}
          className={textareaBoxClass(false, true)}
        />
        <HintText id={`${idPrefix}-paste-hint`}>성경 앱에서 복사한 본문을 붙여 넣고 ‘절로 나누기’를 누르면 절 번호대로 나눠 줘요.</HintText>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={split} disabled={paste.trim() === ""} className={`${barButtonClass("solid")} disabled:cursor-default disabled:bg-fill disabled:text-faint`}>
            절로 나누기
          </button>
          {pasteNote ? (
            <span role="status" className="text-[13px] font-semibold text-staff">
              {pasteNote}
            </span>
          ) : null}
        </div>
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className={`${fieldLabelClass} mb-1.5 p-0`}>따라 쓸 말씀 ({filled.length} / {VERSE_MAX_COUNT}절)</legend>
        {verses.map((v, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-1.5 rounded-2xl bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${idPrefix}-n-${i}`} className="text-[13px] font-semibold whitespace-nowrap text-sub">
                {i + 1}번째 · 절 번호
              </label>
              <input
                id={`${idPrefix}-n-${i}`}
                value={v.n ?? ""}
                onChange={(e) => change(i, { n: e.target.value.replace(/\D/g, "").slice(0, 3) || null })}
                inputMode="numeric"
                placeholder="없음"
                className={`${inputBoxClass(false, true)} w-[76px] shrink-0`}
              />
              <button type="button" onClick={() => remove(i)} aria-label={`${i + 1}번째 절 지우기`} className={`${barButtonClass("ghost")} ml-auto`}>
                지우기
              </button>
            </div>
            <textarea
              aria-label={`${i + 1}번째 절 내용`}
              value={v.text}
              onChange={(e) => change(i, { text: e.target.value })}
              maxLength={VERSE_MAX_LENGTH}
              rows={2}
              aria-invalid={error ? true : undefined}
              className={textareaBoxClass(Boolean(error), true)}
            />
          </div>
        ))}
        {verses.length < VERSE_MAX_COUNT ? (
          <button type="button" onClick={add} className={`${barButtonClass("white")} self-start`}>
            + 절 추가
          </button>
        ) : (
          <HintText>말씀은 {VERSE_MAX_COUNT}절까지 넣을 수 있어요.</HintText>
        )}
        {error ? <ErrorText id={`${idPrefix}-error`}>{error}</ErrorText> : null}
        <HintText>아이들은 띄어쓰기와 문장부호까지 똑같이 써야 통과해요. 저장하기 전에 본문을 한 번 확인해 주세요.</HintText>
      </fieldset>
      <input type="hidden" name={name} value={JSON.stringify(filled.map((v) => ({ n: v.n, text: v.text })))} />
    </div>
  );
}
