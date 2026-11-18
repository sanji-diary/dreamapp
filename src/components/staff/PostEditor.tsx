"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Checkbox, SwitchRow } from "./form-kit";
import { LineIcon } from "./kit";
import { PhotoInput } from "./widgets";

/**
 * The writing area of 소식 글 (design-reference/admin2/Write.dc.html), inside the page's <form>:
 * the text on a large white sheet, the photo, and at the right the settings and a preview of how
 * the post looks on the children's screen, which follows what is typed.
 * Below `lg` the settings and the preview follow the sheet.
 */
export function PostEditor({ body: initialBody, image, commentsOpen, author, error }: { body: string; image: string | null; commentsOpen: boolean; author: string; error?: string | null }) {
  const [body, setBody] = useState(initialBody);
  const [comments, setComments] = useState(commentsOpen);
  const [picked, setPicked] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  useEffect(() => () => void (picked && URL.revokeObjectURL(picked)), [picked]);
  const photo = picked ?? (removed ? null : image);

  // PhotoInput's file field is inside the sheet; its change bubbles up to here for the preview.
  const onChange = (e: FormEvent<HTMLElement>) => {
    const el = e.target as unknown as HTMLInputElement;
    if (el.type === "file" && el.files?.[0]) setPicked(URL.createObjectURL(el.files[0]));
    if (el.name === "remove_image") setRemoved(el.checked);
  };

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <section aria-label="글 쓰는 곳" onChange={onChange} className="flex min-w-0 flex-col rounded-[20px] bg-fill lg:grow-[3] lg:basis-0 lg:rounded-2xl lg:border lg:border-staff-line lg:bg-white lg:shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        <div className="px-4 pt-4 lg:px-6 lg:pt-5">
          <label htmlFor="p-body" className="sr-only">
            내용
          </label>
          <textarea
            id="p-body"
            name="body"
            required
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="아이들에게 전할 이야기를 써 주세요"
            aria-invalid={error ? true : undefined}
            className="block min-h-[260px] w-full resize-y border-0 bg-transparent p-0 text-[16px] leading-[1.8] text-ink outline-none placeholder:text-mute lg:min-h-[340px] lg:text-[16.5px]"
          />
          <p className="m-0 border-b border-[#e5e8ee] pt-2 pb-3 text-right text-[13px] text-mute lg:border-[#eef0f4]">{body.length} / 2000자</p>
          {error ? (
            <p role="alert" className="m-0 pt-2 text-[13px] font-bold text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 px-4 pt-4 pb-4 lg:px-6 lg:pb-6">
          <div className="flex flex-wrap items-baseline gap-x-2.5">
            <b className="text-[15px]">사진</b>
            <span className="text-[13px] text-mute">한 장 넣을 수 있어요 · 사진 동의를 받은 아이만 나오게 해 주세요</span>
          </div>
          <div className="w-fit rounded-2xl bg-white p-3 lg:bg-staff-canvas">
            <PhotoInput current={image} round={false} max={1200} label={image ? "사진 바꾸기" : "사진 고르기"} />
          </div>
          {image ? <Checkbox name="remove_image" label="사진 빼기" /> : null}
        </div>
      </section>

      <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:max-w-[360px] lg:grow lg:basis-[320px]">
        <section aria-labelledby="set-h" className="flex flex-col gap-3 rounded-[20px] bg-fill p-4 lg:rounded-2xl lg:border lg:border-staff-line lg:bg-white lg:px-5 lg:py-[18px] lg:shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <h2 id="set-h" className="m-0 text-[17px] font-bold tracking-[-0.02em]">
            올리기 설정
          </h2>
          <SwitchRow onGray label="댓글 받기" hint={comments ? "아이들이 댓글을 달 수 있어요" : "이 글에는 댓글을 받지 않아요"} name="comments_open" checked={comments} onChange={setComments} />
        </section>

        <section aria-labelledby="pv-h" className="flex flex-col gap-3 rounded-[20px] bg-fill p-4 lg:rounded-2xl lg:border lg:border-staff-line lg:bg-white lg:px-5 lg:py-[18px] lg:shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <h2 id="pv-h" className="m-0 text-[17px] font-bold tracking-[-0.02em]">
            아이 화면 미리 보기
          </h2>
          <div className="rounded-[18px] bg-white p-3.5 lg:bg-[#f2f5fb]">
            <div className="flex flex-col gap-2.5 rounded-[14px] bg-white p-3.5 shadow-[0_1px_3px_rgba(17,24,39,0.06)]">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="grid h-[30px] w-[30px] place-items-center rounded-full bg-staff-tint text-[12px] font-bold text-staff">
                  {author.slice(0, 1)}
                </span>
                <span className="flex flex-col leading-[1.3]">
                  <b className="text-[13.5px]">{author}</b>
                  <span className="text-[12px] text-mute">숲 소식 · 방금</span>
                </span>
              </div>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={photo} className="block max-h-[200px] w-full rounded-[10px] object-cover" />
              ) : null}
              <p className={`m-0 line-clamp-6 text-[14px] leading-[1.65] whitespace-pre-line ${body.trim() ? "text-ink2" : "text-mute"}`}>{body.trim() ? body : "내용을 쓰면 여기에 보여요"}</p>
              <div className="flex gap-3.5 border-t border-[#f1f3f6] pt-2 text-[13px] text-sub">
                <span className="inline-flex items-center gap-1">
                  <LineIcon name="leaf" size={14} />
                  좋아요 0
                </span>
                <span>{comments ? "댓글 0" : "댓글 받지 않음"}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
