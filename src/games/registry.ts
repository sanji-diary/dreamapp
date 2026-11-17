/**
 * Mini games that can be used as a 'game' mission.
 *
 * To add a game:
 * 1. Make a client component in src/games/<id>/ that takes `{ onWin }` (see GameProps) and calls
 *    onWin() once when the child has won. No countdowns, rankings or penalties.
 * 2. Add it to GAMES below and to the component map in src/games/GamePlayer.tsx.
 * The admin mission form lists GAMES; missions.game_id stores the chosen id.
 */
export interface GameInfo {
  id: string;
  title: string;
  /** One line for the child, shown before the game starts. */
  description: string;
}

export interface GameProps {
  /** Call once when the game is won. The mission is then checked and recorded by the server. */
  onWin: () => void;
}

export const GAMES: readonly GameInfo[] = [{ id: "memory", title: "짝 맞추기", description: "카드를 두 장씩 뒤집어서 같은 그림을 모두 찾아요." }];

export function findGame(id: string | null | undefined): GameInfo | null {
  return GAMES.find((g) => g.id === id) ?? null;
}
