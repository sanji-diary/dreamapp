import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoMission, SelfMission, TeacherCheckMission, TextMission, VerseMission, WorryForm } from "@/components/kid/MissionForms";
import { MissionNote, MissionShell } from "@/components/kid/MissionShell";
import { QuizMission } from "@/components/kid/QuizMission";
import { primaryButtonClass } from "@/components/ui";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { missionsForChild } from "@/lib/game";
import { GamePlayer } from "@/games/GamePlayer";
import { findGame } from "@/games/registry";
import { audienceChoices } from "@/lib/kid/audience";
import { issueGameToken } from "@/lib/kid/game-proof";
import { afterCheckLine, RETURNED_LINE, rewardButton, rewardPill } from "@/lib/kid/mission-text";
import { parseQuiz, passNeed, publicQuiz } from "@/lib/quiz";
import { normalizeVerse } from "@/lib/verse";

export const metadata = { title: "미션 · 꿈의숲키우기" };

function BackToList({ label = "미션 목록으로" }: { label?: string }) {
  return (
    <>
      <div className="grow" />
      <div className="px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
        <Link href="/missions" className={`${primaryButtonClass} h-[54px] rounded-[14px] text-[17px] no-underline`}>
          {label}
        </Link>
      </div>
    </>
  );
}

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kid = await requireKid();
  const m = (await missionsForChild(db, kid.id)).find((x) => x.id === Number(id));
  if (!m) notFound();
  const reward = rewardPill(m);
  const capNote = m.state === "available" && m.drops > 0 && m.drops_now === 0 ? "이번 주 물방울은 모두 받았어요. 이 미션은 포인트만 쌓여요." : null;
  // A teacher looked at the last try and asked for it once more: said plainly, once, above the headline.
  const notice = m.returned ? RETURNED_LINE : null;

  // Writing a worry stays possible after this week's mission is done; it just gives no more drops.
  if (m.kind === "worry") {
    const open = m.state === "available";
    return (
      <MissionShell reward={open ? reward : undefined} title={"요즘 마음에 걸리는\n일이 있나요?"} sub={open ? (capNote ?? "작은 일도 괜찮아요. 편하게 적어 주세요.") : "이번 주 물방울은 이미 받았지만, 이야기는 언제든 적을 수 있어요."}>
        <WorryForm options={await audienceChoices(kid.id)} sendLabel={open && m.drops_now > 0 ? "보내고 물방울 받기" : "보내기"} />
      </MissionShell>
    );
  }

  if (m.state !== "available") {
    const everyDay = m.repeat === "daily" && m.weekly_limit === null && m.mode === "fixed";
    return (
      <MissionShell title={m.title} sub={m.description}>
        <MissionNote
          icon={m.icon}
          lines={
            m.state === "pending"
              ? ["선생님이 확인하고 있어요", afterCheckLine(m)]
              : m.repeat === "daily"
                ? ["오늘은 이미 했어요", everyDay ? "내일 또 할 수 있어요." : "내일 또 할 수 있는지 미션 목록에서 확인해 보세요."]
                : ["이미 완료한 미션이에요", "다른 미션도 해 볼까요?"]
          }
        />
        <BackToList />
      </MissionShell>
    );
  }

  switch (m.kind) {
    case "self":
      return (
        <MissionShell reward={reward} title={m.title} sub={capNote ?? m.description}>
          <MissionNote icon={m.icon} lines={["스스로 했는지 확인해요", "정말 했을 때만 눌러 주세요. 정직하게 하는 게 가장 멋져요."]} />
          <SelfMission missionId={m.id} reward={rewardButton(m)} />
        </MissionShell>
      );
    case "text":
      return (
        <MissionShell reward={reward} title={m.title} sub={capNote ?? m.description}>
          <TextMission missionId={m.id} reward={rewardButton(m)} />
        </MissionShell>
      );
    case "verse": {
      if (!m.verse_list || m.verse_list.length === 0) break;
      // The verses go to the browser the way they are compared: spaces tidied, quotes straightened.
      const verses = m.verse_list.map((v) => ({ n: v.n, text: normalizeVerse(v.text) }));
      return (
        <MissionShell reward={reward} title={"이번 주 말씀을\n따라 써 보세요"} sub={capNote ?? m.verse_ref ?? m.description}>
          <VerseMission missionId={m.id} verses={verses} startAt={m.verse_done} reward={rewardButton(m)} />
        </MissionShell>
      );
    }
    case "photo":
      return (
        <MissionShell reward={reward} notice={notice} title={m.title} sub={capNote ?? m.description}>
          <PhotoMission missionId={m.id} hasDrops={m.drops_now > 0} />
        </MissionShell>
      );
    case "comment":
      return (
        <MissionShell reward={reward} title={m.title} sub={capNote ?? m.description}>
          <MissionNote icon={m.icon} lines={["숲 소식에 댓글을 달면 돼요", "이번 주 첫 댓글을 올리면 바로 완료돼요."]} />
          <div className="grow" />
          <div className="px-5 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
            <Link href="/feed" className={`${primaryButtonClass} h-[54px] rounded-[14px] text-[17px] no-underline`}>
              숲 소식 보러 가기
            </Link>
          </div>
        </MissionShell>
      );
    case "attendance":
      return (
        <MissionShell reward={reward} title={m.title} sub={capNote ?? m.description}>
          <MissionNote
            icon={m.icon}
            lines={m.qr_code ? ["주일 예배에 와서 QR을 찍어 주세요", "교회에 붙어 있는 출석 QR을 휴대폰 카메라로 찍으면 돼요. 선생님이 출석을 확인해 줘도 물방울이 들어와요."] : ["주일 예배에 오면 돼요", "선생님이 출석을 확인하면 물방울이 자동으로 들어와요."]}
          />
          <BackToList />
        </MissionShell>
      );
    case "qr":
      return (
        <MissionShell reward={reward} title={m.title} sub={capNote ?? m.description}>
          <MissionNote icon={m.icon} lines={["QR을 찍으면 완료돼요", "교회에 붙어 있는 QR을 휴대폰 카메라로 찍어 주세요."]} />
          <BackToList />
        </MissionShell>
      );
    case "teacher":
      return (
        <MissionShell reward={reward} notice={notice} title={m.title} sub={capNote ?? m.description}>
          <MissionNote icon={m.icon} lines={["선생님이 확인해 주는 미션이에요", "미션을 다 했으면 아래 버튼을 눌러 선생님께 알려 주세요."]} />
          <TeacherCheckMission missionId={m.id} />
        </MissionShell>
      );
    case "quiz": {
      // Only the questions and choices go to the browser; the answers stay on the server.
      const quiz = parseQuiz(m.quiz);
      if (quiz.length === 0) break;
      return <QuizMission missionId={m.id} title={m.title} description={capNote ?? m.description} reward={reward} rewardButton={rewardButton(m)} questions={publicQuiz(quiz)} need={passNeed(quiz.length, m.quiz_pass)} />;
    }
    case "game": {
      const game = findGame(m.game_id);
      if (!game) break;
      return (
        <MissionShell reward={reward} title={m.title} sub={capNote ?? (m.description || game.description)}>
          <GamePlayer missionId={m.id} gameId={game.id} token={await issueGameToken(kid.id, m.id, game.id)} />
        </MissionShell>
      );
    }
  }
  // a verse mission without verses, a quiz without questions, a game that no longer exists, and anything not ready yet
  return (
    <MissionShell reward={reward} title={m.title} sub={m.description}>
      <MissionNote icon={m.icon} lines={["준비 중이에요", "조금만 기다려 주세요. 곧 할 수 있게 만들고 있어요."]} />
      <BackToList />
    </MissionShell>
  );
}
