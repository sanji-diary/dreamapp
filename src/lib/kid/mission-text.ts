import type { MissionForChild } from "@/lib/game";

/**
 * The words on the children's mission screens. Kept apart from the pages so they can be tested:
 * a mission may give drops and points, points only (the daily reading), or nothing more this week
 * (the weekly drop cap is reached), and each case has to read naturally.
 */

type M = Pick<MissionForChild, "state" | "drops" | "drops_now" | "points">;

/** The small button at the right of a mission row. */
export function pillLabel(m: M): string {
  if (m.state === "pending") return "확인 중";
  if (m.state === "done") return "완료";
  if (m.drops_now > 0) return `물방울 ${m.drops_now}개`;
  // A mission that never gives drops shows what it does give; "포인트만" is for a drop mission after the weekly cap.
  if (m.drops === 0) return m.points > 0 ? `${m.points}P` : "하기";
  return "포인트만";
}

/** True when the pill already shows the points, so they are not repeated beside the title. */
export function pillShowsPoints(m: M): boolean {
  return m.state === "available" && m.drops === 0 && m.points > 0;
}

/** The pill at the top right of a mission screen: "15P · 물방울 2개", "2P", or "" when there is nothing to show. */
export function rewardPill(m: M): string {
  const parts = [];
  if (m.points > 0) parts.push(`${m.points}P`);
  if (m.drops_now > 0) parts.push(`물방울 ${m.drops_now}개`);
  return parts.join(" · ");
}

/** Button text: drops when the mission gives some now, otherwise points. */
export function rewardButton(m: M): string {
  if (m.drops_now > 0) return `물방울 ${m.drops_now}개 받기`;
  if (m.points > 0) return `${m.points}P 받기`;
  return "완료하기";
}

/** What a waiting child will get once a teacher has checked. */
export function afterCheckLine(m: M): string {
  if (m.drops_now > 0) return "확인이 끝나면 물방울을 받아요.";
  if (m.points > 0) return "확인이 끝나면 포인트를 받아요.";
  return "확인이 끝나면 완료돼요.";
}

export const RETURNED_LINE = "선생님이 다시 해 달라고 했어요";

type Listed = Pick<MissionForChild, "state" | "repeat" | "weekly_limit" | "done_this_week" | "description" | "kind" | "verse_ref" | "verse_list" | "verse_done" | "returned">;

/** What a mission is about, in a few words: the week's reference for a verse mission, else its description. */
function about(m: Listed): string {
  if (m.kind === "verse" && m.verse_ref) return `${m.verse_ref} 따라 쓰기`;
  return m.description;
}

/** The second line of a mission row. `received` is the drops this mission has already given this week. */
export function missionSubLine(m: Listed, received: number): string {
  if (m.state === "pending") return "선생님이 확인하고 있어요";
  // No weekly limit means every day of the week.
  const left = Math.max(0, (m.weekly_limit ?? 7) - m.done_this_week);
  if (m.state === "done") {
    if (m.repeat === "daily") {
      if (m.weekly_limit === null) return "오늘은 했어요";
      return left > 0 ? `오늘은 했어요 · 이번 주 ${left}번 남음` : "이번 주에 할 만큼 다 했어요";
    }
    const got = received > 0 ? `물방울 ${received}개 받음` : "완료";
    return about(m) ? `${about(m)} · ${got}` : got;
  }
  if (m.returned) return RETURNED_LINE;
  if (m.repeat === "daily") {
    if (m.weekly_limit === null) return m.description ? `하루 한 번 · ${m.description}` : "하루 한 번";
    return `하루 한 번 · 이번 주 ${left}번 남음`;
  }
  if (m.kind === "verse" && m.verse_list && m.verse_done > 0) return `${about(m)} · ${m.verse_list.length}절 중 ${m.verse_done}절 썼어요`;
  return about(m);
}

type Counted = Pick<MissionForChild, "state" | "drops_now" | "repeat" | "weekly_limit" | "done_this_week">;

/**
 * The headline of the mission list. It counts drops only: a mission that gives points alone never
 * adds to "물방울 N개 받기" and never keeps the list from saying the drop missions are done.
 */
export function listHeadline(missions: Counted[], cap: number, earned: number): { title: string; sub: string } {
  const room = Math.max(0, cap - earned);
  const open = missions.filter((m) => m.state === "available");
  // Each mission is capped on its own, so the total is capped again by what is left this week.
  const canGet = Math.min(room, open.reduce((n, m) => n + m.drops_now, 0));
  const week = `이번 주에 받을 수 있는 물방울은 모두 ${cap}개예요. 지금까지 ${earned}개 받았어요.`;
  if (room === 0) {
    return { title: "이번 주 물방울을 모두 받았어요", sub: `한 주에 ${cap}개까지 받을 수 있어요. 남은 미션을 하면 포인트는 계속 쌓이고, 물방울은 다음 주일부터 다시 받아요.` };
  }
  if (open.length === 0) {
    // A daily mission done today opens again tomorrow, so the week is not over yet.
    const moreTomorrow = missions.some((m) => m.repeat === "daily" && m.state === "done" && m.done_this_week < (m.weekly_limit ?? 7));
    return { title: moreTomorrow ? "오늘 할 미션을 모두 했어요" : "이번 주 미션을 모두 했어요", sub: week };
  }
  if (canGet === 0) return { title: "물방울 미션을 모두 했어요", sub: `지금까지 물방울 ${earned}개를 받았어요. 남은 미션을 하면 포인트가 쌓여요.` };
  return { title: `미션하고 물방울 ${canGet}개 받기`, sub: week };
}
