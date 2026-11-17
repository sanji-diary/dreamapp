import { TreeHome } from "@/components/kid/TreeHome";
import { requireKid } from "@/lib/auth";
import { db } from "@/lib/db";
import { dropBalance, ensureTree, getSettings, missionsForChild, pointBalance, welcomeBackToday } from "@/lib/game";
import { className } from "@/lib/kid/queries";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const kid = await requireKid();
  const [tree, drops, points, missions, settings, cls, welcome, sp] = await Promise.all([
    ensureTree(db, kid.id),
    dropBalance(db, kid.id),
    pointBalance(db, kid.id),
    missionsForChild(db, kid.id),
    getSettings(),
    className(kid.class_id),
    welcomeBackToday(db, kid.id),
    searchParams,
  ]);
  return (
    <TreeHome
      key={tree.id}
      kidLabel={`${cls} ${kid.name}`.trim()}
      points={points}
      level={tree.level}
      given={tree.given}
      drops={drops}
      needs={settings.levelNeeds}
      missionsLeft={missions.filter((m) => m.state === "available").length}
      welcomeDrops={welcome}
      intro={sp.new === "1" && tree.level === 1 && tree.given === 0}
    />
  );
}
