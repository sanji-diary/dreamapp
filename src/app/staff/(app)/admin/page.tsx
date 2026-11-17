import Link from "next/link";
import { TabHeader } from "@/components/staff/ui";
import { Chevron, Circle, Icon, Row } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "관리 · 꿈의숲키우기" };

const MENU = [
  { href: "/staff/admin/missions", icon: "stamp", title: "미션", sub: "이번 주 미션 올리기, 다음 주로 복사" },
  { href: "/staff/admin/worship", icon: "bible", title: "예배 순서", sub: "이번 주 예배와 암송 말씀" },
  { href: "/staff/admin/notices", icon: "badge", title: "공지", sub: "행사와 교사용 공지" },
  { href: "/staff/admin/posts", icon: "bubble", title: "숲 소식", sub: "소식 올리기, 댓글 관리" },
  { href: "/staff/admin/staff", icon: "pray", title: "교사 권한", sub: "초대 링크, 등급, 담당 반" },
  { href: "/staff/admin/classes", icon: "house", title: "반", sub: "반 만들기, 아이들 반 옮기기" },
  { href: "/staff/admin/cards", icon: "leaf", title: "QR 카드", sub: "아이 로그인 카드 인쇄" },
  { href: "/staff/admin/points", icon: "pouch", title: "포인트", sub: "포인트 고치기, 엑셀로 내려받기" },
  { href: "/staff/admin/talents", icon: "persimmon", title: "달란트 잔치", sub: "포인트를 달란트로 바꾸기, 잔치 결제" },
  { href: "/staff/admin/settings", icon: "can", title: "설정", sub: "주간 물방울 한도, 나무 단계" },
];

export default async function AdminHome() {
  await requireAdmin();
  return (
    <>
      <TabHeader title="관리" sub="교역자만 볼 수 있는 화면이에요" />
      <ul className="m-0 flex list-none flex-col px-4 pt-2 pb-6">
        {MENU.map((m, i) => (
          <li key={m.href}>
            <Link href={m.href} className="block text-inherit no-underline">
              <Row
                last={i === MENU.length - 1}
                left={
                  <Circle>
                    <Icon name={m.icon} />
                  </Circle>
                }
                title={m.title}
                sub={m.sub}
                right={<Chevron />}
              />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
