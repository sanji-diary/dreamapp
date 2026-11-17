import type { LineIconName } from "./kit";

export interface MenuItem {
  href: string;
  label: string;
  icon: LineIconName;
  /** Path prefixes that count as this item (default: its own path). */
  match?: string[];
}

/** 소식, 예배 순서 and 공지 are three pages behind one menu item; ContentTabs switches between them. */
const CONTENT_PAGES = ["/staff/admin/posts", "/staff/admin/worship", "/staff/admin/notices"];

/** "운영" in the sidebar of wide screens, in the mock's order. Admins only. */
export const ADMIN_MENU: MenuItem[] = [
  { href: "/staff/admin/missions", label: "미션", icon: "flag" },
  { href: "/staff/admin/posts", label: "소식·예배", icon: "pen", match: CONTENT_PAGES },
  { href: "/staff/admin/classes", label: "반 편성", icon: "grid" },
  { href: "/staff/admin/staff", label: "교사·권한", icon: "kids" },
  { href: "/staff/admin/cards", label: "QR 카드", icon: "qr" },
  { href: "/staff/admin/talents", label: "달란트", icon: "coin" },
  { href: "/staff/admin/settings", label: "설정", icon: "gear" },
];

/** The "운영" icon grid on phones (더보기 and /staff/admin): the same places plus 교적부 and 포인트 조정. */
export const ADMIN_GRID: MenuItem[] = [
  { href: "/staff/admin/missions", label: "미션", icon: "flag" },
  { href: "/staff/admin/staff", label: "교사·권한", icon: "kids" },
  { href: "/staff/admin/classes", label: "반 편성", icon: "grid" },
  { href: "/staff/admin/cards", label: "QR 카드", icon: "qr" },
  { href: "/staff/admin/posts", label: "소식·예배", icon: "pen" },
  { href: "/staff/admin/talents", label: "달란트", icon: "coin" },
  { href: "/staff/children", label: "교적부", icon: "list" },
  { href: "/staff/admin/settings", label: "설정", icon: "gear" },
  { href: "/staff/admin/points", label: "포인트 조정", icon: "adjust" },
];
