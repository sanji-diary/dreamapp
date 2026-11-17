"use client";

import { useRef, type ReactNode } from "react";
import { TreeScene, useSceneFit } from "./TreeScene";

/**
 * A full-screen tree scene with text on top and a panel at the bottom.
 * Used for the "you got a seed" and harvest screens, which share the home background.
 */
export function SceneCard({ level, intro = false, top, bottom, headerBottom = 150 }: { level: number; intro?: boolean; top: ReactNode; bottom: ReactNode; headerBottom?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fit = useSceneFit(containerRef, bottomRef, headerBottom);
  return (
    <main ref={containerRef} className="relative flex h-dvh flex-col overflow-hidden bg-ground">
      <TreeScene level={level} intro={intro} fit={fit} />
      <div className="relative flex min-h-0 grow flex-col">
        {top}
        <div className="grow" />
        <div ref={bottomRef}>{bottom}</div>
      </div>
    </main>
  );
}
