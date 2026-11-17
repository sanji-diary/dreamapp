"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A menu link that knows whether its page is open (tab bar and sidebar).
 * `match` lists the path prefixes that count as "this item"; by default the link's own path.
 * `exact` is for the home item, which would otherwise match every teacher page.
 */
export function ActiveLink({
  href,
  match,
  exact = false,
  className = "",
  on = "",
  off = "",
  children,
}: {
  href: string;
  match?: string[];
  exact?: boolean;
  className?: string;
  /** Classes added while the page is open, and while it is not. */
  on?: string;
  off?: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const active = (match ?? [href]).some((m) => path === m || (!exact && path.startsWith(m + "/")));
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${className} ${active ? on : off}`}>
      {children}
    </Link>
  );
}
