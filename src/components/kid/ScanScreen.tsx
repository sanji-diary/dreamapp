"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { BackLink, Icon, primaryButtonClass } from "@/components/ui";
import { qrCodeFromText } from "@/lib/kid/scan-text";
import { QrScanner, type ScannerProblem } from "./QrScanner";

/**
 * "출석 체크": the child holds the phone up to the QR at church. A QR of this app sends the child on
 * to /q/<code>, where the server marks the attendance and gives the reward; any other QR is ignored
 * with a word about it. `attendance` only changes the words (an attendance QR is open today).
 */
export function ScanScreen({ attendance }: { attendance: boolean }) {
  const [state, setState] = useState<"scan" | "found" | ScannerProblem>("scan");
  const [other, setOther] = useState(false);
  const lastOther = useRef("");

  const onRead = useCallback((text: string) => {
    const code = qrCodeFromText(text);
    if (!code) {
      if (lastOther.current !== text) {
        lastOther.current = text;
        setOther(true);
      }
      return false;
    }
    setState("found");
    // A fixed path of this app; the address inside the QR is never opened. It is a route handler
    // (it sets a cookie and redirects), so it needs a real page load, not the router.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/q/${code}`);
    return true;
  }, []);
  const onProblem = useCallback((p: ScannerProblem) => setState(p), []);

  const problem = state === "denied" || state === "unsupported";
  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="kid-col flex items-center px-3 pt-[max(8px,env(safe-area-inset-top))]">
        <BackLink href="/home" label="내 나무로 돌아가기" />
      </div>
      <div className="kid-col flex grow flex-col gap-4 px-5 pt-1 pb-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[25px] leading-[34px] font-bold tracking-[-0.6px] break-keep">{attendance ? "출석 QR을 찍어 주세요" : "QR을 찍어 주세요"}</h1>
          {problem ? null : <p className="m-0 text-[15px] leading-[22px] break-keep text-sub">교회에 있는 QR을 네모 안에 맞추면 돼요.</p>}
        </div>
        {problem ? (
          <div className="flex flex-col items-center gap-2 rounded-[28px] bg-fill px-5 py-8 text-center">
            <Icon name="cloud" size={64} />
            <p role="alert" className="m-0 text-[17px] leading-6 font-bold break-keep">
              {state === "denied" ? "카메라를 쓸 수 없어요" : "이 휴대폰에서는 카메라를 켤 수 없어요"}
            </p>
            <p className="m-0 text-[14px] leading-[21px] break-keep text-sub">
              {state === "denied" ? "휴대폰에서 카메라를 허용한 다음 다시 들어와 주세요." : "휴대폰 카메라 앱으로 QR을 찍어도 돼요."} 선생님께 말해도 출석을 확인해 줘요.
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[420px]">
            <QrScanner onRead={onRead} onProblem={onProblem} />
          </div>
        )}
        <p role="status" className="m-0 min-h-[22px] text-center text-[15px] leading-[22px] font-semibold break-keep text-ink2">
          {state === "found" ? "QR을 읽었어요. 확인하는 중…" : !problem && other ? "꿈의숲 QR이 아니에요. 교회에 있는 QR을 찍어 주세요." : ""}
        </p>
        <div className="grow" />
        {problem ? (
          <Link href="/home" className={`${primaryButtonClass} h-[54px] rounded-[14px] text-[17px] no-underline`}>
            내 나무로 가기
          </Link>
        ) : (
          <p className="m-0 text-center text-[13px] leading-[19px] break-keep text-mute">카메라 화면은 QR을 읽는 데만 쓰고 저장하지 않아요.</p>
        )}
      </div>
    </main>
  );
}
