/**
 * Mini games that can be used as a 'game' mission ("미션게임").
 *
 * A child always meets a game the same way: a mission in the list, the mission screen, the game, and
 * the "mission done" screen with the drops. Which game is behind the mission can change every week
 * (the admin picks one on the mission form; missions.game_id stores the id), and so can how many
 * children play and what counts as finishing. Those differences live here, not in the screens.
 *
 * Two ways a game can run:
 * - host 'local': a client component in src/games/<id>/ that takes `{ onWin }` (see GameProps) and
 *   calls onWin() once when the child has won. Add it to GAMES below and to the component map in
 *   src/games/GamePlayer.tsx. The win is checked with a start token (src/lib/kid/game-proof.ts).
 * - host 'hosted': the game runs on its own game server and is shown in a frame. Add it to GAMES
 *   below and describe its server in HOSTED (src/lib/kid/hosted-game.ts). The game server decides
 *   who finished; the app asks it directly before giving anything.
 *   The game server can be somewhere else (한 마리 어디 갔어?) or this app itself (달걀 홀인원:
 *   src/app/minigames/egg-hole-in-one and src/lib/kid/egg-game.ts).
 *
 * A finished game mission can be opened again, alone or to help a friend; it gives nothing more.
 * No rankings or penalties in any game. A hosted game may have its own clock; nothing is lost by
 * running out of time, the children just try again.
 */
export interface GameInfo {
  id: string;
  title: string;
  /** One line for the child, shown before the game starts. */
  description: string;
  host: "local" | "hosted";
  /** How many children play together: 1 alone, 2 with a friend. */
  players: 1 | 2;
  /** What finishing the game means, for the child ("양 여섯 마리를 모두 교회로 데려오면 끝나요"). */
  goal: string;
}

export interface GameProps {
  /** Call once when the game is won. The mission is then checked and recorded by the server. */
  onWin: () => void;
}

export const GAMES: readonly GameInfo[] = [
  { id: "memory", title: "짝 맞추기", description: "카드를 두 장씩 뒤집어서 같은 그림을 모두 찾아요.", host: "local", players: 1, goal: "같은 그림을 모두 찾으면 끝나요." },
  {
    id: "shepherd-coop",
    title: "한 마리 어디 갔어?",
    description: "친구와 둘이 강아지가 되어 양 여섯 마리를 꿈의숲교회로 데려와요.",
    host: "hosted",
    players: 2,
    goal: "5분 안에 양 여섯 마리를 모두 교회로 데려오면 끝나요.",
  },
  {
    id: "egg-hole-in-one",
    title: "달걀 홀인원",
    description: "달걀을 당겼다 놓아 봄 정원의 바구니에 쏙 넣어요.",
    host: "hosted",
    players: 1,
    goal: "세 코스에서 달걀 다섯 개를 바구니에 넣으면 끝나요.",
  },
];

export function findGame(id: string | null | undefined): GameInfo | null {
  return GAMES.find((g) => g.id === id) ?? null;
}

/** "혼자 해요" / "친구와 둘이 해요": how many play, in the child's words. */
export function playersLine(game: Pick<GameInfo, "players">): string {
  return game.players === 2 ? "친구와 둘이 해요" : "혼자 해요";
}
