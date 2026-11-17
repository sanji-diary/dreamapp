/**
 * Which "add to home screen" instructions fit this browser. Pure, so it can be unit-tested
 * and used in the browser. Only the user-agent text is looked at.
 *
 * - inapp: a browser inside another app (KakaoTalk, Naver, Instagram, Facebook, Line). These cannot
 *   add a site to the home screen, so the child is asked to open the link in Safari or Chrome.
 * - ios-safari: Safari on an iPhone or iPad (share button, then "홈 화면에 추가").
 * - ios-other: Chrome, Firefox or Edge on iOS. The child is asked to open the page in Safari.
 * - android: a normal browser on Android (install prompt when the browser offers one, otherwise the menu).
 * - other: a computer or anything unknown. Both sets of steps are offered.
 */
export type InstallKind = "inapp" | "ios-safari" | "ios-other" | "android" | "other";
export type InstallOs = "ios" | "android" | "other";
export type InAppName = "kakaotalk" | "naver" | "instagram" | "facebook" | "line";

export interface InstallPlatform {
  kind: InstallKind;
  os: InstallOs;
  /** Set only when kind is "inapp". */
  app: InAppName | null;
}

const IN_APPS: [InAppName, RegExp][] = [
  ["kakaotalk", /KAKAOTALK/i],
  ["naver", /NAVER\(inapp/i],
  ["instagram", /Instagram/i],
  ["facebook", /FBAN|FBAV/],
  ["line", /\bLine\//i],
];

export const IN_APP_LABEL: Record<InAppName, string> = { kakaotalk: "카카오톡", naver: "네이버 앱", instagram: "인스타그램", facebook: "페이스북", line: "라인" };

export function classifyInstallPlatform(userAgent: string | null | undefined): InstallPlatform {
  const ua = typeof userAgent === "string" ? userAgent : "";
  const os: InstallOs = /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "other";
  const app = IN_APPS.find(([, re]) => re.test(ua))?.[0] ?? null;
  if (app) return { kind: "inapp", os, app };
  if (os === "ios") return { kind: /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-other" : "ios-safari", os, app: null };
  if (os === "android") return { kind: "android", os, app: null };
  return { kind: "other", os, app: null };
}

/**
 * An Android link that asks the system to open an https address in Chrome
 * (Chrome's documented intent: syntax). Returns null for anything that is not an https address.
 * If Chrome is missing the system goes to the address itself (browser_fallback_url).
 */
export function chromeIntentUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.toString())};end`;
}
