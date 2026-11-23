"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { catchUpGamesAction } from "@/lib/kid/mission-actions";

/**
 * Put on a screen only when the child was in a mission game lately and the game server has not been
 * asked since (hasUnsettledGame). It asks once, after the screen is shown, so a slow game server
 * never holds the screen back. A finished game found this way opens the usual "mission done" screen.
 */
export function GameCatchUp() {
  const router = useRouter();
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    catchUpGamesAction()
      .then((id) => {
        if (id !== null) router.push(`/missions/done/${id}`);
      })
      .catch(() => {});
  }, [router]);
  return null;
}
