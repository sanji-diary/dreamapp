import type { LineIconName } from "./kit";

export interface MenuItem {
  href: string;
  label: string;
  icon: LineIconName;
  /** Path prefixes that count as this item (default: its own path). */
  match?: string[];
}

/** "운영" in the menu of wide screens (design-reference/admin2). Admins only. 기본 설정 sits at the bottom of the menu. */
export const ADMIN_MENU: MenuItem[] = [
  { href: "/staff/admin/missions", label: "미션 계획", icon: "flag" },
  { href: "/staff/admin/posts", label: "소식 글", icon: "pen", match: ["/staff/admin/posts", "/staff/admin/notices"] },
  { href: "/staff/admin/worship", label: "예배 순서", icon: "book" },
  { href: "/staff/admin/classes", label: "반 편성", icon: "grid" },
  { href: "/staff/admin/staff", label: "교사·권한", icon: "shield" },
  { href: "/staff/admin/talents", label: "달란트", icon: "coin", match: ["/staff/admin/talents", "/staff/admin/points"] },
  { href: "/staff/admin/cards", label: "QR 카드", icon: "qr" },
];

/** The "운영" icon grid on phones (더보기 and /staff/admin): the same places plus 교적부, 설정 and 포인트 조정. 예배 순서 is reached only from here on phones. */
export const ADMIN_GRID: MenuItem[] = [
  { href: "/staff/admin/missions", label: "미션", icon: "flag" },
  { href: "/staff/admin/staff", label: "교사·권한", icon: "kids" },
  { href: "/staff/admin/classes", label: "반 편성", icon: "grid" },
  { href: "/staff/admin/cards", label: "QR 카드", icon: "qr" },
  { href: "/staff/admin/posts", label: "소식 글", icon: "pen" },
  { href: "/staff/admin/worship", label: "예배 순서", icon: "book" },
  { href: "/staff/admin/talents", label: "달란트", icon: "coin" },
  { href: "/staff/children", label: "교적부", icon: "list" },
  { href: "/staff/admin/settings", label: "설정", icon: "gear" },
  { href: "/staff/admin/points", label: "포인트 조정", icon: "adjust" },
];
