"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { readQuizJson } from "@/lib/quiz";
import { saveUpload } from "@/lib/uploads";
import { adjustPoints, archiveClass, copyPreviousWorship, deleteNotice, deletePost, moveChildren, moveClass, reissueJoinCode, saveClass, saveNotice, savePost, saveSettings, saveWorship, setSelfJoin } from "./admin-misc";
import { duplicateToNextWeek, saveMission, setMissionActive } from "./admin-missions";
import { createStaff, renewInvite, updateStaff } from "./admin-staff";
import { clean, cleanOrNull, fail, toInt, type Result } from "./util";

/**
 * Server actions for the admin screens. requireAdmin() runs first in every action, and the
 * functions they call check the role again.
 */

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function finish(r: Result, path: string, okMessage?: string, errorPath: string = path): never {
  if (!r.ok) redirect(withParam(errorPath, "error", r.error));
  revalidatePath("/staff", "layout");
  redirect(okMessage ? withParam(path, "ok", okMessage) : path);
}

const on = (formData: FormData, key: string) => formData.get(key) === "on";

/* ---------- missions ---------- */

export async function missionSaveAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  const target = clean(formData.get("target"), 20); // 'all' | 'g4' | 'c12'
  const r = await saveMission(staff, id, {
    title: clean(formData.get("title"), 40),
    description: clean(formData.get("description"), 80),
    kind: clean(formData.get("kind"), 12),
    icon: clean(formData.get("icon"), 12),
    points: toInt(formData.get("points")) ?? -1,
    drops: toInt(formData.get("drops")) ?? -1,
    repeat: clean(formData.get("repeat"), 8),
    weekly_limit: toInt(formData.get("weekly_limit")),
    verse_text: cleanOrNull(formData.get("verse_text"), 300),
    verse_ref: cleanOrNull(formData.get("verse_ref"), 40),
    target_grade: target.startsWith("g") ? toInt(target.slice(1)) : null,
    target_class_id: target.startsWith("c") ? toInt(target.slice(1)) : null,
    starts_on: clean(formData.get("starts_on"), 10),
    ends_on: clean(formData.get("ends_on"), 10),
    is_challenge: on(formData, "is_challenge"),
    qr_self: on(formData, "qr_self"),
    quiz: readQuizJson(formData.get("quiz")),
    quiz_pass: toInt(formData.get("quiz_pass")),
    game_id: cleanOrNull(formData.get("game_id"), 40),
  });
  finish(r, "/staff/admin/missions", id === null ? "미션을 올렸어요" : "미션을 고쳤어요", id === null ? "/staff/admin/missions/new" : `/staff/admin/missions/${id}`);
}

export async function missionOpAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect("/staff/admin/missions");
  const op = clean(formData.get("op"), 12);
  if (op === "duplicate") finish(await duplicateToNextWeek(staff, id), "/staff/admin/missions", "다음 주로 복사했어요");
  if (op === "deactivate") finish(await setMissionActive(staff, id, false), "/staff/admin/missions", "미션을 내렸어요");
  if (op === "activate") finish(await setMissionActive(staff, id, true), "/staff/admin/missions", "미션을 다시 올렸어요");
  redirect("/staff/admin/missions");
}

/* ---------- teachers ---------- */

export async function staffCreateAction(formData: FormData) {
  const staff = await requireAdmin();
  const r = await createStaff(staff, clean(formData.get("name"), 20), clean(formData.get("role"), 10));
  if (!r.ok) finish(r, "/staff/admin/staff");
  finish(r, `/staff/admin/staff/${r.id}`, "선생님을 추가했어요. 초대 링크를 보내 주세요");
}

export async function staffSaveAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect("/staff/admin/staff");
  const r = await updateStaff(staff, id, {
    name: clean(formData.get("name"), 20),
    role: clean(formData.get("role"), 10),
    class_ids: formData.getAll("class_ids").map((v) => toInt(v)).filter((n): n is number => n !== null),
    switches: {
      can_attendance: on(formData, "can_attendance"),
      can_visits: on(formData, "can_visits"),
      can_approve: on(formData, "can_approve"),
      can_view_all: on(formData, "can_view_all"),
      can_read_pastor_worries: on(formData, "can_read_pastor_worries"),
    },
    active: formData.get("active") !== "off",
  });
  finish(r, `/staff/admin/staff/${id}`, "저장했어요");
}

export async function staffInviteAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect("/staff/admin/staff");
  finish(await renewInvite(staff, id), `/staff/admin/staff/${id}`, "초대 링크를 새로 만들었어요");
}

/* ---------- classes ---------- */

export async function classSaveAction(formData: FormData) {
  const staff = await requireAdmin();
  finish(await saveClass(staff, toInt(formData.get("id")), clean(formData.get("name"), 20), toInt(formData.get("grade"))), "/staff/admin/classes", "저장했어요");
}

export async function classOpAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect("/staff/admin/classes");
  const op = clean(formData.get("op"), 10);
  if (op === "up" || op === "down") finish(await moveClass(staff, id, op), "/staff/admin/classes");
  if (op === "archive") finish(await archiveClass(staff, id, true), "/staff/admin/classes", "반을 보관했어요");
  if (op === "restore") finish(await archiveClass(staff, id, false), "/staff/admin/classes", "반을 다시 꺼냈어요");
  redirect("/staff/admin/classes");
}

export async function childrenMoveAction(formData: FormData) {
  const staff = await requireAdmin();
  const ids = formData.getAll("child_ids").map((v) => toInt(v)).filter((n): n is number => n !== null);
  const from = clean(formData.get("from"), 10);
  const back = from ? `/staff/admin/classes?from=${encodeURIComponent(from)}` : "/staff/admin/classes";
  const to = toInt(formData.get("to"));
  if (to === null) finish(fail("옮길 반을 골라 주세요"), back);
  const r = await moveChildren(staff, ids, to);
  finish(r, back, r.ok ? `${r.moved}명을 옮겼어요` : undefined);
}

/* ---------- worship, notices, posts ---------- */

export async function worshipSaveAction(formData: FormData) {
  const staff = await requireAdmin();
  const date = clean(formData.get("date"), 10);
  const back = `/staff/admin/worship?date=${encodeURIComponent(date)}`;
  if (formData.get("op") === "copy") finish(await copyPreviousWorship(staff, date), back, "지난 예배 순서를 가져왔어요");
  const titles = formData.getAll("item_title");
  const details = formData.getAll("item_detail");
  const r = await saveWorship(staff, {
    date,
    time_place: clean(formData.get("time_place"), 60),
    sermon_title: clean(formData.get("sermon_title"), 60),
    scripture: clean(formData.get("scripture"), 60),
    preacher: clean(formData.get("preacher"), 30),
    memory_verse: clean(formData.get("memory_verse"), 60),
    items: titles.map((t, i) => ({ title: clean(t, 30), detail: clean(details[i], 80) })),
  });
  finish(r, back, "예배 순서를 저장했어요");
}

export async function noticeAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  const back = "/staff/admin/notices";
  if (formData.get("op") === "delete") {
    if (id === null) redirect(back);
    finish(await deleteNotice(staff, id), back, "공지를 지웠어요");
  }
  const r = await saveNotice(staff, id, {
    title: clean(formData.get("title"), 60),
    body: clean(formData.get("body"), 4000),
    important: on(formData, "important"),
    staff_only: on(formData, "staff_only"),
    event_date: cleanOrNull(formData.get("event_date"), 10),
  });
  finish(r, back, id === null ? "공지를 올렸어요" : "공지를 고쳤어요", id === null ? back : `${back}?edit=${id}`);
}

export async function postAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  const back = "/staff/admin/posts";
  if (formData.get("op") === "delete") {
    if (id === null) redirect(back);
    finish(await deletePost(staff, id), back, "소식을 지웠어요");
  }
  let image: string | null = null;
  const f = formData.get("photo");
  if (f instanceof File && f.size > 0) {
    try {
      image = await saveUpload(f, "post", { staffId: staff.id });
    } catch (e) {
      finish(fail(e instanceof Error ? e.message : "사진을 올리지 못했어요"), back);
    }
  }
  const r = await savePost(staff, id, { body: clean(formData.get("body"), 2000), comments_open: on(formData, "comments_open"), image_url: image, removeImage: on(formData, "remove_image") });
  finish(r, back, id === null ? "소식을 올렸어요" : "소식을 고쳤어요", id === null ? back : `${back}?edit=${id}`);
}

/* ---------- the shared join QR ---------- */

export async function joinQrAction(formData: FormData) {
  const staff = await requireAdmin();
  const op = clean(formData.get("op"), 12);
  if (op === "reissue") finish(await reissueJoinCode(staff), "/staff/admin/cards", "새 가입 QR을 만들었어요. 전에 쓰던 QR은 이제 안 돼요");
  if (op === "on") finish(await setSelfJoin(staff, true), "/staff/admin/cards", "QR로 가입할 수 있게 켰어요");
  if (op === "off") finish(await setSelfJoin(staff, false), "/staff/admin/cards", "QR 가입을 껐어요");
  redirect("/staff/admin/cards");
}

/* ---------- points and settings ---------- */

export async function pointsAdjustAction(formData: FormData) {
  const staff = await requireAdmin();
  const childId = toInt(formData.get("child_id"));
  if (childId === null) finish(fail("아이를 골라 주세요"), "/staff/admin/points");
  const sign = formData.get("sign") === "minus" ? -1 : 1;
  const amount = toInt(formData.get("amount"));
  finish(await adjustPoints(staff, childId, amount === null ? 0 : sign * Math.abs(amount), clean(formData.get("reason"), 100)), "/staff/admin/points", "포인트를 고쳤어요");
}

export async function settingsSaveAction(formData: FormData) {
  const staff = await requireAdmin();
  const n = (key: string) => toInt(formData.get(key)) ?? -1;
  const r = await saveSettings(staff, {
    weeklyDropCap: n("weekly_drop_cap"),
    levelNeeds: [1, 2, 3, 4, 5, 6].map((i) => n(`level_${i}`)),
    classGoal: n("class_goal"),
    harvestBonusPoints: n("harvest_bonus_points"),
  });
  finish(r, "/staff/admin/settings", "설정을 저장했어요");
}
