"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { saveLookChoice } from "@/lib/look-setting";
import { readQuizJson } from "@/lib/quiz";
import { saveUpload } from "@/lib/uploads";
import { adjustPoints, archiveClass, copyPreviousWorship, deleteNotice, deletePost, moveChildren, moveClass, reissueJoinCode, saveClass, saveNotice, savePost, saveSettings, saveWorship, setSelfJoin } from "./admin-misc";
import { weekStart } from "@/lib/time";
import { copyWeek, duplicateToNextWeek, getMission, saveMission, setMissionActive, setMissionChallenge } from "./admin-missions";
import { clearWeekVerses, createDefaultFixedMissions, resetWeekRotation, saveWeekVerses, setRotatingPerWeek, setWeekRotation } from "./admin-plan";
import { enableAttendanceQr } from "./attendance-qr";
import { createStaff, getStaffRow, renewInvite, setStaffSwitch, updateStaff } from "./admin-staff";
import type { Verse } from "@/lib/types";
import { clean, cleanOrNull, fail, isDate, toInt, type Result } from "./util";

/**
 * Server actions for the admin screens. requireAdmin() runs first in every action, and the
 * functions they call check the role again.
 */

/** Adds one query value to a path, before its #place if it has one. */
function withParam(path: string, key: string, value: string): string {
  const at = path.indexOf("#");
  const [base, hash] = at < 0 ? [path, ""] : [path.slice(0, at), path.slice(at)];
  return `${base}${base.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}${hash}`;
}

function finish(r: Result, path: string, okMessage?: string, errorPath: string = path): never {
  if (!r.ok) redirect(withParam(errorPath, "error", r.error));
  revalidatePath("/staff", "layout");
  redirect(okMessage ? withParam(path, "ok", okMessage) : path);
}

const on = (formData: FormData, key: string) => formData.get(key) === "on";

/** The verses the verse editor posts as JSON. Anything unreadable becomes an empty list, which the check then refuses. */
function readVersesJson(raw: FormDataEntryValue | null): Verse[] {
  if (typeof raw !== "string" || raw.length > 20000) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as Verse[]) : [];
  } catch {
    return [];
  }
}

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
    mode: formData.has("mode") ? clean(formData.get("mode"), 8) : undefined,
    verses: formData.has("verses") ? readVersesJson(formData.get("verses")) : undefined,
  });
  // Back to the list, on the week the mission starts in and with the mission open; a fixed or rotating one goes to the plan.
  const starts = clean(formData.get("starts_on"), 10);
  const mode = clean(formData.get("mode"), 8);
  const list = !r.ok ? MISSIONS : mode === "fixed" || mode === "pool" ? missionsPath(null, r.id) : isDate(starts) ? missionsPath(weekStart(starts), r.id) : MISSIONS;
  finish(r, list, id === null ? "미션을 올렸어요" : "미션을 고쳤어요", id === null ? `${MISSIONS}/new` : `${MISSIONS}/${id}`);
}

const MISSIONS = "/staff/admin/missions";

/** The mission list on one week (a Sunday, or "past" for the list of old missions) with one mission open. Both are checked here. */
function missionsPath(week: unknown, openId: number | null): string {
  const p = new URLSearchParams();
  if (week === "past" || isDate(week)) p.set("w", week);
  if (openId !== null) p.set("id", String(openId));
  const s = p.toString();
  return s ? `${MISSIONS}?${s}` : MISSIONS;
}

export async function missionOpAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect(MISSIONS);
  const op = clean(formData.get("op"), 14);
  // The list comes back as it was: same week, same mission open.
  const here = missionsPath(clean(formData.get("w"), 10), id);
  if (op === "duplicate") {
    const r = await duplicateToNextWeek(staff, id);
    const copy = r.ok ? await getMission(staff, r.id) : null;
    finish(r, copy ? missionsPath(weekStart(copy.starts_on), copy.id) : here, "다음 주로 복사했어요", here);
  }
  if (op === "deactivate") finish(await setMissionActive(staff, id, false), here, "이제 이 미션은 받지 않아요");
  if (op === "activate") finish(await setMissionActive(staff, id, true), here, "미션을 다시 받아요");
  if (op === "challenge_on") finish(await setMissionChallenge(staff, id, true), here, "도전 미션으로 정했어요");
  if (op === "challenge_off") finish(await setMissionChallenge(staff, id, false), here, "도전 미션에서 뺐어요");
  redirect(here);
}

/** "지난주 미션 복사": fills the week in `to` with copies of the missions of the week before it. */
export async function missionCopyWeekAction(formData: FormData) {
  const staff = await requireAdmin();
  const to = clean(formData.get("to"), 10);
  const here = missionsPath(to, null);
  // The screen sends the ticked missions (pick=1); without it everything in the plan is copied.
  const only = formData.has("pick") ? formData.getAll("mission_ids").map((x) => toInt(x)).filter((n): n is number => n !== null) : undefined;
  const r = await copyWeek(staff, to, undefined, only);
  finish(r, here, r.ok ? `미션 ${r.copied}개를 복사했어요${r.skipped > 0 ? `. 이미 있던 ${r.skipped}개는 그대로 두었어요` : ""}` : undefined);
}

/* ---------- the mission plan (on the mission screen) ---------- */

/** The mission screen on one week (a Sunday), scrolled to one of its parts. */
function planPath(week: unknown, part: "fixed" | "rotation" | "dated" = "rotation"): string {
  return `${missionsPath(isDate(week) ? weekStart(week) : null, null)}#${part}`;
}

/** "고정 미션 4개 만들기": the four missions every week starts with. Pressing it twice makes nothing new. */
export async function planCreateFixedAction(formData: FormData) {
  const staff = await requireAdmin();
  const week = clean(formData.get("w"), 10);
  const r = await createDefaultFixedMissions(staff);
  finish(r, planPath(week, "fixed"), r.ok ? (r.created > 0 ? `고정 미션 ${r.created}개를 만들었어요. 이번 주 말씀을 넣어 주세요` : "고정 미션이 이미 있어요") : undefined);
}

/** The rotating missions of one week, chosen by hand: the boxes ticked, in the order of the list. */
export async function planRotationAction(formData: FormData) {
  const staff = await requireAdmin();
  const week = clean(formData.get("w"), 10);
  const ids = formData.getAll("mission_ids").map((v) => toInt(v)).filter((n): n is number => n !== null);
  finish(await setWeekRotation(staff, week, ids), planPath(week), ids.length > 0 ? `이 주 순환 미션을 ${ids.length}개로 정했어요` : "이 주에는 순환 미션을 내지 않아요");
}

/** Back to the automatic pick for one week. */
export async function planRotationResetAction(formData: FormData) {
  const staff = await requireAdmin();
  const week = clean(formData.get("w"), 10);
  finish(await resetWeekRotation(staff, week), planPath(week), "이 주 순환 미션을 자동으로 되돌렸어요");
}

/** How many rotating missions come out each week, from the mission screen. */
export async function planPerWeekAction(formData: FormData) {
  const staff = await requireAdmin();
  const week = clean(formData.get("w"), 10);
  const n = toInt(formData.get("per_week")) ?? -1;
  finish(await setRotatingPerWeek(staff, n), planPath(week), `이제 한 주에 순환 미션이 ${n}개씩 나와요`);
}

function versesPath(id: number, week: unknown): string {
  return `${MISSIONS}/${id}/verses${isDate(week) ? `?w=${weekStart(week)}` : ""}`;
}

/** One week's verses of "이번 주 말씀 쓰기", from the verse editor. */
export async function weekVersesSaveAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect(MISSIONS);
  const week = clean(formData.get("w"), 10);
  const r = await saveWeekVerses(staff, id, week, { ref: cleanOrNull(formData.get("verse_ref"), 40), verses: readVersesJson(formData.get("verses")) });
  finish(r, versesPath(id, week), "이 주 말씀을 저장했어요");
}

export async function weekVersesClearAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect(MISSIONS);
  const week = clean(formData.get("w"), 10);
  finish(await clearWeekVerses(staff, id, week), versesPath(id, week), "이 주 말씀을 지웠어요");
}

/* ---------- teachers ---------- */

export async function staffCreateAction(formData: FormData) {
  const staff = await requireAdmin();
  const r = await createStaff(staff, clean(formData.get("name"), 20), clean(formData.get("role"), 10));
  // On a mistake the invite form stays open.
  if (!r.ok) finish(r, "/staff/admin/staff?new=1");
  finish(r, `/staff/admin/staff/${r.id}`, "선생님을 추가했어요. 초대 링크를 보내 주세요");
}

const SWITCH_WORDS: Record<string, string> = {
  can_attendance: "출석 체크를",
  can_visits: "심방 기록을",
  can_approve: "미션 확인을",
  can_view_all: "모든 반 보기를",
  can_read_pastor_worries: "전도사님 고민 읽기를",
};

/** One switch in the table of teachers. setStaffSwitch checks the key and the role again. */
export async function staffSwitchAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect("/staff/admin/staff");
  const key = clean(formData.get("key"), 30);
  const turnOn = formData.get("value") === "on";
  const r = await setStaffSwitch(staff, id, key, turnOn);
  const name = r.ok ? ((await getStaffRow(staff, id))?.name ?? "") : "";
  finish(r, "/staff/admin/staff", `${name} 선생님의 ${SWITCH_WORDS[key] ?? "권한을"} ${turnOn ? "켰어요" : "껐어요"}`);
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
  const id = toInt(formData.get("id"));
  // Back to the class that was open (a new class: the list).
  const back = id === null ? "/staff/admin/classes" : `/staff/admin/classes?class=${id}`;
  finish(await saveClass(staff, id, clean(formData.get("name"), 20), toInt(formData.get("grade"))), back, "저장했어요");
}

export async function classOpAction(formData: FormData) {
  const staff = await requireAdmin();
  const id = toInt(formData.get("id"));
  if (id === null) redirect("/staff/admin/classes");
  const back = `/staff/admin/classes?class=${id}`;
  const op = clean(formData.get("op"), 10);
  if (op === "up" || op === "down") finish(await moveClass(staff, id, op), back);
  if (op === "archive") finish(await archiveClass(staff, id, true), "/staff/admin/classes", "반을 보관했어요");
  if (op === "restore") finish(await archiveClass(staff, id, false), back, "반을 다시 꺼냈어요");
  redirect(back);
}

export async function childrenMoveAction(formData: FormData) {
  const staff = await requireAdmin();
  const ids = formData.getAll("child_ids").map((v) => toInt(v)).filter((n): n is number => n !== null);
  const from = clean(formData.get("from"), 10);
  const back = from ? `/staff/admin/classes?class=${encodeURIComponent(from)}` : "/staff/admin/classes";
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
  // A problem sends the writer back to the page they wrote on.
  const writing = id === null ? `${back}/new` : `${back}/${id}`;
  let image: string | null = null;
  const f = formData.get("photo");
  if (f instanceof File && f.size > 0) {
    try {
      image = await saveUpload(f, "post", { staffId: staff.id });
    } catch (e) {
      finish(fail(e instanceof Error ? e.message : "사진을 올리지 못했어요"), back, undefined, writing);
    }
  }
  const r = await savePost(staff, id, { body: clean(formData.get("body"), 2000), comments_open: on(formData, "comments_open"), image_url: image, removeImage: on(formData, "remove_image") });
  finish(r, back, id === null ? "소식을 올렸어요" : "소식을 고쳤어요", writing);
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
    welcomeBackDrops: n("welcome_back_drops"),
    rotatingPerWeek: n("rotating_per_week"),
  });
  finish(r, "/staff/admin/settings", "설정을 저장했어요");
}

/** "첫 화면 모습": the season and the special time every child's tree screen is dressed for. */
export async function lookSaveAction(formData: FormData) {
  const staff = await requireAdmin();
  const r = await saveLookChoice(staff, { season: clean(formData.get("season"), 20), festival: clean(formData.get("festival"), 20) });
  finish(r, "/staff/admin/look", "첫 화면 모습을 바꿨어요");
}

/** "출석 QR 켜기": gives the attendance mission a QR, so children can check in with the app. */
export async function attendanceQrOnAction() {
  const staff = await requireAdmin();
  finish(await enableAttendanceQr(staff), "/staff/attendance/qr", "출석 QR을 켰어요");
}
