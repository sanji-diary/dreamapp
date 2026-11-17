"use client";

import { useState, useTransition } from "react";
import { harvestAction } from "@/lib/kid/actions";

export function HarvestButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await harvestAction();
              if (r && !r.ok) setError(r.message);
            } catch {
              setError("연결이 잠시 끊겼어요. 다시 해 주세요.");
            }
          })
        }
        className="h-14 w-full cursor-pointer rounded-2xl border-0 bg-navy text-[17px] font-bold tracking-[-0.3px] text-white disabled:opacity-70"
      >
        {pending ? "수확하는 중…" : "열매 수확하기"}
      </button>
      {error ? (
        <p role="alert" className="m-0 text-center text-[14px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
