import { redirect } from "next/navigation";
import { Small } from "@/components/staff/admin-kit";
import { SubmitButton } from "@/components/staff/form-kit";
import { FlashNote, Notice, Page, PageHeader, PillLink } from "@/components/staff/kit";
import { QrPoster } from "@/components/staff/QrPoster";
import { PrintButton } from "@/components/staff/widgets";
import { requireStaff } from "@/lib/auth";
import { attendanceQrOnAction } from "@/lib/staff/actions-admin";
import { attendanceQr } from "@/lib/staff/attendance-qr";
import { publicOrigin } from "@/lib/staff/origin";
import { formatKoreanDate } from "@/lib/time";

export const metadata = { title: "출석 QR · 꿈의숲키우기" };

/**
 * 출석 QR: the QR children scan at church to check in by themselves. Show it on this screen
 * (a tablet at the door) or print it. Teachers who take attendance may open it; turning it on the
 * first time is for an admin.
 */
export default async function AttendanceQrPage({ searchParams }: PageProps<"/staff/attendance/qr">) {
  const staff = await requireStaff();
  const [state, sp] = await Promise.all([attendanceQr(staff), searchParams]);
  if (!state) redirect("/staff");
  const m = state.mission;

  return (
    <Page narrow>
      <PageHeader back="/staff/attendance" backLabel="출석으로 돌아가기" title="출석 QR" />
      <FlashNote ok={sp.ok} error={sp.error} />
      {m ? (
        <>
          <div className="flex flex-col gap-2.5 print:hidden">
            <p className="m-0 text-[14px] leading-[21px] text-sub">
              아이가 앱 첫 화면의 ‘출석 체크’를 누르고 이 QR을 찍으면 출석이 기록되고 보상이 들어가요. 이 화면을 그대로 보여 주거나, 인쇄해서 붙여 주세요. QR은 주일마다 바뀌어요.
            </p>
            <PrintButton>QR 인쇄하기</PrintButton>
          </div>
          <QrPoster
            big
            url={`${await publicOrigin()}/q/${m.code}`}
            brand="꿈의숲키우기 · 출석 QR"
            title={m.title}
            sub={formatKoreanDate(state.sunday)}
            help={
              <>
                꿈의숲 앱 첫 화면에서 ‘출석 체크’를 눌러 찍어 주세요.
                <br />
                출석이 기록되고 물방울을 받아요.
              </>
            }
            small="휴대폰 카메라로 찍어도 돼요. 처음이라면 먼저 내 QR 카드를 찍고 비밀번호를 눌러요."
          />
          <div className="flex flex-col gap-1.5 print:hidden">
            <Small>주일에만 찍을 수 있고, 한 아이에 한 번만 들어가요. 선생님이 먼저 결석으로 적은 아이는 찍어도 바뀌지 않아요.</Small>
            <Small>이 QR은 {formatKoreanDate(state.sunday)}에만 써요. 지난 QR은 찍어도 출석이 되지 않으니, 주일마다 새로 인쇄하거나 이 화면을 보여 주세요.</Small>
            <Small>같은 날 QR 사진을 받아서 찍는 것까지는 막지 못해요. 틀린 출석은 출석부에서 고칠 수 있어요.</Small>
            {staff.role === "admin" ? (
              <div className="pt-1">
                <PillLink href={`/staff/admin/missions/${m.id}`} tone="gray">
                  출석 미션 고치기
                </PillLink>
              </div>
            ) : null}
          </div>
        </>
      ) : state.canEnable ? (
        <form action={attendanceQrOnAction} className="flex flex-col gap-3">
          <Notice>아직 출석 QR이 꺼져 있어요.</Notice>
          <p className="m-0 text-[14px] leading-[21px] text-sub">
            켜면 ‘{state.canEnable.title}’ 미션에 QR이 생겨요. 아이가 주일에 앱에서 ‘출석 체크’를 누르고 QR을 찍으면 출석이 기록되고 그 미션의 보상이 들어가요. 선생님이 출석부에서 체크하는 것도 그대로 할 수 있어요.
          </p>
          <SubmitButton>출석 QR 켜기</SubmitButton>
        </form>
      ) : (
        <Notice tone="warn">{staff.role === "admin" ? "출석 미션이 없어요. 미션 계획에서 출석 미션을 먼저 만들어 주세요." : "아직 출석 QR이 꺼져 있어요. 관리자에게 켜 달라고 말해 주세요."}</Notice>
      )}
    </Page>
  );
}
