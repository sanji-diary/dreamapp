"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui";
import { commentAction, deleteCommentAction, likeAction, reportCommentAction } from "@/lib/kid/actions";

export interface PostView {
  id: number;
  body: string;
  imageUrl: string | null;
  commentsOpen: boolean;
  dateLabel: string;
  likes: number;
  liked: boolean;
  comments: { id: number; body: string; author: string; avatarId: number; mine: boolean; byStaff: boolean; reported: boolean }[];
}

const MAX = 100;

/* eslint-disable @next/next/no-img-element */
export function PostCard({ post, rewardHint }: { post: PostView; rewardHint: string | null }) {
  const [like, setLike] = useState({ liked: post.liked, likes: post.likes });
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ text: string; tone: "ok" | "error" }>({ text: "", tone: "ok" });
  const [pending, start] = useTransition();

  function toggleLike() {
    const before = like;
    // Show the tap at once, then take the server's count.
    setLike({ liked: !before.liked, likes: before.likes + (before.liked ? -1 : 1) });
    start(async () => {
      try {
        const r = await likeAction(post.id);
        if (r) setLike(r);
      } catch {
        setLike(before);
      }
    });
  }

  function send() {
    const body = text.trim();
    if (!body || pending) return;
    start(async () => {
      try {
        const r = await commentAction(post.id, body);
        if (!r.ok) {
          setNote({ text: r.message, tone: "error" });
          return;
        }
        setText("");
        if (r.missionDone) {
          const got = [r.drops > 0 ? `물방울 ${r.drops}개` : "", r.points > 0 ? `${r.points}P` : ""].filter(Boolean).join("와 ");
          setNote({ text: got ? `댓글 미션 완료! ${got}를 받았어요` : "댓글 미션 완료!", tone: "ok" });
        } else setNote({ text: "", tone: "ok" });
      } catch {
        setNote({ text: "연결이 잠시 끊겼어요. 다시 해 주세요.", tone: "error" });
      }
    });
  }

  const inputId = `cmt-${post.id}`;

  return (
    <article className="border-b-8 border-fill pb-3 last:border-b-0">
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E3F0D6]">
          <img alt="" src="/img/tree-flower.webp" style={{ width: 30, height: 30, objectFit: "contain" }} />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold text-ink2">소년부</span>
          <span className="text-[13px] text-mute">{post.dateLabel}</span>
        </div>
      </div>
      {post.imageUrl ? <img alt="소식 사진" src={post.imageUrl} className="mx-4 mt-3 block max-h-[420px] w-[calc(100%-32px)] rounded-2xl bg-fill object-cover" /> : null}
      <p className="mx-4 mt-3 mb-0 text-[15px] leading-[23px] break-words whitespace-pre-line text-ink2">{post.body}</p>
      <div className="flex items-center gap-1 px-2 pt-1.5">
        <button type="button" onClick={toggleLike} aria-pressed={like.liked} aria-label={`좋아요 ${like.likes}`} className="flex h-11 cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2 text-[14px] font-bold text-ink2">
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill={like.liked ? "#E5484D" : "none"} stroke={like.liked ? "#E5484D" : "#333D4B"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.600 12 20 12 20z" />
          </svg>
          좋아요 {like.likes}
        </button>
        <div className="flex h-11 items-center gap-1.5 px-2 text-[14px] font-bold text-ink2">
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333D4B" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 5h14v11H10l-5 4z" />
          </svg>
          댓글 {post.comments.length}
        </div>
        <div className="grow" />
        {rewardHint && post.commentsOpen ? <div className="mr-2 flex h-[30px] items-center rounded-md bg-navy-tint px-2.5 text-[12px] font-bold text-navy">{rewardHint}</div> : null}
      </div>
      {post.comments.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-3 px-4 pt-2 pb-0">
          {post.comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <Avatar name={c.byStaff ? "선생님" : c.author} id={c.avatarId} size={32} />
              <div className="min-w-0 grow pt-1.5 text-[14px] leading-5 break-words text-ink2">
                <span className="font-bold">{c.author}</span> {c.body}
              </div>
              {c.mine ? (
                <form action={deleteCommentAction.bind(null, c.id)} className="-my-1.5 shrink-0">
                  <button type="submit" aria-label="내 댓글 지우기" className="h-11 cursor-pointer border-0 bg-transparent px-1 text-[13px] font-semibold text-mute">
                    지우기
                  </button>
                </form>
              ) : c.byStaff ? null : c.reported ? (
                <span className="-my-1.5 flex h-11 shrink-0 items-center px-1 text-[13px] font-semibold text-mute">신고함</span>
              ) : (
                <form
                  action={reportCommentAction.bind(null, c.id)}
                  onSubmit={(e) => {
                    if (!window.confirm("이 댓글을 선생님께 알릴까요?")) e.preventDefault();
                  }}
                  className="-my-1.5 shrink-0"
                >
                  <button type="submit" aria-label={`${c.author}의 댓글 신고하기`} className="h-11 cursor-pointer border-0 bg-transparent px-1 text-[13px] font-semibold text-mute">
                    신고
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {post.commentsOpen ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2 px-4 pt-3"
        >
          <label htmlFor={inputId} className="sr-only">
            댓글 쓰기
          </label>
          <input
            id={inputId}
            value={text}
            maxLength={MAX}
            autoComplete="off"
            enterKeyHint="send"
            onChange={(e) => {
              setText(e.target.value);
              if (note.tone === "error") setNote({ text: "", tone: "ok" });
            }}
            placeholder="댓글을 적어 보세요"
            className="h-11 min-w-0 grow rounded-full border-0 bg-fill px-3.5 text-[15px] text-ink outline-none focus:outline-2 focus:outline-navy"
          />
          <button type="submit" disabled={pending || text.trim() === ""} className="h-11 w-[60px] shrink-0 cursor-pointer rounded-full border-0 bg-navy text-[14px] font-bold text-white disabled:bg-fill disabled:text-sub">
            올리기
          </button>
        </form>
      ) : (
        <p className="mx-4 mt-3 mb-0 text-[13px] text-mute">이 소식에는 댓글을 달 수 없어요</p>
      )}
      <p role={note.tone === "error" ? "alert" : "status"} className={`mx-4 mt-1.5 mb-0 min-h-5 text-[13px] font-semibold ${note.tone === "error" ? "text-danger" : "text-navy"}`}>
        {note.text}
      </p>
    </article>
  );
}
