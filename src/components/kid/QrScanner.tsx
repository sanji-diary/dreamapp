"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The camera with a QR reader, for the child's "출석 체크".
 *
 * Android Chrome reads QR codes by itself (BarcodeDetector). iPhones do not, so there the picture
 * is read by a small library that is only downloaded when it is needed.
 * `onRead` gets every QR the camera sees; it returns true when the QR was the right one, and the
 * camera stops. Nothing is recorded or sent anywhere: frames are read on the phone and dropped.
 */
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface DetectorCtor {
  new (options?: { formats?: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

type Reader = (video: HTMLVideoElement) => Promise<string | null>;

async function nativeReader(): Promise<Reader | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : ["qr_code"];
    if (!formats.includes("qr_code")) return null;
    const detector = new Ctor({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

async function libraryReader(): Promise<Reader> {
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!ctx || video.videoWidth === 0) return null;
    // A smaller picture is read much faster, and a QR held up to the camera is still large in it.
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.drawImage(video, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    return jsQR(image.data, w, h, { inversionAttempts: "dontInvert" })?.data || null;
  };
}

export type ScannerProblem = "denied" | "unsupported";

export function QrScanner({ onRead, onProblem }: { onRead: (text: string) => boolean; onProblem: (problem: ScannerProblem) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  // The latest callbacks without restarting the camera when the parent renders again.
  const read = useRef(onRead);
  const problem = useRef(onProblem);
  useEffect(() => {
    read.current = onRead;
    problem.current = onProblem;
  }, [onRead, onProblem]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    (async () => {
      try {
        if (typeof navigator.mediaDevices?.getUserMedia !== "function") throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        const v = video.current;
        if (stopped || !v) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        v.srcObject = stream;
        await v.play();
        const reader = (await nativeReader()) ?? (await libraryReader());
        if (stopped) return;
        setReady(true);
        const tick = async () => {
          if (stopped) return;
          try {
            const text = v.readyState >= 2 ? await reader(v) : null;
            if (text && !stopped && read.current(text)) {
              stopped = true;
              stream?.getTracks().forEach((t) => t.stop());
              return;
            }
          } catch {
            // A frame that cannot be read is skipped.
          }
          timer = window.setTimeout(tick, 220);
        };
        void tick();
      } catch (e) {
        if (stopped) return;
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        problem.current(denied ? "denied" : "unsupported");
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[28px] bg-[#191F28]">
      <video ref={video} playsInline muted aria-label="카메라 화면" className="h-full w-full object-cover" />
      {/* The frame the QR goes in: four corners, so the picture behind stays clear. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-[14%]">
        {["top-0 left-0 border-t-4 border-l-4 rounded-tl-[18px]", "top-0 right-0 border-t-4 border-r-4 rounded-tr-[18px]", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[18px]", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-[18px]"].map((c) => (
          <span key={c} className={`absolute h-9 w-9 border-solid border-white ${c}`} />
        ))}
      </div>
      {!ready ? (
        <p role="status" className="absolute inset-0 m-0 flex items-center justify-center text-[15px] font-semibold text-white">
          카메라를 켜는 중…
        </p>
      ) : null}
    </div>
  );
}
