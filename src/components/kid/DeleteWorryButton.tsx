"use client";

import { deleteWorryAction } from "@/lib/kid/actions";

export function DeleteWorryButton({ worryId }: { worryId: number }) {
  return (
    <form
      action={deleteWorryAction.bind(null, worryId)}
      onSubmit={(e) => {
        if (!window.confirm("이 이야기를 지울까요? 지우면 다시 볼 수 없어요.")) e.preventDefault();
      }}
    >
      <button type="submit" className="h-11 cursor-pointer border-0 bg-transparent px-1 text-[13px] font-semibold text-mute">
        지우기
      </button>
    </form>
  );
}
