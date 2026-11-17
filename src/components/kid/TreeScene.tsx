"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { LEVEL_NAMES } from "@/lib/types";

/**
 * The tree scene from the approved home mock-up. All positions are the mock's pixels on a
 * 390px-wide canvas whose ground point is (195, 512); the canvas is scaled to the real screen.
 */

export type SceneKind = "" | "water" | "charge" | "reveal";

export interface SceneFit {
  /** Container width in real pixels. */
  w: number;
  /** Background scale (always covers the width). */
  sb: number;
  /** Tree scale (shrinks on short screens so the tree stays between the headline and the card). */
  st: number;
  /** Where the ground point lands, in real pixels from the top of the container. */
  groundY: number;
}

const DESIGN: SceneFit = { w: 390, sb: 1, st: 1, groundY: 512 };

/** Measures the container and the card at the bottom, and fits the scene between them. */
export function useSceneFit(container: RefObject<HTMLElement | null>, bottom: RefObject<HTMLElement | null>, headerBottom = 178): SceneFit {
  const [fit, setFit] = useState<SceneFit>(DESIGN);
  useLayoutEffect(() => {
    const c = container.current;
    if (!c) return;
    const measure = () => {
      const rect = c.getBoundingClientRect();
      if (rect.width === 0) return;
      const sb = rect.width / 390;
      const cardTop = bottom.current ? bottom.current.getBoundingClientRect().top - rect.top : rect.height;
      const groundY = Math.round(Math.min(512 * sb, cardTop - 24));
      const st = Math.max(0.35, Math.min(sb, (groundY - headerBottom) / 305));
      setFit((f) => (f.w === rect.width && f.groundY === groundY && f.st === st ? f : { w: rect.width, sb, st, groundY }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(c);
    if (bottom.current) ro.observe(bottom.current);
    return () => ro.disconnect();
  }, [container, bottom, headerBottom]);
  return fit;
}

const abs = (left: number, top: number, width: number, height: number, extra: CSSProperties = {}): CSSProperties => ({ position: "absolute", left, top, width, height, ...extra });

const RAY_COLORS = ["#FFFFFF", "#FFE27A", "#FFFFFF", "#BFE6A8", "#FFFFFF", "#FFE27A", "#FFFFFF", "#BFE6A8", "#FFFFFF", "#FFE27A"];
const LEAF_X = [84, 126, 168, 214, 256, 296];
const DROP_X = [150, 170, 190, 210, 230];
const STAR = "M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z";

/* eslint-disable @next/next/no-img-element */
export function TreeScene({ level, kind = "", intro = false, toast = "", fit, creatures = true }: { level: number; kind?: SceneKind; intro?: boolean; toast?: string; fit: SceneFit; creatures?: boolean }) {
  const charge = kind === "charge";
  const reveal = kind === "reveal";
  const water = kind === "water";
  const wet = water || charge;
  const left = fit.w / 2 - 195;
  const top = fit.groundY - 512;
  const treeAnim = charge ? "charge 0.75s ease-in 0.85s both" : reveal ? "reveal 1s cubic-bezier(0.2, 0.9, 0.3, 1.1) both" : water ? "squash 0.6s ease-out 0.75s" : "none";
  const glowAnim = charge ? "glowIn 0.75s ease-in 0.85s both" : reveal ? "glowOut 1s ease-out both" : "none";
  const toastAnim = reveal ? "toast 1.3s ease-out both" : water ? "toast 1.2s ease-out 0.5s both" : "none";
  const moundAnim = intro ? "moundRise 0.5s ease-out 0.9s both" : undefined;

  return (
    <>
      <img alt="" src="/img/bg.webp" style={abs(left, top, 390, 699, { display: "block", maxWidth: "none", transformOrigin: "195px 512px", transform: `scale(${fit.sb})` })} />
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #FFF9D6 0%, #FFF3A8 62%, rgba(255,243,168,0) 100%)", opacity: charge || reveal ? 0.9 : 0, transition: "opacity 0.6s ease" }}
      />
      <div role="img" aria-label={`내 나무: ${LEVEL_NAMES[level - 1]}`} style={abs(left, top, 390, 600, { transformOrigin: "195px 512px", transform: `scale(${fit.st})` })}>
        <div
          style={abs(75, 250, 240, 300, {
            borderRadius: "120px 120px 100px 100px",
            background: "radial-gradient(ellipse at 50% 70%, rgba(255,251,214,0.98) 0%, rgba(255,244,170,0.8) 34%, rgba(255,244,170,0) 70%)",
            opacity: 0,
            transformOrigin: "50% 85%",
            animation: glowAnim,
          })}
        />
        <div style={abs(135, 500, 120, 22, { borderRadius: 60, background: "radial-gradient(ellipse, rgba(120,132,40,0.28) 0%, rgba(120,132,40,0) 70%)" })} />
        <div style={abs(0, 0, 390, 600, { transformOrigin: "195px 512px", animation: treeAnim })}>
          {level === 1 ? (
            <>
              <img alt="" src="/img/tree-mound.webp" style={abs(125, 450, 140, 68, { maxWidth: "none", transformOrigin: "50% 100%", animation: moundAnim })} />
              <div style={abs(163, 462, 64, 32, { borderRadius: "50%", background: "radial-gradient(ellipse, rgba(70,40,20,0.5) 0%, rgba(70,40,20,0) 72%)", animation: intro ? "fadeIn 0.3s ease-out 1.2s both" : undefined })} />
              <div style={abs(160, 422, 70, 72, { animation: intro ? "seedDrop 1s cubic-bezier(0.5, 0, 0.8, 0.6) both" : undefined })}>
                <img alt="" src="/img/tree-seed.webp" style={{ width: 70, height: 72, display: "block", maxWidth: "none", transformOrigin: "50% 100%", animation: `settle 3.2s ease-in-out ${intro ? "1.8s" : "0s"} infinite` }} />
              </div>
              <img alt="" className="rim-seed" src="/img/tree-mound.webp" style={abs(125, 450, 140, 68, { maxWidth: "none", transformOrigin: "50% 100%", animation: moundAnim })} />
            </>
          ) : null}
          {level === 2 ? (
            <>
              <img alt="" src="/img/tree-mound.webp" style={abs(125, 450, 140, 68, { maxWidth: "none", transformOrigin: "50% 100%" })} />
              <div style={abs(170, 466, 50, 30, { borderRadius: "50%", background: "radial-gradient(ellipse, rgba(70,40,20,0.5) 0%, rgba(70,40,20,0) 72%)" })} />
              <img alt="" src="/img/tree-sprout.webp" style={abs(158, 392, 80, 105, { maxWidth: "none", transformOrigin: "46% 96%", animation: "sway 3.6s ease-in-out infinite" })} />
              <img alt="" className="rim-sprout" src="/img/tree-mound.webp" style={abs(125, 450, 140, 68, { maxWidth: "none", transformOrigin: "50% 100%" })} />
            </>
          ) : null}
          {level === 3 ? <img alt="" src="/img/tree-sap.webp" style={abs(129, 305, 121, 207, { maxWidth: "none", transformOrigin: "54% 98%", animation: "sway 4.2s ease-in-out infinite" })} /> : null}
          {level === 4 ? <img alt="" src="/img/tree-big.webp" style={abs(70, 211, 251, 301, { maxWidth: "none", transformOrigin: "50% 98%", animation: "sway 4.8s ease-in-out infinite" })} /> : null}
          {level === 5 ? <img alt="" src="/img/tree-flower.webp" style={abs(68, 207, 255, 305, { maxWidth: "none", transformOrigin: "50% 98%", animation: "sway 4.8s ease-in-out infinite" })} /> : null}
          {level >= 6 ? <img alt="" src="/img/tree-fruit.webp" style={abs(68, 208, 254, 304, { maxWidth: "none", transformOrigin: "50% 98%", animation: "sway 4.8s ease-in-out infinite" })} /> : null}
        </div>
        {LEAF_X.map((x, i) => (
          <img key={x} alt="" src="/img/icon-leaf.webp" style={abs(x, 480, 18, 18, { opacity: 0, animation: charge ? `leafUp 0.9s ease-out ${0.55 + i * 0.07}s both` : "none" })} />
        ))}
        {RAY_COLORS.map((c, i) => (
          <div key={i} style={abs(189, 400, 12, 12, { transform: `rotate(${i * 36}deg)` })}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0, animation: reveal ? `ray 1s ease-out ${(i % 3) * 0.06}s both` : "none" }} />
          </div>
        ))}
        <img alt="" src="/img/icon-cloud.webp" style={abs(110, 84, 170, 170, { maxWidth: "none", opacity: 0, animation: wet ? "cloudPop 1.6s ease-out both" : "none" })} />
        {DROP_X.map((x, i) => (
          <img key={x} alt="" src="/img/icon-drop.webp" style={abs(x, 214, 16, 16, { opacity: 0, animation: wet ? `rainDrop 0.75s ease-in ${0.4 + ((i * 37) % 5) * 0.1}s both` : "none" })} />
        ))}
        <div style={{ position: "absolute", left: 0, top: 304, width: 390, display: "flex", justifyContent: "center", opacity: 0, animation: toastAnim }}>
          <div className="flex h-[34px] items-center rounded-[17px] bg-white px-3.5 text-[13px] font-bold tracking-[-0.2px] whitespace-nowrap text-ink2 shadow-[0_4px_12px_rgba(25,31,40,0.10)]">{toast}</div>
        </div>
        {creatures && (level === 2 || level === 3) ? (
          <>
            <div style={{ position: "absolute", left: 86, top: 330, animation: "fly1 9s ease-in-out infinite" }}>
              <img alt="" src="/img/icon-butterfly.webp" style={{ width: 34, height: 34, display: "block", animation: "flap 0.4s ease-in-out infinite" }} />
            </div>
            <div style={{ position: "absolute", left: 286, top: 300, animation: "fly2 11s ease-in-out infinite" }}>
              <img alt="" src="/img/icon-butterfly.webp" style={{ width: 26, height: 26, display: "block", animation: "flap 0.34s ease-in-out infinite" }} />
            </div>
          </>
        ) : null}
        {creatures && level === 4 ? (
          <>
            <div style={{ position: "absolute", left: 262, top: 262, animation: "birdIn 9s ease-in-out 1s infinite both" }}>
              <img alt="" src="/img/icon-bird.webp" style={{ width: 46, height: 46, display: "block" }} />
            </div>
            <img alt="" src="/img/icon-leaf.webp" style={abs(110, 250, 16, 16, { opacity: 0, animation: "fall 7s linear 2.5s infinite" })} />
            <img alt="" src="/img/icon-leaf.webp" style={abs(300, 290, 14, 14, { opacity: 0, animation: "fall 6.4s linear 5s infinite" })} />
          </>
        ) : null}
        {creatures && level === 5 ? (
          <>
            <div style={{ position: "absolute", left: 300, top: 250, animation: "fly2 8s ease-in-out infinite" }}>
              <img alt="" src="/img/icon-bee.webp" style={{ width: 34, height: 34, display: "block", animation: "hover 0.9s ease-in-out infinite" }} />
            </div>
            <div style={abs(258, 256, 9, 7, { borderRadius: "5px 5px 5px 1px", background: "#FFFFFF", opacity: 0, animation: "fall 6s linear 0.5s infinite" })} />
            <div style={abs(150, 240, 8, 6, { borderRadius: "5px 5px 5px 1px", background: "#FFFFFF", opacity: 0, animation: "fall 7s linear 2.6s infinite" })} />
            <div style={abs(298, 320, 8, 6, { borderRadius: "5px 5px 5px 1px", background: "#FFFFFF", opacity: 0, animation: "fall 6.5s linear 4.2s infinite" })} />
          </>
        ) : null}
        {creatures && level >= 6 ? (
          <>
            {[
              [52, 270, 14, "2.8s", "0s"],
              [328, 246, 14, "3.4s", "0.9s"],
              [338, 400, 12, "3s", "1.6s"],
              [40, 410, 12, "3.6s", "0.4s"],
            ].map(([x, y, size, dur, delay]) => (
              <svg key={`${x}-${y}`} aria-hidden="true" width={size} height={size} viewBox="-7 -7 14 14" style={{ position: "absolute", left: x, top: y, animation: `twinkle ${dur} ease-in-out ${delay} infinite` }}>
                <path d={STAR} fill="#FFFFFF" />
              </svg>
            ))}
          </>
        ) : null}
      </div>
    </>
  );
}
