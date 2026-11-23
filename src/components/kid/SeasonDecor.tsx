import type { CSSProperties, ReactNode } from "react";
import type { HomeLook } from "@/lib/kid/home-look";

/**
 * What the season and the church year add to the child's tree screen (see src/lib/kid/home-look.ts).
 * Everything is drawn on the tree scene's 390-wide canvas, whose ground point is (195, 512):
 * - the backdrop takes the season's tone;
 * - things stand on the grass at the left and the right of the tree, and float in the sky beside it;
 * - the tree itself wears something (snow, a hat, lights);
 * - petals, leaves or snow drift down.
 * The shapes are soft, rounded and lit from the upper left, to sit with the clay pictures.
 * Decoration only: no words to read, nothing to do, nothing to lose.
 */

/* eslint-disable @next/next/no-img-element */

const at = (left: number, top: number, width: number, height: number, extra: CSSProperties = {}): CSSProperties => ({ position: "absolute", left, top, width, height, overflow: "visible", ...extra });

/** The tone of the backdrop picture (sky, hills, grass) for a season. */
export function backdropFilter(look: HomeLook | undefined): string | undefined {
  if (!look) return undefined;
  return { spring: undefined, summer: "saturate(1.12)", autumn: "sepia(0.26) saturate(1.25)", winter: "saturate(0.16) brightness(1.08)" }[look.season];
}

/** Soft "clay" fills shared by every drawing: light at the upper left, darker at the lower right. */
function Clay() {
  const g = (id: string, a: string, b: string) => (
    <radialGradient key={id} id={id} cx="35%" cy="28%" r="80%">
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </radialGradient>
  );
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        {g("sd-red", "#f47a6c", "#c9433f")}
        {g("sd-white", "#ffffff", "#dde7f0")}
        {g("sd-gold", "#ffe69a", "#eeb03c")}
        {g("sd-green", "#9ad584", "#5c9f56")}
        {g("sd-blue", "#9fcdf5", "#5a93d6")}
        {g("sd-pink", "#ffc4d6", "#ef8fae")}
        {g("sd-orange", "#ffbf73", "#e57f2f")}
        {g("sd-wood", "#e0b07c", "#b07a48")}
        {g("sd-purple", "#c6a8ee", "#8e6ccb")}
        {g("sd-coal", "#6b6259", "#3d3833")}
      </defs>
    </svg>
  );
}

const SLOT_L = 52; // centre of the open grass at the left of the tree
const SLOT_R = 336; // and at the right
const GROUND = 526; // where things on the grass stand

/* ---------------- things on the grass ---------------- */

function Gifts() {
  return (
    <svg aria-hidden="true" viewBox="0 0 84 56" style={at(SLOT_R - 42, GROUND - 56, 84, 56)}>
      <ellipse cx="42" cy="53" rx="38" ry="4" fill="rgba(90,100,60,0.18)" />
      <rect x="6" y="18" width="38" height="34" rx="6" fill="url(#sd-red)" />
      <rect x="21" y="18" width="8" height="34" fill="url(#sd-gold)" />
      <rect x="3" y="12" width="44" height="11" rx="5" fill="url(#sd-red)" />
      <rect x="21" y="12" width="8" height="11" fill="url(#sd-gold)" />
      <path d="M25 12 C16 2 8 6 14 12 Z M25 12 C34 2 42 6 36 12 Z" fill="url(#sd-gold)" />
      <rect x="46" y="28" width="30" height="24" rx="5" fill="url(#sd-blue)" />
      <rect x="58" y="28" width="6" height="24" fill="url(#sd-white)" />
      <rect x="44" y="24" width="34" height="8" rx="4" fill="url(#sd-blue)" />
      <rect x="58" y="24" width="6" height="8" fill="url(#sd-white)" />
    </svg>
  );
}

/** Four Advent candles on a green wreath: three purple and one rose. One more burns each Advent Sunday. */
function Candles({ lit }: { lit: number }) {
  const xs = [12, 30, 48, 66];
  return (
    <svg aria-hidden="true" viewBox="0 0 80 64" style={at(SLOT_L - 40, GROUND - 64, 80, 64)}>
      <ellipse cx="40" cy="60" rx="38" ry="4" fill="rgba(90,100,60,0.18)" />
      <rect x="2" y="46" width="76" height="14" rx="7" fill="url(#sd-green)" />
      {[10, 24, 40, 56, 70].map((x) => (
        <circle key={x} cx={x} cy={50} r="2.6" fill="url(#sd-red)" />
      ))}
      {xs.map((x, i) => (
        <g key={x}>
          <rect x={x - 5} y={i % 2 ? 22 : 26} width="10" height={i % 2 ? 28 : 24} rx="4" fill={i === 2 ? "url(#sd-pink)" : "url(#sd-purple)"} />
          {i < lit ? (
            <g style={{ transformOrigin: `${x}px ${i % 2 ? 22 : 26}px`, animation: `flame ${1.1 + i * 0.17}s ease-in-out infinite` }}>
              <ellipse cx={x} cy={(i % 2 ? 22 : 26) - 7} rx="4.2" ry="7" fill="#ffb53d" />
              <ellipse cx={x} cy={(i % 2 ? 22 : 26) - 5.5} rx="2.2" ry="4" fill="#fff3b4" />
            </g>
          ) : (
            <rect x={x - 0.7} y={(i % 2 ? 22 : 26) - 4} width="1.4" height="4" fill="#5b5149" />
          )}
        </g>
      ))}
    </svg>
  );
}

function Snowman({ x }: { x: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 60 78" style={at(x - 30, GROUND - 78, 60, 78)}>
      <ellipse cx="30" cy="75" rx="26" ry="4" fill="rgba(110,120,140,0.18)" />
      <circle cx="30" cy="54" r="21" fill="url(#sd-white)" />
      <circle cx="30" cy="26" r="15" fill="url(#sd-white)" />
      <rect x="15" y="35" width="30" height="8" rx="4" fill="url(#sd-red)" />
      <rect x="36" y="38" width="8" height="18" rx="4" fill="url(#sd-red)" />
      <circle cx="24.5" cy="23" r="2" fill="#3d3833" />
      <circle cx="35.5" cy="23" r="2" fill="#3d3833" />
      <path d="M30 27 L41 30 L30 32 Z" fill="url(#sd-orange)" />
      <circle cx="30" cy="50" r="2" fill="#3d3833" />
      <circle cx="30" cy="59" r="2" fill="#3d3833" />
      <rect x="19" y="8" width="22" height="7" rx="3" fill="url(#sd-coal)" />
      <rect x="23" y="0" width="14" height="11" rx="3" fill="url(#sd-coal)" />
    </svg>
  );
}

/** A wooden sign. `text` is short: a year, or the name of a special week. */
function Sign({ text, x, wide = false }: { text: string; x: number; wide?: boolean }) {
  const w = wide ? 92 : 64;
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${w} 62`} style={at(x - w / 2, GROUND - 62, w, 62)}>
      <ellipse cx={w / 2} cy="59" rx="16" ry="3.5" fill="rgba(90,100,60,0.18)" />
      <rect x={w / 2 - 4} y="26" width="8" height="33" rx="3" fill="url(#sd-wood)" />
      <rect x="2" y="4" width={w - 4} height="30" rx="8" fill="url(#sd-wood)" />
      <rect x="6" y="8" width={w - 12} height="22" rx="5" fill="#f3d9b1" />
      <text x={w / 2} y="24.5" textAnchor="middle" fontSize={wide ? 12.5 : 16} fontWeight="800" fill="#7a4f2a" style={{ letterSpacing: wide ? "-0.5px" : "0.5px" }}>
        {text}
      </text>
    </svg>
  );
}

/** Two lucky pouches (복주머니), for 설날. */
function Pouches() {
  const one = (cx: number, cy: number, s: number, fill: string, tie: string) => (
    <g key={cx} transform={`translate(${cx} ${cy}) scale(${s})`}>
      <path d="M-15 -8 C-24 4 -22 22 0 22 C22 22 24 4 15 -8 C8 -4 -8 -4 -15 -8 Z" fill={fill} />
      <path d="M-14 -9 C-10 -20 -4 -17 0 -21 C4 -17 10 -20 14 -9 C7 -5 -7 -5 -14 -9 Z" fill={fill} />
      <rect x="-15" y="-11" width="30" height="5" rx="2.5" fill={tie} />
      <circle cx="0" cy="7" r="6.5" fill={tie} />
      <circle cx="0" cy="7" r="3" fill={fill} />
      <path d="M-13 -6 q-6 8 -3 16" stroke={tie} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </g>
  );
  return (
    <svg aria-hidden="true" viewBox="0 0 84 62" style={at(SLOT_L - 42, GROUND - 62, 84, 62)}>
      <ellipse cx="42" cy="59" rx="34" ry="3.5" fill="rgba(110,120,140,0.18)" />
      {one(28, 34, 1.05, "url(#sd-red)", "url(#sd-gold)")}
      {one(62, 41, 0.75, "url(#sd-blue)", "url(#sd-gold)")}
    </svg>
  );
}

function Eggs({ x, few = false }: { x: number; few?: boolean }) {
  const eggs: [number, number, string, string][] = few ? [[30, 38, "url(#sd-blue)", "#ffffff"]] : [[14, 40, "url(#sd-pink)", "#ffffff"], [34, 36, "url(#sd-gold)", "#f47a6c"], [54, 41, "url(#sd-blue)", "#ffffff"]];
  return (
    <svg aria-hidden="true" viewBox="0 0 68 56" style={at(x - 34, GROUND - 56, 68, 56)}>
      <ellipse cx="34" cy="53" rx="30" ry="3.5" fill="rgba(90,100,60,0.18)" />
      {eggs.map(([cx, cy, fill, line], i) => (
        <g key={cx} transform={`rotate(${(i - 1) * 9} ${cx} ${cy})`}>
          <ellipse cx={cx} cy={cy} rx="10.5" ry="13.5" fill={fill} />
          <path d={`M${cx - 9.5} ${cy - 2} q4.75 -5 9.5 0 t9.5 0`} stroke={line} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <circle cx={cx - 4} cy={cy + 6} r="1.6" fill={line} />
          <circle cx={cx + 4} cy={cy + 6} r="1.6" fill={line} />
        </g>
      ))}
      {few ? (
        // a white lily beside the single egg
        <g>
          <path d="M50 52 C50 40 48 34 46 28" stroke="#5c9f56" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {[-38, 0, 38].map((r) => (
            <ellipse key={r} cx="46" cy="20" rx="4.5" ry="9" fill="url(#sd-white)" transform={`rotate(${r} 46 28)`} />
          ))}
          <circle cx="46" cy="25" r="2.4" fill="url(#sd-gold)" />
        </g>
      ) : null}
    </svg>
  );
}

function Pumpkins() {
  const one = (cx: number, cy: number, s: number) => (
    <g key={cx} transform={`translate(${cx} ${cy}) scale(${s})`}>
      <ellipse cx="-11" cy="0" rx="10" ry="14" fill="url(#sd-orange)" />
      <ellipse cx="11" cy="0" rx="10" ry="14" fill="url(#sd-orange)" />
      <ellipse cx="0" cy="0" rx="11" ry="15.5" fill="url(#sd-orange)" />
      <rect x="-2.5" y="-21" width="5" height="8" rx="2" fill="#6f8f45" />
    </g>
  );
  return (
    <svg aria-hidden="true" viewBox="0 0 84 58" style={at(SLOT_L - 42, GROUND - 58, 84, 58)}>
      <ellipse cx="42" cy="55" rx="36" ry="3.5" fill="rgba(90,100,60,0.18)" />
      {one(27, 36, 1)}
      {one(62, 42, 0.7)}
    </svg>
  );
}

function Basket() {
  return (
    <svg aria-hidden="true" viewBox="0 0 70 60" style={at(SLOT_R - 35, GROUND - 60, 70, 60)}>
      <ellipse cx="35" cy="57" rx="30" ry="3.5" fill="rgba(90,100,60,0.18)" />
      <circle cx="22" cy="26" r="10" fill="url(#sd-red)" />
      <circle cx="37" cy="21" r="10.5" fill="url(#sd-orange)" />
      <circle cx="50" cy="27" r="9" fill="url(#sd-green)" />
      <circle cx="30" cy="30" r="8" fill="url(#sd-gold)" />
      <path d="M8 30 H62 L56 54 Q35 60 14 54 Z" fill="url(#sd-wood)" />
      <path d="M11 37 H59 M13 45 H57" stroke="#96653a" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <rect x="5" y="27" width="60" height="7" rx="3.5" fill="url(#sd-wood)" />
    </svg>
  );
}

function Pinwheel() {
  return (
    <svg aria-hidden="true" viewBox="0 0 56 78" style={at(SLOT_L - 28, GROUND - 78, 56, 78)}>
      <ellipse cx="28" cy="75" rx="14" ry="3" fill="rgba(90,100,60,0.18)" />
      <rect x="26" y="26" width="4" height="49" rx="2" fill="url(#sd-wood)" />
      <g style={{ transformOrigin: "28px 26px", animation: "spin 5s linear infinite" }}>
        {["url(#sd-red)", "url(#sd-gold)", "url(#sd-blue)", "url(#sd-green)"].map((fill, i) => (
          <path key={fill} d="M28 26 C28 12 40 6 48 10 C44 18 38 24 28 26 Z" fill={fill} transform={`rotate(${i * 90} 28 26)`} />
        ))}
      </g>
      <circle cx="28" cy="26" r="3.5" fill="url(#sd-white)" />
    </svg>
  );
}

function Flowers({ x }: { x: number }) {
  const spots: [number, number, number, string][] = [[14, 30, 1, "url(#sd-white)"], [34, 24, 1.15, "url(#sd-pink)"], [54, 31, 0.9, "url(#sd-white)"], [24, 14, 0.8, "url(#sd-pink)"], [46, 12, 0.85, "url(#sd-gold)"]];
  return (
    <svg aria-hidden="true" viewBox="0 0 68 44" style={at(x - 34, GROUND - 44, 68, 44)}>
      {spots.map(([cx, cy, s, fill]) => (
        <g key={`${cx}-${cy}`} transform={`translate(${cx} ${cy}) scale(${s})`}>
          <path d="M0 12 V2" stroke="#5c9f56" strokeWidth="2" strokeLinecap="round" />
          {[0, 72, 144, 216, 288].map((r) => (
            <circle key={r} cx="0" cy="-4.5" r="3.4" fill={fill} transform={`rotate(${r})`} />
          ))}
          <circle r="2.4" fill={fill === "url(#sd-gold)" ? "#ffffff" : "url(#sd-gold)"} />
        </g>
      ))}
    </svg>
  );
}

function FallenLeaves({ x }: { x: number }) {
  return (
    <>
      {[[-22, 12, 20, -30], [4, 6, 24, 25], [26, 14, 18, 70]].map(([dx, up, size, rot]) => (
        <img key={dx} alt="" src="/img/icon-leaf.webp" style={at(x + dx - size / 2, GROUND - up - size, size, size, { maxWidth: "none", transform: `rotate(${rot}deg)`, filter: "hue-rotate(-68deg) saturate(1.9) brightness(1.05)" })} />
      ))}
    </>
  );
}

/* ---------------- things in the sky ---------------- */

function Sun({ x, y, rising = false }: { x: number; y: number; rising?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 96 96" style={at(x - 48, y - 48, 96, 96)}>
      <circle cx="48" cy="48" r="46" fill={rising ? "rgba(255,190,110,0.28)" : "rgba(255,226,130,0.3)"} />
      <g style={{ transformOrigin: "48px 48px", animation: "spin 40s linear infinite" }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
          <rect key={r} x="45" y="6" width="6" height="14" rx="3" fill={rising ? "#ffb25a" : "#ffd55a"} transform={`rotate(${r} 48 48)`} />
        ))}
      </g>
      <circle cx="48" cy="48" r="24" fill={rising ? "url(#sd-orange)" : "url(#sd-gold)"} />
    </svg>
  );
}

function Moon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 96 96" style={at(292, 196, 96, 96)}>
      <circle cx="48" cy="48" r="46" fill="rgba(255,240,170,0.32)" />
      <circle cx="48" cy="48" r="32" fill="url(#sd-gold)" />
      <circle cx="38" cy="40" r="6" fill="#f0c860" opacity="0.6" />
      <circle cx="58" cy="54" r="8" fill="#f0c860" opacity="0.55" />
      <circle cx="44" cy="62" r="4" fill="#f0c860" opacity="0.5" />
    </svg>
  );
}

/** A shield kite (방패연) with its tails, held by a long string. */
function Kite() {
  return (
    <svg aria-hidden="true" viewBox="0 0 90 150" style={at(288, 196, 90, 150, { animation: "hover 3.6s ease-in-out infinite" })}>
      <path d="M40 62 C34 96 22 124 6 146" stroke="#9a8a78" strokeWidth="1.4" fill="none" />
      <g transform="rotate(8 46 34)">
        <rect x="20" y="6" width="52" height="58" rx="6" fill="url(#sd-white)" />
        <rect x="20" y="6" width="52" height="13" rx="6" fill="url(#sd-red)" />
        <rect x="20" y="51" width="52" height="13" rx="6" fill="url(#sd-blue)" />
        <circle cx="46" cy="35" r="10" fill="#bfe0f7" />
        <circle cx="46" cy="35" r="10" fill="none" stroke="url(#sd-gold)" strokeWidth="3" />
        <path d="M26 64 q-4 12 2 22 M66 64 q4 12 -2 22" stroke="#f47a6c" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Balloons({ x }: { x: number }) {
  const b: [number, number, string][] = [[20, 28, "url(#sd-red)"], [46, 16, "url(#sd-gold)"], [70, 32, "url(#sd-blue)"]];
  return (
    <svg aria-hidden="true" viewBox="0 0 90 150" style={at(x - 45, GROUND - 150, 90, 150)}>
      <g style={{ transformOrigin: "45px 148px", animation: "sway 5s ease-in-out infinite" }}>
        {b.map(([cx, cy, fill]) => (
          <g key={cx}>
            <path d={`M${cx} ${cy + 19} Q${(cx + 45) / 2 + 4} 96 45 148`} stroke="#a7a39c" strokeWidth="1.2" fill="none" />
            <ellipse cx={cx} cy={cy} rx="15" ry="19" fill={fill} />
            <path d={`M${cx - 3} ${cy + 18} h6 l-3 5 z`} fill={fill} />
            <ellipse cx={cx - 5} cy={cy - 8} rx="3.5" ry="5.5" fill="rgba(255,255,255,0.55)" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** A white dove, for Pentecost. */
function Dove() {
  return (
    <svg aria-hidden="true" viewBox="0 0 96 80" style={at(288, 214, 96, 80, { animation: "hover 3.2s ease-in-out infinite" })}>
      <circle cx="48" cy="40" r="38" fill="rgba(255,238,170,0.34)" />
      <path d="M18 46 C30 36 42 38 52 44 C60 34 72 30 82 32 C76 40 70 48 60 52 C52 60 38 60 28 54 Z" fill="url(#sd-white)" />
      <path d="M44 42 C40 26 46 14 58 8 C60 22 58 34 52 44 Z" fill="url(#sd-white)" />
      <circle cx="74" cy="35" r="1.6" fill="#3d3833" />
      <path d="M82 32 l7 2 -7 2 z" fill="url(#sd-orange)" />
      <path d="M22 50 q-8 6 -14 4 q6 -4 8 -9 z" fill="url(#sd-white)" />
    </svg>
  );
}

/* ---------------- what the tree wears ---------------- */

interface Top {
  x: number;
  y: number;
  /** Size of a hat on this tree (1 = the big tree). */
  s: number;
}
/** The top of each stage of the tree, on the canvas. The sprout (2) has nowhere to wear a hat. */
const TOP: Record<number, Top | null> = { 1: { x: 196, y: 444, s: 0.6 }, 2: null, 3: { x: 205, y: 331, s: 0.8 }, 4: { x: 198, y: 258, s: 1.25 }, 5: { x: 198, y: 254, s: 1.25 }, 6: { x: 198, y: 254, s: 1.25 } };
/** Snow lying on the crown, as it would settle on each round top: one path per lump, per stage. */
const BIG_SNOW = [
  "M138 284 Q148 244 196 240 Q244 244 254 284 Q240 273 225 282 Q211 271 196 282 Q181 271 167 282 Q152 273 138 284 Z",
  "M84 322 Q92 292 126 289 Q160 292 166 318 Q152 310 140 318 Q127 308 113 318 Q99 311 84 322 Z",
  "M226 318 Q232 292 266 289 Q300 292 308 322 Q293 311 279 318 Q265 308 252 318 Q240 310 226 318 Z",
];
const SNOW: Record<number, { paths: string[]; dy: number }> = {
  1: { paths: ["M172 453 Q178 438 196 437 Q214 438 220 453 Q212 447 204 453 Q196 446 188 453 Q180 447 172 453 Z"], dy: 0 },
  2: { paths: [], dy: 0 },
  3: { paths: ["M180 345 Q186 326 205 324 Q225 326 231 345 Q221 338 213 345 Q205 337 197 345 Q189 338 180 345 Z", "M139 358 Q143 342 160 340 Q177 342 181 356 Q173 351 166 356 Q160 349 152 356 Q146 352 139 358 Z"], dy: 0 },
  4: { paths: BIG_SNOW, dy: 10 },
  5: { paths: BIG_SNOW, dy: 6 },
  6: { paths: BIG_SNOW, dy: 6 },
};
/** Strings of lights across the crown: quadratic curves [x0, y0, cx, cy, x1, y1]. */
const STRINGS: Record<number, number[][]> = {
  3: [[140, 372, 195, 396, 246, 366]],
  4: [[92, 345, 195, 396, 300, 335], [108, 396, 200, 430, 290, 392]],
  5: [[92, 341, 195, 392, 300, 331], [108, 392, 200, 426, 290, 388]],
  6: [[92, 341, 195, 392, 300, 331], [108, 392, 200, 426, 290, 388]],
};
const BULBS = ["#ff6b5e", "#ffd24a", "#6fc3ff", "#8fe07c", "#ffa4d0"];

function Hat({ top, santa }: { top: Top; santa: boolean }) {
  const w = 60 * top.s, h = 54 * top.s;
  return (
    <svg aria-hidden="true" viewBox="0 0 60 54" style={at(top.x - w / 2, top.y - h * 0.84, w, h, { transform: "rotate(-7deg)" })}>
      <path d="M9 42 C13 20 28 4 46 9 C41 17 50 30 51 42 Z" fill={santa ? "url(#sd-red)" : "url(#sd-blue)"} />
      {santa ? null : <path d="M14 30 C24 26 38 26 49 30 M19 20 C27 17 37 17 46 21" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.75" />}
      <rect x="4" y="37" width="52" height="14" rx="7" fill="url(#sd-white)" />
      <circle cx="47" cy="9" r="7.5" fill="url(#sd-white)" />
    </svg>
  );
}

/** Things on the grass and in the sky. Drawn behind the tree. */
export function GroundDecor({ look }: { look: HomeLook }) {
  const { season, festival } = look;
  let left: ReactNode = null, right: ReactNode = null, sky: ReactNode = null;
  if (festival === "christmas") { left = <Candles lit={look.candles} />; right = <Gifts />; }
  else if (festival === "newyear") { right = <Sign text={String(look.year)} x={SLOT_R} />; sky = <Sun x={50} y={262} rising />; }
  else if (festival === "seollal") {
    left = <Pouches />;
    sky = <Kite />;
  } else if (festival === "easter") { left = <Eggs x={SLOT_L} />; right = <Eggs x={SLOT_R} few />; }
  else if (festival === "children") { left = <Pinwheel />; right = <Balloons x={SLOT_R} />; }
  else if (festival === "pentecost") { sky = <Dove />; }
  else if (festival === "vbs") { left = <Balloons x={SLOT_L} />; right = <Sign text="여름성경학교" x={SLOT_R - 4} wide />; }
  else if (festival === "chuseok") {
    left = (
      <>
        <img alt="" src="/img/icon-persimmon.webp" style={at(SLOT_L - 34, GROUND - 44, 42, 42, { maxWidth: "none" })} />
        <img alt="" src="/img/icon-persimmon.webp" style={at(SLOT_L + 4, GROUND - 34, 32, 32, { maxWidth: "none" })} />
      </>
    );
    sky = <Moon />;
  } else if (festival === "thanks") { left = <Pumpkins />; right = <Basket />; }

  // The season fills whatever the special time left empty.
  if (season === "spring") { left ??= <Flowers x={SLOT_L} />; right ??= <Flowers x={SLOT_R} />; }
  if (season === "summer") sky ??= <Sun x={342} y={244} />;
  if (season === "autumn") { left ??= <FallenLeaves x={SLOT_L} />; right ??= <FallenLeaves x={SLOT_R} />; }
  if (season === "winter") { if (!right) right = <Snowman x={SLOT_R} />; else left ??= <Snowman x={SLOT_L} />; }

  return (
    <>
      <Clay />
      {sky}
      {left}
      {right}
    </>
  );
}

/** What the tree wears. Drawn over the tree, and sways with it. */
export function TreeDecor({ look, level }: { look: HomeLook; level: number }) {
  const lv = Math.max(1, Math.min(6, level));
  const winter = look.season === "winter";
  const christmas = look.festival === "christmas";
  const top = TOP[lv];
  const strings = christmas ? (STRINGS[lv] ?? []) : [];
  return (
    <>
      {winter ? (
        <svg aria-hidden="true" viewBox="0 0 390 600" style={at(0, 0, 390, 600)}>
          <g transform={`translate(0 ${SNOW[lv].dy})`}>
            {SNOW[lv].paths.map((d) => (
              <path key={d} d={d} fill="url(#sd-white)" />
            ))}
          </g>
        </svg>
      ) : null}
      {strings.length > 0 ? (
        <svg aria-hidden="true" viewBox="0 0 390 600" style={at(0, 0, 390, 600)}>
          {strings.map(([x0, y0, cx, cy, x1, y1], si) => (
            <g key={`${x0}-${y0}`}>
              <path d={`M${x0} ${y0} Q${cx} ${cy} ${x1} ${y1}`} stroke="#4f6a48" strokeWidth="1.6" fill="none" />
              {[0.08, 0.25, 0.42, 0.58, 0.75, 0.92].map((t, ti) => {
                const i = si * 6 + ti;
                const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
                return <circle key={t} cx={x} cy={y + 3} r={lv === 3 ? 3.4 : 4.6} fill={BULBS[i % BULBS.length]} style={{ animation: `bulb ${1.6 + (i % 3) * 0.5}s ease-in-out ${(i % 4) * 0.3}s infinite` }} />;
              })}
            </g>
          ))}
        </svg>
      ) : null}
      {top && (winter || christmas) ? <Hat top={top} santa={christmas} /> : null}
    </>
  );
}

/** Petals in spring, leaves in autumn, snow in winter. Still when motion is turned down (they stay unseen). */
export function Falling({ look }: { look: HomeLook }) {
  const { season } = look;
  if (season === "summer") return null;
  const spots: [number, number, number, number][] = [[40, 196, 0, 7.5], [112, 170, 2.4, 8.5], [182, 150, 4.6, 7], [256, 176, 1.2, 9], [322, 204, 3.4, 8], [356, 160, 5.6, 7.5], [80, 240, 6.4, 9.5], [296, 250, 7.3, 8.5]];
  return (
    <>
      {spots.map(([x, y, delay, dur], i) => {
        const anim = `${season === "winter" ? "snowFall" : "fall"} ${dur}s linear ${delay}s infinite`;
        if (season === "autumn") return <img key={x} alt="" src="/img/icon-leaf.webp" style={at(x, y, 15, 15, { maxWidth: "none", opacity: 0, filter: i % 2 ? "hue-rotate(-68deg) saturate(1.9)" : "hue-rotate(-95deg) saturate(2)", animation: anim })} />;
        if (season === "winter") return <div key={x} aria-hidden="true" style={at(x, y, i % 3 ? 7 : 9, i % 3 ? 7 : 9, { borderRadius: "50%", background: "#ffffff", opacity: 0, animation: anim })} />;
        return <div key={x} aria-hidden="true" style={at(x, y, 10, 7.5, { borderRadius: "6px 6px 6px 1px", background: i % 2 ? "#ffd0de" : "#ffffff", opacity: 0, animation: anim })} />;
      })}
    </>
  );
}
