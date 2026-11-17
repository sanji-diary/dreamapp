import "server-only";
import { db } from "@/lib/db";
import { KIND_NAMES } from "@/lib/types";
import { listClasses } from "./access";
import { MISSION_ICONS } from "./admin-missions";

/** Choices shown on the mission form: kinds, icons, and who the mission is for (everyone, a grade, or one class). */
export async function missionFormOptions() {
  const classes = await listClasses(db);
  const grades = [...new Set(classes.map((c) => c.grade).filter((g): g is number => g !== null))].sort();
  return {
    kinds: Object.entries(KIND_NAMES).map(([value, label]) => ({ value, label })),
    icons: [...MISSION_ICONS],
    targets: [{ value: "all", label: "전체" }, ...grades.map((g) => ({ value: `g${g}`, label: `${g}학년` })), ...classes.map((c) => ({ value: `c${c.id}`, label: c.name }))],
  };
}
