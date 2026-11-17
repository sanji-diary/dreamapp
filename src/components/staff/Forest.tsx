import type { ReactNode } from "react";
import { treeImage } from "./kit";

/**
 * The two pictures at the top of the teacher home: the children's sky-and-hill scene with a row of
 * trees (phones), and a banner with drawn hills and one labelled tree per class (wide screens).
 */

export interface ForestTree {
  key: string | number;
  /** 1 seed … 6 fruit */
  level: number;
  /** Shown under the tree on the wide banner ('5-2 · 22' or a child's name). */
  label?: string;
}

/** Tree heights in the mock, by level. */
const HEIGHT = [30, 40, 62, 78, 78, 80];

/** Small trees at the edges, the biggest in the middle, as they stand on the hill in the mock. */
export function hillOrder<T extends { level: number }>(trees: T[]): T[] {
  const left: T[] = [];
  const right: T[] = [];
  [...trees].sort((a, b) => a.level - b.level).forEach((t, i) => (i % 2 === 0 ? left.push(t) : right.unshift(t)));
  return [...left, ...right];
}

/**
 * Below `lg`: 320px of the children's background across the whole screen, with the trees standing
 * on its hill. The white panel that follows overlaps the bottom 80px. `children` is the headline
 * area laid over the sky. Trees and headline keep to the same centered column as the content
 * below, so on an unfolded phone or a tablet the picture is full-bleed and the forest stays together.
 */
export function ForestScene({ trees, children }: { trees: ForestTree[]; children: ReactNode }) {
  const row = hillOrder(trees);
  const n = row.length;
  // More than six trees are drawn a little smaller so they still fit side by side.
  const scale = n <= 6 ? 1 : Math.sqrt(6 / n);
  return (
    <div className="relative h-[320px] shrink-0 overflow-hidden bg-linear-to-b from-sky-deep to-sky">
      {/* The ground point of the picture (73% down) is pinned 100px above the bottom edge at every width. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/img/bg.webp" width={390} height={699} className="absolute top-[220px] left-0 block h-auto w-full max-w-none -translate-y-[73.25%]" />
      {/* From 640px the picture is much bigger than on a phone, so the trees are drawn bigger too. */}
      <div className="absolute inset-y-0 left-1/2 w-full max-w-[600px] -translate-x-1/2 [--tree:1] sm:[--tree:1.4]">
        <div aria-hidden="true">
          {row.map((t, i) => {
            const x = (i + 0.5) / n;
            // The hill is a little higher in the middle than at the edges.
            const bottom = 90 + Math.round(10 * Math.sin(Math.PI * x));
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={t.key}
                alt=""
                src={treeImage(t.level)}
                className="absolute block w-auto max-w-none -translate-x-1/2"
                style={{ left: `calc(14px + (100% - 28px) * ${x.toFixed(4)})`, bottom, height: `calc(${Math.round(HEIGHT[t.level - 1] * scale)}px * var(--tree))`, zIndex: 110 - bottom }}
              />
            );
          })}
        </div>
        <div className="absolute top-[22px] right-3.5 left-5 z-[30] flex items-start gap-2.5">{children}</div>
      </div>
    </div>
  );
}

/** Wide screens: sky, two drawn hills and a row of labelled trees on the right. `children` is the text on the left. */
export function ForestBanner({ trees, children }: { trees: ForestTree[]; children: ReactNode }) {
  const n = trees.length;
  return (
    <div className="relative h-[170px] shrink-0 overflow-hidden rounded-3xl bg-linear-to-b from-sky-deep to-sky">
      <div aria-hidden="true" className="absolute right-[-8%] bottom-[22px] h-[120px] w-2/5 rounded-[50%] bg-hill" />
      <div aria-hidden="true" className="absolute right-[-12%] bottom-[-166px] left-[-12%] h-[240px] rounded-[50%] bg-linear-to-b from-ground to-ground-deep" />
      <div className="absolute top-[26px] left-7 z-[2] max-w-[280px]">{children}</div>
      <ul aria-label="나무" className="absolute right-6 bottom-0 left-[310px] m-0 flex list-none items-end gap-1.5 p-0">
        {trees.map((t, i) => (
          // The front hill falls away to the right: each tree stands a little lower than the one before.
          <li key={t.key} className="flex w-[84px] min-w-0 shrink flex-col items-center gap-1" style={{ marginBottom: n > 1 ? Math.round(14 - (14 * i) / (n - 1)) : 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={treeImage(t.level)} className="block w-auto max-w-none" style={{ height: HEIGHT[t.level - 1] }} />
            {t.label ? <span className="max-w-full truncate rounded-full bg-white px-[9px] py-0.5 text-[11.5px] font-bold text-ink2 shadow-[0_1px_4px_rgba(25,31,40,0.1)]">{t.label}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
