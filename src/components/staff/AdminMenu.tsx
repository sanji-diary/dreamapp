import Link from "next/link";
import { LineIcon, Segmented } from "./kit";
import { ADMIN_GRID } from "./menu";

/** The "운영" icon grid: line icons on navy-tint circles, four across on phones. Admins only (the pages check again). */
export function AdminGrid() {
  return (
    <nav aria-label="운영" className="grid grid-cols-4 gap-x-1 gap-y-3.5 sm:grid-cols-5">
      {ADMIN_GRID.map((m) => (
        <Link key={m.href} href={m.href} className="group flex flex-col items-center gap-[7px] text-center text-[12px] font-medium text-ink2 no-underline outline-none">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-staff-tint text-staff group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-staff">
            <LineIcon name={m.icon} />
          </span>
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * 숲 소식 and 공지 are two pages behind one menu item ("소식 글"); this switch at the top of both moves
 * between them. 예배 순서 has its own menu item.
 */
export function ContentTabs({ active }: { active: "posts" | "notices" }) {
  return (
    <div className="w-full max-w-[320px] print:hidden">
      <Segmented
        label="소식 글"
        items={[
          { href: "/staff/admin/posts", label: "숲 소식", on: active === "posts" },
          { href: "/staff/admin/notices", label: "공지", on: active === "notices" },
        ]}
      />
    </div>
  );
}
