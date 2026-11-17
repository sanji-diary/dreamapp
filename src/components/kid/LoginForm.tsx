"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { forgetCardAction, loginAction } from "@/lib/kid/actions";
import { PinDots, PinKeys } from "./PinPad";

/* eslint-disable @next/next/no-img-element */
export function LoginForm({ greeting, lockedMinutes }: { greeting: string; lockedMinutes: number }) {
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [shake, setShake] = useState(0);
  const [note, setNote] = useState<{ text: string; tone: "info" | "error" }>({ text: "", tone: "info" });
  const [locked, setLocked] = useState(lockedMinutes);
  const pinRef = useRef("");
  const router = useRouter();

  const submit = useCallback(async (value: string) => {
    setPending(true);
    setNote({ text: "내 나무로 들어가는 중이에요", tone: "info" });
    try {
      const r = await loginAction(value);
      // A successful sign-in redirects on the server, so reaching here means it did not work.
      if (!r) return;
      pinRef.current = "";
      setPin("");
      setShake((n) => n + 1);
      if (r.reason === "wrong") setNote({ text: `비밀번호가 달라요. ${r.left}번 더 해 볼 수 있어요`, tone: "error" });
      else if (r.reason === "locked") {
        setLocked(r.minutes ?? 10);
        setNote({ text: "", tone: "info" });
      } else router.refresh(); // the card is no longer remembered: show the scan screen
    } catch {
      pinRef.current = "";
      setPin("");
      setNote({ text: "연결이 잠시 끊겼어요. 다시 눌러 주세요", tone: "error" });
    } finally {
      setPending(false);
    }
  }, [router]);

  const onDigit = useCallback(
    (d: string) => {
      if (pinRef.current.length >= 4) return;
      const next = pinRef.current + d;
      pinRef.current = next;
      setPin(next);
      if (next.length < 4) setNote({ text: "", tone: "info" });
      else void submit(next);
    },
    [submit],
  );
  const onDelete = useCallback(() => {
    pinRef.current = pinRef.current.slice(0, -1);
    setPin(pinRef.current);
  }, []);

  const isLocked = locked > 0;

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="flex flex-col items-center gap-1.5 px-5 pt-[max(48px,env(safe-area-inset-top))]">
        <img alt="" src="/img/tree-seed.webp" width={84} height={84} style={{ width: 84, height: 84 }} />
        <h1 className="mt-3.5 mb-0 text-center text-[24px] leading-8 font-bold tracking-[-0.5px]">{greeting}</h1>
        {isLocked ? (
          <div role="alert" className="mt-4 flex flex-col items-center gap-1 rounded-2xl bg-danger-tint px-5 py-4 text-center">
            <p className="m-0 text-[16px] font-bold text-danger">비밀번호를 여러 번 틀렸어요</p>
            <p className="m-0 text-[14px] leading-5 text-sub">
              {locked}분 뒤에 다시 해 볼 수 있어요.
              <br />
              기억이 안 나면 선생님께 말해 주세요.
            </p>
          </div>
        ) : (
          <>
            <p className="m-0 text-center text-[15px] leading-[22px] text-sub">비밀번호 숫자 4개를 눌러 주세요</p>
            <div className="mt-[26px]">
              <PinDots key={shake} count={pin.length} shake={shake > 0} />
            </div>
            <p role={note.tone === "error" ? "alert" : "status"} className={`mt-[18px] mb-0 min-h-5 text-center text-[14px] font-semibold ${note.tone === "error" ? "text-danger" : "text-navy"}`}>
              {note.text}
            </p>
          </>
        )}
      </div>
      <div className="min-h-4 grow" />
      {isLocked ? null : <PinKeys onDigit={onDigit} onDelete={onDelete} disabled={pending} />}
      <p className="mx-5 mt-3.5 mb-1 text-center text-[13px] leading-[19px] text-mute">카드를 잃어버렸거나 비밀번호를 잊었으면 선생님께 말해 주세요</p>
      <form action={forgetCardAction} className="mb-5 flex justify-center">
        <button type="submit" className="h-11 cursor-pointer border-0 bg-transparent px-4 text-[14px] font-semibold text-sub underline underline-offset-2">
          다른 친구예요
        </button>
      </form>
    </main>
  );
}
