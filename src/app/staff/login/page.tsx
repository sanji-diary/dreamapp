import { redirect } from "next/navigation";
import { Face } from "@/components/staff/ui";
import { Chevron } from "@/components/ui";
import { getStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { devSignInAction, startKakaoAction } from "@/lib/staff/actions";
import { devLoginAllowed, inviteName, kakaoConfigured } from "@/lib/staff/kakao";
import { ROLE_NAMES, type Role } from "@/lib/types";

export const metadata = { title: "교사 로그인 · 꿈의숲키우기" };

const ERRORS: Record<string, string> = {
  not_invited: "초대받은 선생님만 들어올 수 있어요",
  inactive: "지금은 들어올 수 없는 계정이에요. 교역자에게 물어봐 주세요",
  cancelled: "카카오 로그인을 취소했어요",
  state: "로그인 시간이 지났어요. 다시 눌러 주세요",
  kakao: "카카오 로그인에 실패했어요. 잠시 뒤에 다시 해 주세요",
  config: "카카오 로그인이 아직 준비되지 않았어요",
};

export default async function StaffLoginPage({ searchParams }: PageProps<"/staff/login">) {
  if (await getStaff()) redirect("/staff");
  const sp = await searchParams;
  const invite = typeof sp.invite === "string" ? sp.invite.slice(0, 100) : "";
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? null) : null;
  // Kakao's own error code (for example KOE010) helps the admin fix the Kakao app settings.
  const kakaoCode = typeof sp.code === "string" && /^[A-Za-z0-9_-]{1,30}$/.test(sp.code) ? sp.code : "";
  const invited = invite ? await inviteName(invite) : null;
  const dev = devLoginAllowed();
  const staff = dev ? await db.query<{ id: number; name: string; role: Role }>("select id, name, role from staff where active order by id") : [];

  return (
    <main className="mx-auto flex w-full max-w-[480px] grow flex-col px-4 pt-16 pb-8 break-keep">
      <h1 className="m-0 text-[22px] leading-[30px] font-bold tracking-[-0.5px]">선생님 로그인</h1>
      <p className="mt-1.5 mb-0 text-[14px] leading-5 tracking-[-0.2px] text-mute">
        {invited ? `${invited} 선생님, 환영해요. 카카오로 한 번만 로그인하면 돼요.` : "꿈의숲키우기 교사용 화면이에요."}
      </p>
      {invite && !invited ? (
        <p role="alert" className="mt-4 mb-0 rounded-[10px] bg-danger-tint px-3 py-[11px] text-[14px] leading-5 font-bold text-[#8E2A22]">
          이미 썼거나 잘못된 초대 링크예요. 전에 로그인한 적이 있다면 그대로 로그인해 주세요.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 mb-0 rounded-[10px] bg-danger-tint px-3 py-[11px] text-[14px] leading-5 font-bold text-[#8E2A22]">
          {error}
          {kakaoCode ? <span className="mt-1 block text-[12px] font-semibold">오류 코드: {kakaoCode}</span> : null}
        </p>
      ) : null}

      {kakaoConfigured() ? (
        <form action={startKakaoAction} className="mt-6">
          <input type="hidden" name="invite" value={invited ? invite : ""} />
          <button type="submit" className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-[#FEE500] text-[16px] font-bold tracking-[-0.3px] text-[#191600]">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
              <path fill="#191600" d="M10 2.5c-4.4 0-8 2.8-8 6.300 0 2.200 1.500 4.200 3.700 5.300l-.8 3c-.1.300.2.500.5.300l3.500-2.300c.4 0 .700.100 1.100.100 4.400 0 8-2.800 8-6.300s-3.600-6.400-8-6.400z" />
            </svg>
            카카오로 시작하기
          </button>
          <p className="mt-3 mb-0 text-[12px] leading-[18px] text-mute">카카오 계정 번호만 확인하고, 이름이나 연락처는 받지 않아요. 초대받은 선생님만 들어올 수 있어요.</p>
        </form>
      ) : dev ? (
        <section className="mt-6 flex flex-col">
          <h2 className="m-0 text-[15px] font-bold text-mute">개발용 로그인</h2>
          <p className="mt-1 mb-1 text-[12px] leading-[18px] text-mute">카카오 키가 없는 개발 환경에서만 보여요. 실제 서비스에서는 나타나지 않아요.</p>
          {staff.map((s, i) => (
            <form key={s.id} action={devSignInAction}>
              <input type="hidden" name="staff_id" value={s.id} />
              <button type="submit" className={`flex min-h-[72px] w-full cursor-pointer items-center gap-[13px] border-0 bg-transparent p-0 text-left ${i === staff.length - 1 ? "" : "border-b border-solid border-line"}`}>
                <Face name={s.name} id={s.id} />
                <span className="flex min-w-0 grow flex-col gap-px">
                  <span className="text-[17px] leading-[23px] font-bold tracking-[-0.4px] text-ink2">{s.name}</span>
                  <span className="text-[13px] leading-[18px] text-sub">{ROLE_NAMES[s.role]}</span>
                </span>
                <Chevron />
              </button>
            </form>
          ))}
        </section>
      ) : (
        <p role="alert" className="mt-6 mb-0 rounded-[10px] bg-fill px-3 py-[11px] text-[14px] leading-5 font-bold text-sub">
          카카오 로그인이 아직 준비되지 않았어요. 관리자에게 알려 주세요.
        </p>
      )}
    </main>
  );
}
