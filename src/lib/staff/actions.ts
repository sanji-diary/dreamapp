"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireStaff, setSession, signOut } from "@/lib/auth";
import { db, one } from "@/lib/db";
import { saveUpload } from "@/lib/uploads";
import { saveAttendance, type AttStatus } from "./attendance";
import { addVisit, createChild, deleteVisit, getChildDetail, proxyComplete, reissueCard, resetPin, setChildActive, setConsent, updateChild, updateVisit, type ChildInput } from "./children";
import { INVITE_COOKIE, STATE_COOKIE, authorizeUrl, devLoginAllowed, kakaoConfigured } from "./kakao";
import { publicOrigin } from "./origin";
import { dismissReports, hideComment, replyWorry, reviewSubmission } from "./review";
import { clean, cleanOrNull, fail, toInt, type Result } from "./util";

/**
 * Server actions for teachers. Each one identifies the teacher from the session cookie and
 * hands over to a function in this folder that re-checks the rules for the target row.
 */

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

/** Sends the browser back with either ?ok=<message> or ?error=<message>. */
function finish(r: Result, path: string, okMessage?: string): never {
  if (!r.ok) redirect(withParam(path, "error", r.error));
  revalidatePath("/staff", "layout");
  redirect(okMessage ? withParam(path, "ok", okMessage) : path);
}

/* ---------- sign-in ---------- */

export async function startKakaoAction(formData: FormData) {
  if (!kakaoConfigured()) redirect("/staff/login?error=config");
  const state = randomBytes(24).toString("base64url");
  const invite = clean(formData.get("invite"), 100);
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  jar.set(STATE_COOKIE, state, opts);
  if (invite) jar.set(INVITE_COOKIE, invite, opts);
  else jar.delete(INVITE_COOKIE);
  redirect(authorizeUrl(await publicOrigin(), state));
}

/** Local development only: pick a teacher from the list. Refused in production or once Kakao keys are set. */
export async function devSignInAction(formData: FormData) {
  if (!devLoginAllowed()) redirect("/staff/login?error=not_invited");
  const id = toInt(formData.get("staff_id"));
  const s = id === null ? null : await one<{ id: number }>(db, "select id from staff where id = $1 and active", [id]);
  if (!s) redirect("/staff/login?error=not_invited");
  await setSession("staff", s.id);
  redirect("/staff");
}

export async function signOutAction() {
  await signOut("staff");
  redirect("/staff/login");
}

/* ---------- attendance ---------- */

export async function markAttendanceAction(childId: number, date: string, status: AttStatus | null, note?: string): Promise<Result> {
  const staff = await requireStaff();
  if (!Number.isInteger(childId) || typeof date !== "string") return fail("잘못된 요청이에요");
  const r = await saveAttendance(staff, childId, date, status, typeof note === "string" ? note : undefined);
  if (r.ok) revalidatePath("/staff", "layout");
  return r;
}

/* ---------- children ---------- */

async function photoFrom(formData: FormData, purpose: "profile" | "post", owner: { childId?: number; staffId?: number }): Promise<Result<{ url: string | null }>> {
  const f = formData.get("photo");
  if (!(f instanceof File) || f.size === 0) return { ok: true, url: null };
  try {
    return { ok: true, url: await saveUpload(f, purpose, owner) };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "사진을 올리지 못했어요");
  }
}

function childInput(formData: FormData): ChildInput {
  const classRaw = formData.get("class_id");
  return {
    name: clean(formData.get("name"), 20),
    class_id: classRaw === null ? undefined : toInt(classRaw),
    birth_date: cleanOrNull(formData.get("birth_date"), 10),
    gender: cleanOrNull(formData.get("gender"), 1),
    school: cleanOrNull(formData.get("school")),
    school_class: cleanOrNull(formData.get("school_class")),
    address: cleanOrNull(formData.get("address")),
    phone: cleanOrNull(formData.get("phone")),
    guardian_phone: cleanOrNull(formData.get("guardian_phone")),
    best_friend_id: toInt(formData.get("best_friend_id")),
    best_friend_name: cleanOrNull(formData.get("best_friend_name")),
    has_phone: formData.get("has_phone") === "on",
    memo: cleanOrNull(formData.get("memo"), 2000),
  };
}

export async function saveChildAction(formData: FormData) {
  const staff = await requireStaff();
  const id = toInt(formData.get("id"));
  const input = childInput(formData);
  if (id === null) {
    if (staff.role !== "admin") redirect("/staff/children");
    const photo = await photoFrom(formData, "profile", { staffId: staff.id });
    if (!photo.ok) finish(photo, "/staff/children/new");
    const r = await createChild(staff, { ...input, photo_url: photo.url });
    if (!r.ok) finish(r, "/staff/children/new");
    finish(r, `/staff/children/${r.id}`, "새 아이를 등록했어요");
  }
  const here = `/staff/children/${id}`;
  // Check access before storing an uploaded file.
  if ((await getChildDetail(staff, id))?.can.edit !== true) redirect("/staff/children");
  const photo = await photoFrom(formData, "profile", { childId: id, staffId: staff.id });
  if (!photo.ok) finish(photo, `${here}/edit`);
  const r = await updateChild(staff, id, { ...input, photo_url: photo.url });
  if (!r.ok) finish(r, `${here}/edit`);
  finish(r, here, "저장했어요");
}

export async function childOpAction(formData: FormData) {
  const staff = await requireStaff();
  const id = toInt(formData.get("id"));
  if (id === null) redirect("/staff/children");
  const here = `/staff/children/${id}`;
  const op = clean(formData.get("op"), 20);
  if (op === "reset_pin") finish(await resetPin(staff, id), here, "비밀번호를 지웠어요. 카드를 다시 찍으면 새로 정할 수 있어요");
  if (op === "reissue") finish(await reissueCard(staff, id), here, "새 카드를 만들었어요. QR 카드 화면에서 인쇄해 주세요");
  if (op === "deactivate") finish(await setChildActive(staff, id, false), here, "명단에서 뺐어요");
  if (op === "reactivate") finish(await setChildActive(staff, id, true), here, "다시 명단에 넣었어요");
  if (op === "consent") {
    finish(await setConsent(staff, id, cleanOrNull(formData.get("consent_on"), 10), formData.get("photo_consent") === "on"), here, "동의 내용을 저장했어요");
  }
  redirect(here);
}

/* ---------- visit notes ---------- */

export async function visitAction(formData: FormData) {
  const staff = await requireStaff();
  const childId = toInt(formData.get("child_id"));
  if (childId === null) redirect("/staff/children");
  const here = `/staff/children/${childId}?tab=visits`;
  const op = clean(formData.get("op"), 10);
  const input = { visited_on: clean(formData.get("visited_on"), 10), method: clean(formData.get("method"), 12), content: clean(formData.get("content"), 4000) };
  const visitId = toInt(formData.get("visit_id"));
  if (op === "add") finish(await addVisit(staff, childId, input), here, "심방일지를 적었어요");
  if (visitId === null) redirect(here);
  if (op === "update") finish(await updateVisit(staff, visitId, input), here, "심방일지를 고쳤어요");
  if (op === "delete") finish(await deleteVisit(staff, visitId), here, "심방일지를 지웠어요");
  redirect(here);
}

/* ---------- missions entered for a child ---------- */

export async function proxyMissionAction(formData: FormData) {
  const staff = await requireStaff();
  const childId = toInt(formData.get("child_id"));
  const missionId = toInt(formData.get("mission_id"));
  if (childId === null || missionId === null) redirect("/staff/children");
  const r = await proxyComplete(staff, childId, missionId);
  finish(r, `/staff/children/${childId}?tab=activity`, r.ok ? `대신 입력했어요 · 물방울 ${r.drops}개, ${r.points}P` : undefined);
}

/* ---------- approvals and comments ---------- */

export async function reviewAction(formData: FormData) {
  const staff = await requireStaff();
  const id = toInt(formData.get("id"));
  // The filter chip that was on (?f=) stays on after the review.
  const f = formData.get("f");
  const back = f === "photo" || f === "text" || f === "mine" ? `/staff/approvals?f=${f}` : "/staff/approvals";
  if (id === null) redirect(back);
  const approve = formData.get("decision") === "approve";
  finish(await reviewSubmission(staff, id, approve), back, approve ? "미션을 확인했어요" : "미션을 돌려보냈어요. 아이가 다시 할 수 있어요");
}

export async function commentAction(formData: FormData) {
  const staff = await requireStaff();
  const id = toInt(formData.get("id"));
  // Back to the 댓글 part of 할 일 (teachers who also check missions would otherwise land on the mission list).
  const back = formData.get("back") === "posts" && staff.role === "admin" ? "/staff/admin/posts" : "/staff/approvals?tab=comments";
  if (id === null) redirect(back);
  if (formData.get("decision") === "hide") finish(await hideComment(staff, id), back, "댓글을 지웠어요");
  finish(await dismissReports(staff, id), back, "댓글을 그대로 두었어요");
}

/* ---------- worries ---------- */

export async function replyWorryAction(formData: FormData) {
  const staff = await requireStaff();
  const id = toInt(formData.get("id"));
  if (id === null) redirect("/staff/worries");
  finish(await replyWorry(staff, id, clean(formData.get("content"), 2000)), `/staff/worries/${id}`, "답장을 보냈어요");
}
