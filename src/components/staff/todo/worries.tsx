import Link from "next/link";
import { Fragment } from "react";
import { Chevron, ClayIcon, EmptyNote, Tag } from "@/components/staff/kit";
import { AUDIENCE_LABEL, type WorryDetail, type WorryListItem } from "@/lib/staff/review";
import { WORRY_SENT_TO } from "@/lib/staff/todo";
import { shortDate } from "@/lib/staff/util";
import { formatKoreanDate } from "@/lib/time";
import { ReplyBox } from "./widgets";

/**
 * The worries this teacher may read, newest first. There is no preview of the words on purpose,
 * and the links are never prefetched: opening a worry records that it was read.
 * `current` marks the one that is open beside the list on wide screens.
 */
export function WorryList({ worries, current }: { worries: WorryListItem[]; current?: number }) {
  if (worries.length === 0) return <EmptyNote>아직 온 고민이 없어요.</EmptyNote>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {worries.map((w) => {
        const on = w.id === current;
        return (
          <li key={w.id} className="border-b border-line last:border-b-0">
            <Link
              href={`/staff/worries/${w.id}`}
              prefetch={false}
              aria-current={on ? "page" : undefined}
              className={`-mx-2 flex items-center gap-3 rounded-[14px] px-2 py-[13px] text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy ${on ? "bg-navy-tint" : "lg:hover:bg-fill"}`}
            >
              <span className="flex shrink-0 max-[319px]:hidden">
                <ClayIcon name="bubble" size="s" onWhite={on} />
              </span>
              <span className="flex min-w-0 grow flex-col">
                <span className="flex flex-wrap items-center gap-x-1.5">
                  <b className="text-[16px] tracking-[-0.02em]">{w.child_name}</b>
                  {w.unread ? <Tag tone="blue">새 글</Tag> : null}
                </span>
                <span className="text-[13px] text-mute">
                  {shortDate(w.written_on)} · {AUDIENCE_LABEL[w.audience]}
                  {w.replies > 0 ? ` · 답장 ${w.replies}` : ""}
                </span>
              </span>
              <Chevron />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Around the list: nothing on phones, a white card with a hairline beside the reading pane from `lg`. */
export const worryListFrame = "lg:rounded-[20px] lg:border lg:border-line lg:px-4 lg:py-1.5";

/** The two panes of the wide worry screens: the list on the left, the worry being read on the right. */
export const worryPanes = "flex flex-col lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start lg:gap-3.5";

interface Message {
  key: string;
  /** A teacher's reply (right, navy); otherwise the child's words (left, gray). */
  teacher: boolean;
  mine: boolean;
  text: string;
  on: string | null;
  by: string;
}

/**
 * One worry as a conversation: a notice saying who the child sent it to, the child's words on the
 * left, the teachers' replies on the right (this teacher's in navy, another reader's in navy tint),
 * each signed, with the date between days. The reply box stays at the bottom of the screen on phones.
 */
export function WorryThread({ w }: { w: WorryDetail }) {
  const to = WORRY_SENT_TO[w.audience];
  const messages: Message[] = [
    { key: "worry", teacher: false, mine: false, text: w.content, on: w.written_on, by: `${w.child_name}${w.class_name ? ` · ${w.class_name}` : ""}` },
    ...w.replies.map((r) => ({ key: `reply-${r.id}`, teacher: true, mine: r.mine, text: r.content, on: r.written_on, by: `${r.staff_name ? `${r.staff_name} 선생님` : "알 수 없음"}${r.mine ? " (나)" : ""}` })),
  ];
  return (
    <div className="flex grow flex-col gap-3.5">
      <div className="flex items-center gap-2.5 rounded-[14px] bg-navy-tint px-3.5 py-3">
        <span className="flex shrink-0 max-[319px]:hidden">
          <ClayIcon name="bubble" size="s" onWhite />
        </span>
        <p className="m-0 min-w-0 text-[13px] leading-[1.45] text-ink2">
          <b className="text-navy">{to.to}</b> {to.rest}
        </p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {messages.map((m, i) => (
          <Fragment key={m.key}>
            {m.on && (i === 0 || messages[i - 1].on !== m.on) ? <li className="py-0.5 text-center text-[13px] text-mute">{formatKoreanDate(m.on)}</li> : null}
            <li className={`flex flex-col gap-1 ${m.teacher ? "items-end" : "items-start"}`}>
              {m.teacher ? null : <span className="px-1 text-[12px] text-mute">{m.by}</span>}
              <p className={`m-0 max-w-[84%] rounded-[18px] px-3.5 py-[11px] text-[14.5px] leading-[1.5] whitespace-pre-line ${m.teacher ? (m.mine ? "bg-navy text-white" : "bg-navy-tint text-ink") : "bg-fill"}`}>{m.text}</p>
              {m.teacher ? <span className="px-1 text-[12px] text-mute">{m.by}</span> : null}
            </li>
          </Fragment>
        ))}
      </ol>
      {w.replies.length === 0 ? <p className="m-0 text-center text-[13px] text-mute">아직 답장이 없어요.</p> : null}
      <p className="m-0 pt-1 text-[12px] leading-[18px] text-mute">
        <span className="font-semibold text-warn">아이의 안전이 걱정되는 내용이면 교역자에게 알려 주세요.</span> 이 글은 아이가 고른 사람만 볼 수 있어요. 다른 사람에게 보여 주거나 옮겨 적지 말아 주세요.
      </p>
      <span className="grow" />
      <div className="sticky bottom-[76px] z-10 -mx-[18px] bg-white px-[18px] pt-2 pb-2.5 lg:static lg:mx-0 lg:p-0">
        {/* A new key after each reply: the box starts empty and one line tall again. */}
        <ReplyBox key={w.replies.length} worryId={w.id} />
      </div>
    </div>
  );
}
