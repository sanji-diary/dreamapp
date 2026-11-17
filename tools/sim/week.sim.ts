import fs from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";

/**
 * One week of the app with made-up people: 30 children, 10 teachers and 1 admin.
 *
 * Everything is done through the same library functions the screens call (never by writing rows
 * directly, except the very first admin, who in production comes from ADMIN_INVITE_CODE), with the
 * clock moved from day to day. The result is kept in .data/sim-week so the local server can show it
 * (see tools/sim/README.md), and what happened is written to tools/sim/out/week.json.
 *
 * Run from the project root:  npx vitest run --config tools/sim/vitest.config.mts
 */

const DATA = path.join(process.cwd(), ".data", "sim-week");
const OUT = path.join(process.cwd(), "tools", "sim", "out");
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
process.env.PGLITE_DIR = DATA;
process.env.DREAM_SEED = "off";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {}, notFound: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { kidLogin } from "@/lib/auth";
import { ROLE_PRESETS } from "@/lib/authz";
import { db, one } from "@/lib/db";
import { completeMission, dropBalance, getSettings, missionsForChild, pointBalance, waterTree } from "@/lib/game";
import { addComment, reportComment } from "@/lib/kid/feed";
import { issueGameToken, winGame } from "@/lib/kid/game-proof";
import { saveNewPin, saveOnboarding, selfRegister } from "@/lib/kid/onboarding";
import { scanQr } from "@/lib/kid/qr";
import { answerQuiz, startQuiz } from "@/lib/kid/quiz";
import { submitVerse } from "@/lib/kid/verse";
import { submitWorry } from "@/lib/kid/worries";
import { ensureJoinCode } from "@/lib/self-join";
import { adjustPoints, moveChildren, saveClass, saveNotice, savePost, saveSettings, saveWorship, setSelfJoin } from "@/lib/staff/admin-misc";
import { copyWeek, saveMission, defaultMissionInput, weeklyDropCheck, weekMissions, missionStats } from "@/lib/staff/admin-missions";
import { createDefaultFixedMissions, resetWeekRotation, saveWeekVerses, setWeekRotation, weekPlan } from "@/lib/staff/admin-plan";
import { createStaff, updateStaff } from "@/lib/staff/admin-staff";
import { saveAttendance, uncheckedCount } from "@/lib/staff/attendance";
import { addVisit, createChild, longAbsent, proxyComplete, proxyWater, resetPin } from "@/lib/staff/children";
import { homeData } from "@/lib/staff/home";
import { dismissReports, listWorries, openWorry, pendingCompletions, replyWorry, reportedComments, reviewSubmission, todoCounts } from "@/lib/staff/review";
import { addDays } from "@/lib/time";
import type { Role, Staff } from "@/lib/types";

/* ---------- the clock ---------- */

const SETUP = "2026-10-25"; // Sunday three weeks before: the admin sets the app up
const W1 = "2026-11-01";
const W2 = "2026-11-08";
const WEEK = "2026-11-15"; // the week that is played in full
const NEXT = addDays(WEEK, 7);
const DAY_NAMES = ["주일", "월", "화", "수", "목", "금", "토"];
let now = { date: SETUP, time: "09:00" };
function at(date: string, time = "10:00") {
  now = { date, time };
  vi.setSystemTime(new Date(`${date}T${time}:00+09:00`));
}

/* ---------- the record ---------- */

interface Event {
  date: string;
  time: string;
  who: string;
  what: string;
  result?: string;
}
interface Finding {
  kind: "error" | "difficulty" | "note";
  title: string;
  detail: string;
}
const events: Event[] = [];
const findings: Finding[] = [];
const checks: { ok: boolean; title: string; detail: string }[] = [];
const ev = (who: string, what: string, result?: string) => events.push({ ...now, who, what, result });
const find = (kind: Finding["kind"], title: string, detail: string) => findings.push({ kind, title, detail });
/** Something the rules promise. A broken promise is recorded as an error and the walk goes on. */
function check(ok: boolean, title: string, detail = "") {
  checks.push({ ok, title, detail });
  if (!ok) find("error", title, detail);
}
const say = (r: { ok: boolean; error?: string; reason?: string }) => (r.ok ? "됨" : `안 됨: ${r.error ?? r.reason ?? ""}`);

/* ---------- people ---------- */

async function loadStaff(id: number): Promise<Staff> {
  const rows = await db.query<Omit<Staff, "class_ids">>("select id, name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries, active from staff where id = $1", [id]);
  const cls = await db.query<{ class_id: number }>("select class_id from staff_classes where staff_id = $1 order by class_id", [id]);
  return { ...rows[0], class_ids: cls.map((c) => c.class_id) };
}

const CLASSES: [string, number][] = [
  ["4학년 1반", 4],
  ["4학년 2반", 4],
  ["5학년 1반", 5],
  ["5학년 2반", 5],
  ["6학년 1반", 6],
  ["6학년 2반", 6],
];
/** name, role, the classes (by index) they are given */
const TEACHERS: [string, Role, number[]][] = [
  ["한기쁨", "head", []],
  ["김은혜", "homeroom", [0]],
  ["이성민", "homeroom", [1]],
  ["박지현", "homeroom", [2]],
  ["최다니엘", "homeroom", [3]],
  ["정한나", "homeroom", [4]],
  ["강요셉", "homeroom", [5]],
  ["윤사라", "homeroom", [4]], // a second homeroom teacher for 6학년 1반
  ["오믿음", "basic", []],
  ["유소망", "basic", []],
];
const KID_NAMES = [
  "김하준", "이서윤", "박도윤", "최지우", "정시우", // 4-1
  "강하은", "조민준", "윤서연", "장예준", "임수아", // 4-2
  "한지호", "오지안", "서유준", "신하린", "권건우", // 5-1
  "황채원", "안선우", "송다은", "류현우", "전소율", // 5-2
  "홍주원", "고아린", "문은우", // 6-1 (two more join by themselves)
  "양시아", "손태윤", "배나은", // 6-2 (two more join by themselves and are placed by the admin)
  "백로운", "허예린", "남도현", "심유나", // the four who join with the shared QR
];
type Persona = "eager" | "steady" | "light" | "sunday" | "nophone" | "idle";
const PERSONA: Record<Persona, number[]> = {
  eager: [0, 3, 6, 9, 11, 15, 20, 26],
  steady: [1, 2, 7, 8, 12, 13, 16, 17, 21, 27],
  light: [4, 10, 14, 18, 22, 28],
  sunday: [5, 23],
  nophone: [19, 24],
  idle: [25, 29],
};
const PERSONA_KO: Record<Persona, string> = { eager: "열심히 하는 아이", steady: "꾸준한 아이", light: "가끔 하는 아이", sunday: "주일만 오는 아이", nophone: "휴대폰 없는 아이", idle: "안 하는 아이" };
const personaOf = (i: number) => (Object.keys(PERSONA) as Persona[]).find((p) => PERSONA[p].includes(i))!;
const CLASS_OF = (i: number) => (i < 20 ? Math.floor(i / 5) : i < 23 ? 4 : i < 26 ? 5 : i < 28 ? 4 : 5);
/** Attendance on the three Sundays: p present, l late, a absent, - not marked. Default is present. */
const ATTEND: Record<number, [string, string, string]> = {
  4: ["a", "a", "p"], // back after two Sundays away: welcome-back drops
  12: ["a", "a", "p"],
  22: ["a", "-", "l"], // absent, then simply not marked, then late
  25: ["a", "a", "a"], // away three Sundays
  8: ["p", "p", "l"],
  17: ["p", "a", "l"],
  14: ["p", "p", "a"],
  28: ["-", "-", "a"],
  29: ["-", "-", "a"],
  26: ["-", "-", "p"],
  27: ["-", "-", "p"],
};
const STATUS: Record<string, "present" | "late" | "absent" | null> = { p: "present", l: "late", a: "absent", "-": null };

interface Kid {
  i: number;
  id: number;
  name: string;
  persona: Persona;
  cls: number;
  token: string;
  joined: boolean;
}

/* The verses are made-up sentences, not a Bible translation. */
const VERSES = [
  { n: "1", text: "하나님은 우리를 사랑하세요. 오늘도 함께하세요." },
  { n: "2", text: "서로 사랑하고, 감사하는 마음으로 살아요!" },
];

it("plays one week with 30 children, 10 teachers and an admin", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });

  /* ================= 10월 25일: 관리자가 앱을 준비한다 ================= */
  at(SETUP, "14:00");
  // The first admin: in production this row is made from ADMIN_INVITE_CODE the first time the server starts.
  const adminRow = await db.query<{ id: number }>(
    "insert into staff (name, role, can_attendance, can_visits, can_approve, can_view_all, can_read_pastor_worries) values ('김인성','admin',true,true,true,true,true) returning id",
  );
  const admin = await loadStaff(adminRow[0].id);
  ev("관리자 김인성", "처음 로그인 (초대 코드로 만들어진 관리자 계정)");

  const dbNow = await one<{ d: string }>(db, "select (now() at time zone 'Asia/Seoul')::date::text as d");
  check(dbNow?.d === SETUP, "진행용 시계가 데이터베이스 시각에도 적용됨", `데이터베이스 날짜 ${dbNow?.d}, 기대 ${SETUP}`);

  for (const [name, grade] of CLASSES) {
    const r = await saveClass(admin, null, name, grade);
    check(r.ok, `반 만들기: ${name}`, say(r));
  }
  const classRows = await db.query<{ id: number; name: string }>("select id, name from classes order by sort");
  const classId = (idx: number) => classRows[idx].id;
  ev("관리자 김인성", `반 편성에서 반 ${classRows.length}개 만들기`, classRows.map((c) => c.name).join(", "));

  const staff: Staff[] = [];
  for (const [name, role, cls] of TEACHERS) {
    const r = await createStaff(admin, name, role);
    if (!r.ok) {
      check(false, `교사 추가: ${name}`, say(r));
      continue;
    }
    if (cls.length > 0) {
      const u = await updateStaff(admin, r.id, { role, class_ids: cls.map(classId), active: true });
      check(u.ok, `교사 반 배정: ${name}`, say(u));
    }
    staff.push(await loadStaff(r.id));
  }
  const T = (name: string) => staff.find((s) => s.name === name)!;
  const homeroomOf = (cls: number) => staff.find((s) => s.role === "homeroom" && s.class_ids.includes(classId(cls)))!;
  ev("관리자 김인성", "교사·권한에서 교사 10명 추가하고 초대 링크 보내기", "부장 1명, 담임 7명(6학년 1반은 2명), 기본 2명");
  const invites = await one<{ n: number }>(db, "select count(*)::int as n from staff where invite_code is not null and kakao_id is null");
  ev("교사 10명", "카카오로 첫 로그인", `진행에서는 건너뜀: 카카오 로그인은 실제 카카오 계정이 있어야 해서 따라 해 볼 수 없어요 (초대 대기 ${invites?.n ?? "?"}명)`);
  find("note", "카카오 로그인은 진행에서 빠짐", "교사 10명의 초대 링크는 만들어졌지만, 카카오로 처음 로그인하는 단계는 실제 카카오 계정이 필요해서 확인하지 못했어요. 실제 선생님 한두 분과 먼저 해 보시는 게 좋아요.");

  // 26 children are entered by the admin (name and class); the other 4 join later with the shared QR.
  const kids: Kid[] = [];
  for (let i = 0; i < 26; i++) {
    const persona = personaOf(i);
    const r = await createChild(admin, { name: KID_NAMES[i], class_id: classId(CLASS_OF(i)), has_phone: persona !== "nophone" });
    if (!r.ok) {
      check(false, `아이 등록: ${KID_NAMES[i]}`, say(r));
      continue;
    }
    const row = await one<{ qr_token: string }>(db, "select qr_token from children where id = $1", [r.id]);
    kids.push({ i, id: r.id, name: KID_NAMES[i], persona, cls: CLASS_OF(i), token: row!.qr_token, joined: false });
  }
  ev("관리자 김인성", "교적부에 아이 26명 등록 (이름과 반)", "QR 카드를 인쇄해서 나눠 줌");

  const settings = await saveSettings(admin, { weeklyDropCap: 12, levelNeeds: [2, 4, 6, 8, 10, 10], classGoal: 30, harvestBonusPoints: 50, welcomeBackDrops: 2, rotatingPerWeek: 3 });
  check(settings.ok, "설정 저장", say(settings));
  const fixed = await createDefaultFixedMissions(admin);
  check(fixed.ok && fixed.created === 4, "고정 미션 4개 만들기", fixed.ok ? `${fixed.created}개` : say(fixed));
  const again = await createDefaultFixedMissions(admin);
  check(again.ok && again.created === 0, "고정 미션 만들기를 두 번 눌러도 늘지 않음", again.ok ? `${again.created}개 더 생김` : say(again));
  ev("관리자 김인성", "미션 화면에서 ‘고정 미션 4개 만들기’", "주일 예배 출석, 이번 주 말씀 쓰기, 가정예배 드리기, 오늘의 말씀 읽기");
  const fixedRows = await db.query<{ id: number; kind: string; repeat: string }>("select id, kind, repeat from missions where mode = 'fixed' order by id");
  const M = {
    attendance: fixedRows.find((m) => m.kind === "attendance")!.id,
    verse: fixedRows.find((m) => m.kind === "verse")!.id,
    photo: fixedRows.find((m) => m.kind === "photo")!.id,
    daily: fixedRows.find((m) => m.kind === "self" && m.repeat === "daily")!.id,
    worry: 0,
    comment: 0,
    teacher: 0,
    pray: 0,
    hello: 0,
    poolQuiz: 0,
    text: 0,
    quiz: 0,
    game: 0,
    qr: 0,
  };

  // The children scan their cards during the week and make a PIN. Two have no phone; one never gets round to it.
  at(addDays(SETUP, 2), "19:00");
  for (const k of kids) {
    if (k.persona === "nophone" || k.i === 25) continue;
    const r = await saveOnboarding(k.token, { name: k.name, gender: k.i % 2 === 0 ? "M" : "F", birthYear: 2026 - (9 + [4, 4, 5, 5, 6, 6][k.cls] - 3), school: "꿈나무초등학교", classId: null, pin: "1234", pin2: "1234" });
    k.joined = r.ok;
    check(r.ok, `QR 카드로 가입: ${k.name}`, r.ok ? "" : `${r.reason} ${JSON.stringify("errors" in r ? r.errors : "")}`);
  }
  ev("아이 23명", "QR 카드를 찍고 비밀번호 4자리 만들기", `${kids.filter((k) => k.joined).length}명 가입, 휴대폰 없는 2명과 배나은은 아직`);

  /* ================= 11월 1일, 8일: 출석만 부른 두 주 ================= */
  const callRoll = async (sunday: string, col: 0 | 1 | 2, skipClass: number | null) => {
    let marked = 0;
    for (const k of kids) {
      if (k.cls === skipClass) continue;
      const code = (ATTEND[k.i] ?? ["p", "p", "p"])[col];
      const status = STATUS[code];
      if (status === null) continue;
      const r = await saveAttendance(homeroomOf(k.cls), k.id, sunday, status);
      check(r.ok, `출석 저장: ${k.name} ${sunday}`, say(r));
      marked++;
    }
    return marked;
  };
  at(W1, "11:30");
  ev("담임 교사들", "주일 출석 체크", `${await callRoll(W1, 0, null)}명 표시`);
  at(W2, "11:30");
  ev("담임 교사들", "주일 출석 체크", `${await callRoll(W2, 1, null)}명 표시`);

  // Four children join with the shared QR on the wall. Two know their class; two answer "모르겠어요".
  at(addDays(W2, 2), "18:00");
  const on = await setSelfJoin(admin, true);
  check(on.ok, "함께 쓰는 가입 QR 켜기", say(on));
  const joinCode = await ensureJoinCode();
  for (let i = 26; i < 30; i++) {
    const cls = CLASS_OF(i);
    const knows = i < 28;
    const r = await selfRegister(joinCode, { name: KID_NAMES[i], gender: i % 2 === 0 ? "M" : "F", birthYear: 2014, school: "꿈나무초등학교", classId: knows ? classId(cls) : null, pin: "1234", pin2: "1234" });
    if (!r.ok) {
      check(false, `가입 QR로 가입: ${KID_NAMES[i]}`, `${r.reason}`);
      continue;
    }
    kids.push({ i, id: r.childId, name: KID_NAMES[i], persona: personaOf(i), cls, token: r.token, joined: true });
  }
  ev("아이 4명", "교회에 붙은 가입 QR로 스스로 가입", "백로운·허예린은 반을 골랐고, 남도현·심유나는 ‘모르겠어요’를 골랐어요");
  const loose = kids.filter((k) => k.i >= 28);
  const moved = await moveChildren(admin, loose.map((k) => k.id), classId(5));
  check(moved.ok && moved.moved === 2, "반을 모르는 아이 2명을 관리자가 6학년 2반에 넣음", moved.ok ? `${moved.moved}명 옮김` : say(moved));
  ev("관리자 김인성", "새로 가입한 아이 2명을 6학년 2반으로 배정", say(moved));
  const K = (i: number) => kids.find((k) => k.i === i)!;

  /* ================= 11월 14일 토요일: 관리자가 다음 주를 준비한다 ================= */
  at(addDays(WEEK, -1), "20:00");
  const mk = async (title: string, more: Partial<ReturnType<typeof defaultMissionInput>>, week = WEEK) => {
    const r = await saveMission(admin, null, { ...defaultMissionInput(week), title, ...more });
    check(r.ok, `미션 만들기: ${title}`, say(r));
    return r.ok ? r.id : 0;
  };
  M.worry = await mk("내 고민 적기", { mode: "pool", kind: "worry", drops: 1, points: 10, icon: "bubble", description: "선생님이나 전도사님께 고민을 적어요" });
  M.comment = await mk("숲 소식에 댓글 달기", { mode: "pool", kind: "comment", drops: 1, points: 5, icon: "bubble", description: "숲 소식에 댓글을 남겨요" });
  M.teacher = await mk("성경 암송 확인받기", { mode: "pool", kind: "teacher", drops: 2, points: 20, icon: "bible", description: "선생님 앞에서 외워요" });
  M.pray = await mk("가족을 위해 기도하기", { mode: "pool", kind: "self", drops: 1, points: 5, icon: "pray" });
  M.hello = await mk("친구에게 먼저 인사하기", { mode: "pool", kind: "self", drops: 1, points: 5, icon: "badge" });
  M.poolQuiz = await mk("성경 인물 퀴즈", {
    mode: "pool",
    kind: "quiz",
    drops: 2,
    points: 10,
    icon: "bible",
    quiz: [
      { q: "방주를 만든 사람은 누구일까요?", choices: ["노아", "모세", "다윗"], answer: 0 },
      { q: "골리앗과 싸운 사람은 누구일까요?", choices: ["요셉", "다윗", "엘리야"], answer: 1 },
    ],
    quiz_pass: 2,
  });
  ev("관리자 김인성", "미션 화면 ‘+ 보관함에 추가’로 순환 미션 6개 만들기", "한 주에 3개씩 자동으로 나옴");

  M.text = await mk("감사한 일 한 가지 적기", { kind: "text", drops: 1, points: 10, icon: "pouch", is_challenge: true, description: "이번 주 감사한 일을 적어요" });
  M.quiz = await mk("이번 주 설교 퀴즈", {
    kind: "quiz",
    drops: 0,
    points: 10,
    icon: "bible",
    quiz: [
      { q: "이번 주 설교 제목은 무엇이었나요?", choices: ["서로 사랑해요", "용기를 내요", "감사해요"], answer: 0 },
      { q: "말씀은 어디에 있었나요?", choices: ["시편", "요한복음", "창세기"], answer: 1 },
      { q: "이번 주에 하기로 한 일은?", choices: ["친구에게 인사하기", "늦잠 자기", "숙제 미루기"], answer: 0 },
    ],
    quiz_pass: 2,
  });
  M.game = await mk("짝 맞추기 게임", { kind: "game", drops: 0, points: 5, icon: "badge", game_id: "memory" });
  ev("관리자 김인성", "기간 미션 3개 만들기", "감사한 일 적기(도전, 물방울 1), 설교 퀴즈(포인트만 10P), 짝 맞추기 게임(포인트만 5P)");

  const verses = await saveWeekVerses(admin, M.verse, WEEK, { ref: "[예시] 사랑의 말씀 1-2절", verses: VERSES });
  check(verses.ok, "이번 주 말씀 저장", say(verses));
  ev("관리자 김인성", "주별 말씀에서 11월 3주차 말씀 2절 넣기", "붙여넣기 도우미로 나눈 뒤 저장");

  for (const body of ["[예시] 이번 주일에는 가을 소풍 사진을 함께 봐요. 기대되는 사람?", "[예시] 4학년 친구들이 만든 감사 나무예요. 어떤 감사가 제일 마음에 드나요?"]) {
    const r = await savePost(admin, null, { body, comments_open: true });
    check(r.ok, "숲 소식 올리기", say(r));
  }
  const posts = await db.query<{ id: number }>("select id from posts order by id");
  const worship = await saveWorship(admin, { date: WEEK, time_place: "오전 11시 · 소년부실", sermon_title: "[예시] 서로 사랑해요", scripture: "[예시] 사랑의 말씀 1-2절", preacher: "김인성 전도사", memory_verse: VERSES[0].text, items: [{ title: "찬양", detail: "다 함께" }, { title: "말씀", detail: "김인성 전도사" }] });
  check(worship.ok, "예배 순서 저장", say(worship));
  const notice = await saveNotice(admin, null, { title: "[예시] 달란트 잔치 안내", body: "12월 셋째 주일에 달란트 잔치가 있어요.", important: true, staff_only: false, event_date: "2026-12-20" });
  check(notice.ok, "공지 올리기", say(notice));
  ev("관리자 김인성", "숲 소식 2개, 예배 순서, 공지 1개 올리기");

  const preview = await weekPlan(admin, WEEK);
  ev("관리자 김인성", "미션 화면에서 11월 3주차 미리보기 확인", `순환 미션 미리보기: ${preview?.rotating.map((m) => m.title).join(", ")}`);
  const before = await weeklyDropCheck(admin, WEEK);
  check(before !== null && !before.over && !before.under, "한 주 물방울 합계가 한도 12개와 딱 맞음", JSON.stringify(before?.classes));

  /* ================= 11월 15일 주일 ================= */
  const weekDrops = async (id: number) => (await one<{ n: number }>(db, "select coalesce(sum(delta),0)::int as n from drop_ledger where child_id = $1 and week_start = $2 and ref_type = 'mission'", [id, WEEK]))?.n ?? 0;
  const pending = new Map<number, string[]>(); // class index -> titles waiting, for the story
  const daily = async (k: Kid, date: string) => {
    const r = await completeMission(k.id, M.daily, { date });
    return r.ok;
  };
  const verse = async (k: Kid, date: string, typo: boolean) => {
    if (typo) {
      const wrong = await submitVerse(k.id, M.verse, 0, VERSES[0].text.replace("사랑하세요.", "사랑하세요"), date);
      check(!wrong.ok && wrong.reason === "mismatch", `말씀 쓰기: 마침표를 빼면 통과하지 않음 (${k.name})`, JSON.stringify(wrong));
    }
    const a = await submitVerse(k.id, M.verse, 0, VERSES[0].text, date);
    const b = await submitVerse(k.id, M.verse, 1, VERSES[1].text, date);
    return a.ok && b.ok && b.finished;
  };
  const photo = async (k: Kid, date: string) => {
    const r = await completeMission(k.id, M.photo, { date, photoUrl: "/img/icon-house.webp" });
    if (r.ok && r.status === "pending") pending.set(k.cls, [...(pending.get(k.cls) ?? []), "가정예배"]);
    return r;
  };
  const water = async (k: Kid, limit = 99) => {
    let n = 0;
    while (n < limit) {
      const r = await waterTree(k.id);
      if (!r.ok) break;
      n++;
    }
    return n;
  };
  const group = (p: Persona) => kids.filter((k) => k.persona === p && k.joined);

  at(WEEK, "09:00");
  const stored = await weekPlan(admin, WEEK);
  check(stored?.stored === true && stored.manual === false && stored.rotating.length === 3, "이번 주 순환 미션 3개가 자동으로 정해짐", stored?.rotating.map((m) => m.title).join(", ") ?? "");
  ev("앱", "11월 3주차 순환 미션이 자동으로 정해짐", stored?.rotating.map((m) => m.title).join(", "));

  at(WEEK, "11:20");
  const rollMarked = await callRoll(WEEK, 2, 5); // 6학년 2반 담임은 깜빡함
  ev("담임 교사 5명", "주일 출석 체크 (6학년 2반은 담임이 깜빡함)", `${rollMarked}명 표시`);
  // Kid 13 is marked present by mistake (she was not there); her teacher fixes it on Thursday.
  ev("박지현 선생님", "신하린을 실수로 ‘출석’으로 표시", "목요일에 고칠 예정");

  const cross = await saveAttendance(homeroomOf(0), K(10).id, WEEK, "present");
  check(!cross.ok, "담임은 다른 반 아이의 출석을 바꿀 수 없음", say(cross));
  const basicTry = await saveAttendance(T("오믿음"), K(0).id, WEEK, "present");
  check(!basicTry.ok, "기본 교사는 출석을 표시할 수 없음", say(basicTry));
  ev("김은혜 선생님", "다른 반(5학년 1반) 아이 출석을 눌러 봄", say(cross));
  ev("오믿음 선생님(기본)", "출석을 눌러 봄", say(basicTry));

  // Welcome-back drops for the three who missed the two Sundays before.
  for (const i of [4, 12]) {
    const held = (await one<{ n: number }>(db, "select coalesce(sum(delta),0)::int as n from drop_ledger where child_id = $1 and ref_type = 'welcome'", [K(i).id]))?.n ?? 0;
    check(held === 2, `반가워 물방울 2개: ${K(i).name}`, `받은 것 ${held}개`);
  }
  const held22 = (await one<{ n: number }>(db, "select coalesce(sum(delta),0)::int as n from drop_ledger where child_id = $1 and ref_type = 'welcome'", [K(22).id]))?.n ?? 0;
  check(held22 === 2, "반가워 물방울: 한 주는 결석, 한 주는 표시 없음이었다가 지각으로 온 문은우도 받음", `받은 것 ${held22}개`);
  ev("앱", "두 주일을 빠졌다가 온 정시우·서유준·문은우에게 반가워 물방울 2개씩", "주간 한도와 따로 계산");
  const noWelcome = (await one<{ n: number }>(db, "select count(*)::int as n from drop_ledger where ref_type = 'welcome' and child_id <> all($1::int[])", [[K(4).id, K(12).id, K(22).id]]))?.n ?? 0;
  check(noWelcome === 0, "다른 아이는 반가워 물방울을 받지 않음", `${noWelcome}건`);

  // Children without a phone: the teacher enters what they did in class.
  for (const k of kids.filter((x) => x.persona === "nophone")) {
    const t = homeroomOf(k.cls);
    const a = await proxyComplete(t, k.id, M.verse);
    const b = await proxyComplete(t, k.id, M.daily);
    check(a.ok && b.ok, `대신 입력: ${k.name}`, `${say(a)} / ${say(b)}`);
    ev(`${t.name} 선생님`, `휴대폰 없는 ${k.name} 대신 말씀 쓰기와 말씀 읽기 입력`, `${say(a)}, ${say(b)}`);
    const w = await proxyWater(t, k.id);
    check(w.ok && (await dropBalance(db, k.id)) === 0, `대신 물 주기: ${k.name}`, w.ok ? `${w.given}개` : say(w));
    ev(`${t.name} 선생님`, `아이 정보에서 ${k.name}의 물방울을 대신 나무에 줌`, w.ok ? `${w.given}개 줌, ${w.level}단계` : say(w));
  }
  const phoneKid = await proxyWater(homeroomOf(0), K(0).id);
  check(!phoneKid.ok, "휴대폰이 있는 아이의 나무에는 선생님이 대신 물을 줄 수 없음", say(phoneKid));

  at(WEEK, "13:00");
  const adj = await adjustPoints(admin, K(0).id, 10, "예배 도우미");
  check(adj.ok, "포인트 조정 +10", say(adj));
  ev("관리자 김인성", "김하준에게 예배 도우미 포인트 10P 주기", say(adj));

  at(WEEK, "15:00");
  for (const k of group("eager")) {
    await daily(k, WEEK);
    const v = await verse(k, WEEK, k.i === 3);
    check(v, `말씀 쓰기 완료: ${k.name}`);
    await photo(k, WEEK);
    await water(k);
  }
  for (const k of group("steady")) await daily(k, WEEK);
  ev("열심히 하는 아이 8명", "말씀 읽기, 말씀 쓰기, 가정예배 사진 올리기, 나무에 물 주기", "사진은 선생님 확인을 기다림");
  ev("꾸준한 아이 10명", "오늘의 말씀 읽기");

  at(WEEK, "20:00");
  const unchecked = await uncheckedCount(T("한기쁨"), WEEK);
  ev("한기쁨 부장", "홈 화면에서 출석 안 한 아이 수 확인", `${unchecked}명 남음 (6학년 2반)`);

  /* ================= 월요일 ================= */
  const MON = addDays(WEEK, 1);
  at(MON, "08:30");
  // The head teacher takes 6학년 2반's roll for Sunday, a day late.
  let late = 0;
  for (const k of kids.filter((x) => x.cls === 5)) {
    const status = STATUS[(ATTEND[k.i] ?? ["p", "p", "p"])[2]];
    if (status === null) continue;
    const r = await saveAttendance(T("한기쁨"), k.id, WEEK, status);
    check(r.ok, `하루 늦은 출석 입력: ${k.name}`, say(r));
    late++;
  }
  ev("한기쁨 부장", "6학년 2반 주일 출석을 월요일에 대신 입력", `${late}명 표시 (주일 날짜로 저장됨)`);
  const weekday = await saveAttendance(T("한기쁨"), K(0).id, MON, "present");
  check(!weekday.ok, "평일 날짜로는 출석을 저장할 수 없음", say(weekday));
  ev("한기쁨 부장", "월요일 날짜로 출석을 눌러 봄", say(weekday));

  at(MON, "12:10");
  const review = async (t: Staff, decide: (item: { child_name: string; title: string }) => boolean) => {
    const list = await pendingCompletions(t);
    let yes = 0;
    let no = 0;
    for (const p of list) {
      const approve = decide(p);
      const r = await reviewSubmission(t, p.id, approve);
      check(r.ok, `미션 확인: ${p.child_name} ${p.title}`, say(r));
      if (approve) yes++;
      else no++;
    }
    return { yes, no };
  };
  // 5학년 2반's teacher (최다니엘) does not open the to-do list this week; 6학년 2반 has nothing waiting.
  for (const cls of [0, 1, 2, 4]) {
    const t = homeroomOf(cls);
    // 조민준's photo is too dark to see: sent back once.
    const r = await review(t, (p) => !(p.child_name === "조민준" && p.title === "가정예배 드리기"));
    if (r.yes + r.no > 0) ev(`${t.name} 선생님`, "할 일에서 미션 확인", `확인 ${r.yes}건, 돌려보냄 ${r.no}건`);
  }
  const basicReview = await pendingCompletions(T("유소망"));
  check(basicReview.length === 0, "기본 교사의 할 일에는 확인할 미션이 뜨지 않음", `${basicReview.length}건`);

  at(MON, "17:00");
  for (const k of group("eager")) {
    await daily(k, MON);
    const w = await submitWorry(k.id, `[예시] ${k.name}의 고민: 친구와 다퉜어요.`, k.i % 3 === 0 ? "pastor" : k.i % 3 === 1 ? "teacher" : "both");
    check(w.ok, `고민 적기: ${k.name}`, w.ok ? "" : w.reason);
    const c = await addComment(k.id, posts[0].id, "[예시] 저도 기대돼요!");
    check(c.ok, `댓글 달기: ${k.name}`, c.ok ? "" : c.reason);
    const t = await completeMission(k.id, M.text, { date: MON, text: "[예시] 가족과 저녁을 먹어서 감사해요." });
    check(t.ok, `감사한 일 적기: ${k.name}`, t.ok ? "" : t.reason);
    await water(k);
  }
  ev("열심히 하는 아이 8명", "말씀 읽기, 고민 적기, 숲 소식 댓글, 감사한 일 적기, 물 주기");
  const twice = await completeMission(K(0).id, M.text, { date: MON, text: "[예시] 한 번 더" });
  check(!twice.ok && twice.reason === "already_done", "같은 미션을 한 주에 두 번 할 수 없음", JSON.stringify(twice));
  const dailyTwice = await completeMission(K(0).id, M.daily, { date: MON });
  check(!dailyTwice.ok, "매일 미션을 하루에 두 번 할 수 없음", JSON.stringify(dailyTwice));
  const resting = await completeMission(K(0).id, M.pray, { date: MON });
  check(!resting.ok, "이번 주에 쉬는 순환 미션은 할 수 없음", JSON.stringify(resting));
  ev("김하준", "같은 미션을 한 번 더 하려 함, 쉬는 순환 미션을 하려 함", "둘 다 안 됨");
  for (const k of group("steady")) {
    const v = await verse(k, MON, k.i === 7 || k.i === 16);
    check(v, `말씀 쓰기 완료: ${k.name}`);
  }
  ev("꾸준한 아이 10명", "말씀 쓰기", "윤서연·안선우는 마침표를 빼서 한 번 틀린 뒤 다시 써서 통과");

  /* ================= 화요일 ================= */
  const TUE = addDays(WEEK, 2);
  at(TUE, "16:30");
  for (const k of group("eager")) {
    await daily(k, TUE);
    const r = await completeMission(k.id, M.teacher, { date: TUE });
    check(r.ok && r.status === "pending", `암송 확인 요청: ${k.name}`, r.ok ? r.status : r.reason);
    // The sermon quiz: 최지우 misses two the first time and tries again.
    const s = await startQuiz(k.id, M.quiz, TUE);
    if (!s.ok) {
      check(false, `퀴즈 시작: ${k.name}`, s.reason);
      continue;
    }
    const answers = k.i === 3 ? [1, 0, 1] : [0, 1, 0];
    let last: Awaited<ReturnType<typeof answerQuiz>> | null = null;
    for (let q = 0; q < 3; q++) last = await answerQuiz(k.id, s.attemptId, q, answers[q], TUE);
    if (k.i === 3) {
      const s2 = await startQuiz(k.id, M.quiz, TUE);
      if (s2.ok) for (let q = 0; q < 3; q++) last = await answerQuiz(k.id, s2.attemptId, q, [0, 1, 0][q], TUE);
    }
    check(last !== null && last.ok, `퀴즈 풀기: ${k.name}`, JSON.stringify(last));
  }
  ev("열심히 하는 아이 8명", "말씀 읽기, 암송 확인 요청, 설교 퀴즈", "최지우는 퀴즈를 한 번 틀리고 다시 풀어서 통과");
  for (const k of group("steady")) {
    await daily(k, TUE);
    const c = await addComment(k.id, posts[1].id, "[예시] 감사 나무 멋져요!");
    check(c.ok, `댓글 달기: ${k.name}`, c.ok ? "" : c.reason);
  }
  ev("꾸준한 아이 10명", "말씀 읽기, 숲 소식 댓글");
  // 조민준 sends the photo again after it was sent back.
  const again7 = await photo(K(6), TUE);
  check(again7.ok, "돌려보낸 사진을 다시 올릴 수 있음 (조민준)", again7.ok ? again7.status : again7.reason);
  ev("조민준", "돌려보낸 가정예배 사진을 다시 올림", again7.ok ? "선생님 확인을 기다림" : "안 됨");

  // 류현우 forgets the PIN: five wrong tries lock the card for ten minutes.
  at(TUE, "19:00");
  let lockResult = "";
  for (let n = 0; n < 5; n++) {
    const r = await kidLogin(K(18).token, "0000");
    lockResult = r.ok ? "들어감" : r.reason;
  }
  check(lockResult === "locked", "비밀번호를 5번 틀리면 잠김", lockResult);
  const right = await kidLogin(K(18).token, "1234").catch((e) => ({ ok: false as const, reason: String(e) }));
  check(!right.ok && right.reason === "locked", "잠긴 동안에는 맞는 비밀번호도 안 됨", JSON.stringify(right));
  ev("류현우", "비밀번호를 5번 틀림", "10분 동안 잠김");

  at(TUE, "20:30");
  const visit = await addVisit(homeroomOf(K(25).cls), K(25).id, { visited_on: TUE, method: "phone", content: "[예시] 어머니와 통화. 이사 준비로 바빴고 다음 주일에 오기로 함." });
  check(visit.ok, "심방 기록 남기기", say(visit));
  const absent = await longAbsent(homeroomOf(K(25).cls));
  ev(`${homeroomOf(K(25).cls).name} 선생님`, "세 주 결석한 배나은에게 전화하고 심방 기록 남김", `장기 결석 목록: ${absent.map((a) => `${a.name} ${a.weeks}주`).join(", ") || "없음"}`);
  const headVisit = await addVisit(T("한기쁨"), K(25).id, { visited_on: TUE, method: "phone", content: "[예시] 부장도 연락함" });
  ev("한기쁨 부장", "같은 아이에게 심방 기록을 남겨 봄", say(headVisit));
  if (!headVisit.ok) find("difficulty", "부장 교사는 심방 기록을 쓸 수 없음", "부장은 심방 기록을 읽을 수만 있고 쓸 수 없어요(담임과 관리자만 씀). 규칙대로이지만, 부장이 대신 연락한 경우 적을 곳이 없어서 헷갈릴 수 있어요.");

  /* ================= 수요일 ================= */
  const WED = addDays(WEEK, 3);
  at(WED, "09:00");
  M.qr = await mk("수요 기도회 참석", { kind: "qr", drops: 2, points: 10, icon: "pray", starts_on: WED, ends_on: WED, repeat: "once" });
  const over = await weeklyDropCheck(admin, WEEK);
  check(over !== null && over.over, "미션을 더 넣으면 미션 화면이 한도를 넘는다고 알려 줌", JSON.stringify(over?.classes.slice(0, 2)));
  ev("관리자 김인성", "주중에 ‘수요 기도회 참석’ QR 미션(물방울 2개)을 추가", "미션 화면: 한 주 합계 14개, 한도 12개를 넘는다고 표시");
  const qrCode = (await one<{ qr_code: string }>(db, "select qr_code from missions where id = $1", [M.qr]))!.qr_code;

  at(WED, "10:00");
  const reset = await resetPin(homeroomOf(K(18).cls), K(18).id);
  const newPin = await saveNewPin(K(18).token, "4321", "4321");
  check(reset.ok && newPin.ok, "선생님이 비밀번호를 지워 주면 아이가 새로 만듦", `${say(reset)} / ${newPin.ok ? "됨" : newPin.reason}`);
  ev(`${homeroomOf(K(18).cls).name} 선생님`, "류현우의 비밀번호를 지워 줌", "류현우가 카드를 다시 찍고 새 비밀번호를 만듦");

  at(WED, "12:30");
  // The teachers who were asked on Tuesday hear the verses and confirm (5학년 2반's still has not looked).
  for (const cls of [0, 1, 2, 4]) {
    const t = cls === 4 ? T("윤사라") : homeroomOf(cls);
    const r = await review(t, () => true);
    if (r.yes > 0) ev(`${t.name} 선생님`, "할 일에서 암송과 사진 확인", `확인 ${r.yes}건`);
  }
  // Worries: each homeroom teacher answers what was written to them; the admin answers the pastor's.
  let replies = 0;
  for (const t of [...staff.filter((s) => s.role === "homeroom"), admin]) {
    for (const w of await listWorries(t)) {
      const open = await openWorry(t, w.id);
      if (!open || open.replies.some((r) => r.mine)) continue;
      const r = await replyWorry(t, w.id, "[예시] 이야기해 줘서 고마워요. 같이 기도할게요.");
      check(r.ok, `고민 답장: ${t.name}`, say(r));
      replies++;
    }
  }
  ev("담임 교사와 관리자", "고민을 읽고 답장", `답장 ${replies}개`);
  // A homeroom teacher must not be able to open a worry written only to the pastor.
  const pastorOnly = await one<{ id: number; class_id_at_write: number }>(db, "select id, class_id_at_write from worries where audience = 'pastor' order by id limit 1");
  if (pastorOnly) {
    const cls = classRows.findIndex((c) => c.id === pastorOnly.class_id_at_write);
    const peek = await openWorry(homeroomOf(cls), pastorOnly.id);
    check(peek === null, "전도사님께만 쓴 고민은 담임이 열 수 없음", peek ? "열림" : "");
    const headPeek = await openWorry(T("한기쁨"), pastorOnly.id);
    check(headPeek === null, "전도사님께만 쓴 고민은 부장도 열 수 없음", headPeek ? "열림" : "");
  }

  at(WED, "19:40");
  for (const k of group("eager")) {
    await daily(k, WED);
    const before = await weekDrops(k.id);
    const s = await scanQr(k.id, qrCode, WED);
    const after = await weekDrops(k.id);
    check(s.ok, `기도회 QR 찍기: ${k.name}`, s.ok ? "" : s.reason);
    check(after <= 12, `한 주 한도 12개를 넘지 않음: ${k.name}`, `QR 전 ${before}개, 후 ${after}개`);
    const token = await issueGameToken(k.id, M.game, "memory", Date.now());
    const fast = await winGame(k.id, M.game, token, Date.now() + 3000, WED);
    if (k.i === 0) check(!fast.ok, "게임을 3초 만에 끝냈다고 하면 인정하지 않음", JSON.stringify(fast));
    const win = await winGame(k.id, M.game, token, Date.now() + 40000, WED);
    check(win.ok, `짝 맞추기 게임: ${k.name}`, win.ok ? "" : win.reason);
    await water(k);
  }
  ev("열심히 하는 아이 8명", "말씀 읽기, 기도회 QR 찍기, 짝 맞추기 게임, 물 주기", "QR 미션은 완료되지만 한도 12개를 넘는 물방울은 받지 못함");
  for (const k of group("steady")) {
    await daily(k, WED);
    if (k.i % 2 === 1) await photo(k, WED);
  }
  ev("꾸준한 아이 10명", "말씀 읽기, 절반은 가정예배 사진 올리기");
  for (const k of group("light")) {
    await daily(k, WED);
    if (k.i === 10) {
      const rude = await addComment(k.id, posts[0].id, "바보 같아");
      check(!rude.ok && rude.reason === "rude", "나쁜 말이 든 댓글은 올라가지 않음", JSON.stringify(rude));
      ev("한지호", "나쁜 말이 든 댓글을 올리려 함", "올라가지 않음");
    }
    const c = await addComment(k.id, posts[0].id, "[예시] 소풍 가고 싶어요");
    check(c.ok, `댓글 달기: ${k.name}`, c.ok ? "" : c.reason);
  }
  ev("가끔 하는 아이 6명", "말씀 읽기, 숲 소식 댓글");
  // 이서윤 reports 한지호's comment; a basic teacher looks and keeps it.
  const target = await one<{ id: number }>(db, "select id from comments where child_id = $1 order by id desc limit 1", [K(10).id]);
  if (target) {
    const rep = await reportComment(K(1).id, target.id);
    const list = await reportedComments(T("오믿음"));
    const keep = await dismissReports(T("오믿음"), target.id);
    check(rep && list.length === 1 && keep.ok, "댓글 신고가 교사 할 일에 뜨고 처리됨", `${rep} / ${list.length}건 / ${say(keep)}`);
    ev("이서윤", "한지호의 댓글을 신고", "오믿음 선생님(기본)이 보고 그대로 두기로 함");
  }

  /* ================= 목요일 ================= */
  const THU = addDays(WEEK, 4);
  at(THU, "16:00");
  // 신하린 was marked present by mistake. She already used the drops on her tree.
  const k13 = K(13);
  const watered13 = await water(k13);
  const before13 = { drops: await dropBalance(db, k13.id), points: await pointBalance(db, k13.id), week: await weekDrops(k13.id) };
  const fix = await saveAttendance(homeroomOf(k13.cls), k13.id, WEEK, "absent");
  const after13 = { drops: await dropBalance(db, k13.id), points: await pointBalance(db, k13.id), week: await weekDrops(k13.id) };
  check(fix.ok && after13.drops >= 0, "출석을 결석으로 고쳐도 물방울이 0 아래로 내려가지 않음", `고치기 전 ${JSON.stringify(before13)}, 후 ${JSON.stringify(after13)}`);
  ev("박지현 선생님", "신하린의 주일 출석을 ‘결석’으로 고침", `신하린은 이미 물방울 ${watered13}개를 나무에 줬음. 고친 뒤 남은 물방울 ${after13.drops}개, 포인트 ${before13.points} → ${after13.points}`);
  if (after13.points === before13.points) find("note", "출석을 결석으로 고쳐도 포인트는 그대로", `신하린: 출석 미션 포인트 20P가 결석으로 고친 뒤에도 남아 있어요 (${after13.points}P).`);

  for (const k of group("eager")) await daily(k, THU);
  for (const k of group("steady")) {
    const t = await completeMission(k.id, M.text, { date: THU, text: "[예시] 친구가 도와줘서 감사해요." });
    check(t.ok, `감사한 일 적기: ${k.name}`, t.ok ? "" : t.reason);
  }
  ev("아이들", "열심히 하는 아이는 말씀 읽기, 꾸준한 아이는 감사한 일 적기");

  /* ================= 금요일 ================= */
  const FRI = addDays(WEEK, 5);
  at(FRI, "13:00");
  const headHome = await homeData(T("한기쁨"), { today: FRI });
  check(headHome.overdue.count > 0 && headHome.overdue.oldest === WEEK && headHome.overdue.classes.includes("5학년 2반"), "부장 홈에 3일 넘게 기다린 확인이 뜸", JSON.stringify(headHome.overdue));
  ev("한기쁨 부장", "홈 화면 할 일을 봄", `‘${headHome.overdue.count}건이 3일 넘게 확인을 기다려요’ (${headHome.overdue.classes.join(", ")})`);
  const teacherHome = await homeData(homeroomOf(0), { today: FRI });
  check(teacherHome.overdue.count === 0, "담임 홈에는 다른 반의 밀린 확인이 뜨지 않음", JSON.stringify(teacherHome.overdue));
  const waiting = await pendingCompletions(T("한기쁨"));
  const oldest = waiting.length > 0 ? waiting[0] : null;
  const headReview = await review(T("한기쁨"), () => true);
  ev("한기쁨 부장", "오래 기다린 미션 확인을 부장이 대신 처리", `확인 ${headReview.yes}건${oldest ? ` (가장 오래된 것: ${oldest.child_name} ${oldest.title}, ${oldest.done_on}에 올림)` : ""}`);
  check((await homeData(T("한기쁨"), { today: FRI })).overdue.count === 0, "부장이 대신 확인하면 홈의 밀린 확인이 사라짐");

  at(FRI, "18:00");
  for (const k of group("eager")) {
    await daily(k, FRI);
    await water(k);
  }
  for (const k of group("steady")) {
    await daily(k, FRI);
    if (k.i % 2 === 0) {
      const w = await submitWorry(k.id, "[예시] 시험이 걱정돼요.", "teacher");
      check(w.ok, `고민 적기: ${k.name}`, w.ok ? "" : w.reason);
    } else {
      const s = await startQuiz(k.id, M.quiz, FRI);
      if (s.ok) for (let q = 0; q < 3; q++) await answerQuiz(k.id, s.attemptId, q, [0, 1, 0][q], FRI);
    }
  }
  ev("아이들", "말씀 읽기, 꾸준한 아이 절반은 고민 적기, 절반은 설교 퀴즈");

  /* ================= 토요일 ================= */
  const SAT = addDays(WEEK, 6);
  at(SAT, "10:00");
  for (const k of group("eager")) await daily(k, SAT);
  for (const k of group("steady")) {
    await daily(k, SAT);
    await water(k);
  }
  for (const k of group("light")) {
    // They start the verses and stop after the first one.
    if (k.i !== 14 && k.i !== 28) {
      const a = await submitVerse(k.id, M.verse, 0, VERSES[0].text, SAT);
      check(a.ok && !a.finished, `말씀 쓰기 1절만 쓰고 멈춤: ${k.name}`, JSON.stringify(a));
    }
    await water(k, 2);
  }
  ev("아이들", "말씀 읽기와 물 주기. 가끔 하는 아이 4명은 말씀 쓰기를 1절만 쓰고 멈춤", "쓴 데까지는 기억됨, 물방울은 다 써야 들어옴");

  at(SAT, "12:00");
  // 손태윤's attendance was entered on Monday, after his teacher had watered for him: there are drops again.
  for (const k of kids.filter((x) => x.persona === "nophone")) {
    if ((await dropBalance(db, k.id)) === 0) continue;
    const w = await proxyWater(homeroomOf(k.cls), k.id);
    check(w.ok, `대신 물 주기 (토요일): ${k.name}`, w.ok ? `${w.given}개` : say(w));
    ev(`${homeroomOf(k.cls).name} 선생님`, `${k.name}에게 새로 생긴 물방울을 대신 나무에 줌`, w.ok ? `${w.given}개 줌` : say(w));
  }

  at(SAT, "20:00");
  // The admin gets next week ready.
  const nextVerses = await saveWeekVerses(admin, M.verse, NEXT, { ref: "[예시] 감사의 말씀 1절", verses: [{ n: "1", text: "모든 일에 감사해요. 기쁨으로 노래해요." }] });
  check(nextVerses.ok, "다음 주 말씀 미리 넣기", say(nextVerses));
  const nextPlan = await weekPlan(admin, NEXT);
  check(nextPlan !== null && !nextPlan.stored && nextPlan.rotating.length === 3 && !nextPlan.rotating.some((m) => stored!.rotating.some((s) => s.id === m.id)), "다음 주 순환 미션 미리보기는 이번 주에 안 나온 3개", nextPlan?.rotating.map((m) => m.title).join(", ") ?? "");
  ev("관리자 김인성", "다음 주(11월 4주차) 말씀을 미리 넣고 순환 미션 미리보기 확인", nextPlan?.rotating.map((m) => m.title).join(", "));
  const nextCheck = await weeklyDropCheck(admin, NEXT);
  const pick = await setWeekRotation(admin, NEXT, [M.pray, M.hello, M.worry]);
  check(pick.ok, "다음 주 순환 미션을 직접 고름", say(pick));
  const picked = await weekPlan(admin, NEXT);
  const back = await resetWeekRotation(admin, NEXT);
  const auto = await weekPlan(admin, NEXT);
  check(picked?.manual === true && back.ok && auto?.manual === false, "직접 고른 것을 자동으로 되돌림", `${picked?.manual} / ${say(back)} / ${auto?.manual}`);
  ev("관리자 김인성", "다음 주 순환 미션을 직접 골랐다가 ‘자동으로 되돌리기’", `미리보기 합계: ${JSON.stringify(nextCheck?.classes[0])}`);
  // The screen ticks the whole-week missions and leaves the one-day event unticked.
  const copied = await copyWeek(admin, NEXT, SAT, [M.text, M.quiz, M.game]);
  ev("관리자 김인성", "‘이번 주 기간 미션 복사’에서 수요 기도회만 빼고 복사", copied.ok ? `${copied.copied}개 복사` : say(copied));
  if (copied.ok) {
    const nextDated = (await weekMissions(admin, NEXT, SAT))?.filter((m) => m.mode === "dated") ?? [];
    const hasQr = nextDated.some((m) => m.title === "수요 기도회 참석");
    check(!hasQr && nextDated.length === 3, "표시한 기간 미션만 복사됨 (하루짜리 행사 미션은 빠짐)", nextDated.map((m) => m.title).join(", "));
    // The automatic pick came to 11 before the dated missions were copied; with them the week adds up.
    const afterCopy = await weeklyDropCheck(admin, NEXT);
    check(afterCopy !== null && !afterCopy.over && !afterCopy.under, "기간 미션을 복사한 뒤 다음 주 합계가 한도와 맞음", JSON.stringify(afterCopy?.classes[0]));
    ev("관리자 김인성", "미션 화면 맨 위 합계 안내 확인", `복사 전 ${nextCheck?.classes[0]?.total}개 → 복사 후 ${afterCopy?.classes[0]?.total}개 (한도 ${afterCopy?.cap}개)`);
  }

  /* ================= 검산 ================= */
  at(SAT, "23:00");
  // What next Sunday will look like (read only): the week's missions are open again and half-written verses start over.
  const fresh = await missionsForChild(db, K(0).id, NEXT);
  check(fresh.filter((m) => m.repeat === "weekly").every((m) => m.state === "available"), "다음 주일이 되면 매주 미션이 다시 열림", fresh.map((m) => `${m.title}:${m.state}`).join(", "));
  const half = (await missionsForChild(db, K(4).id, NEXT)).find((m) => m.id === M.verse);
  check(half !== undefined && half.verse_done === 0 && half.verse_list?.length === 1, "다음 주 말씀 쓰기는 새 말씀으로 처음부터", JSON.stringify({ done: half?.verse_done, verses: half?.verse_list?.length }));
  const halfNow = (await missionsForChild(db, K(4).id, SAT)).find((m) => m.id === M.verse);
  check(halfNow?.verse_done === 1, "1절만 쓰고 멈춘 아이는 다음에 2절부터 이어 씀", `쓴 절 ${halfNow?.verse_done}`);
  const cap = (await getSettings(db)).weeklyDropCap;
  const NEEDS = [2, 4, 6, 8, 10, 10];
  const table: { name: string; cls: string; persona: string; joined: boolean; attendance: string | null; missionsDone: number; weekDrops: number; weekPoints: number; dropsLeft: number; points: number; treeLevel: number; treeGiven: number }[] = [];
  for (const k of kids) {
    const drops = await dropBalance(db, k.id);
    const points = await pointBalance(db, k.id);
    const week = await weekDrops(k.id);
    const tree = await one<{ level: number; given: number }>(db, "select level, given from trees where child_id = $1 and harvested_at is null", [k.id]);
    const waters = (await one<{ n: number }>(db, "select count(*)::int as n from drop_ledger where child_id = $1 and ref_type = 'tree'", [k.id]))?.n ?? 0;
    const weekPoints = (await one<{ n: number }>(db, "select coalesce(sum(p.delta),0)::int as n from point_ledger p join mission_completions mc on mc.id = p.ref_id and p.ref_type = 'mission' where p.child_id = $1 and mc.week_start = $2", [k.id, WEEK]))?.n ?? 0;
    const done = (await one<{ n: number }>(db, "select count(*)::int as n from mission_completions where child_id = $1 and week_start = $2 and status = 'approved'", [k.id, WEEK]))?.n ?? 0;
    const att = (await one<{ status: string }>(db, "select status from attendance where child_id = $1 and date = $2", [k.id, WEEK]))?.status ?? null;
    // What the tree should look like after that many drops.
    let level = 1;
    let given = waters;
    while (level < 6 && given >= NEEDS[level - 1]) {
      given -= NEEDS[level - 1];
      level++;
    }
    check(week <= cap, `검산: 한 주 미션 물방울이 한도 이하 (${k.name})`, `${week}개`);
    check(drops >= 0 && points >= 0, `검산: 잔액이 0 이상 (${k.name})`, `물방울 ${drops}, 포인트 ${points}`);
    check(tree?.level === level && tree?.given === given, `검산: 나무 단계가 준 물방울 수와 맞음 (${k.name})`, `물 ${waters}번 → 기대 ${level}단계 ${given}개, 실제 ${tree?.level}단계 ${tree?.given}개`);
    table.push({ name: k.name, cls: classRows[k.cls].name, persona: PERSONA_KO[k.persona], joined: k.joined, attendance: att, missionsDone: done, weekDrops: week, weekPoints, dropsLeft: drops, points, treeLevel: tree?.level ?? 1, treeGiven: tree?.given ?? 0 });
  }
  for (const k of group("eager")) check((await weekDrops(k.id)) === cap, `검산: 다 한 아이는 정확히 한도만큼 받음 (${k.name})`, `${await weekDrops(k.id)}개`);
  const dupes = await db.query<{ n: number }>("select count(*)::int as n from (select child_id, mission_id, week_start from mission_completions mc join missions m on m.id = mc.mission_id where m.repeat = 'weekly' and mc.status <> 'rejected' group by 1,2,3 having count(*) > 1) x");
  check((dupes[0]?.n ?? 0) === 0, "검산: 매주 미션을 한 주에 두 번 받은 아이가 없음", `${dupes[0]?.n}건`);
  const stillPending = await db.query<{ child: string; title: string; done_on: string }>("select c.name as child, m.title, mc.done_on from mission_completions mc join children c on c.id = mc.child_id join missions m on m.id = mc.mission_id where mc.status = 'pending' order by mc.done_on");
  const nophoneDrops: { name: string; drops: number }[] = [];
  for (const k of kids.filter((x) => x.persona === "nophone")) nophoneDrops.push({ name: k.name, drops: await dropBalance(db, k.id) });
  if (nophoneDrops.some((n) => n.drops > 0)) {
    find("error", "휴대폰 없는 아이의 물방울이 남아 있음", `${nophoneDrops.map((n) => `${n.name} ${n.drops}개`).join(", ")}: 선생님이 대신 물을 줬는데도 남았어요.`);
  }
  const neverJoined = kids.filter((k) => !k.joined);
  const todo = { head: await todoCounts(T("한기쁨")), admin: await todoCounts(admin) };
  const stats = await missionStats(admin, Object.values(M).filter((id) => id > 0), WEEK);
  const titles = await db.query<{ id: number; title: string; mode: string; drops: number; points: number }>("select id, title, mode, drops, points from missions order by id");
  const missionTable = titles.map((m) => ({ title: m.title, mode: m.mode, drops: m.drops, points: m.points, done: stats?.get(m.id)?.done ?? 0, pending: stats?.get(m.id)?.pending ?? 0 }));
  const byClass = classRows.map((c, idx) => {
    const rows = table.filter((r) => r.cls === c.name);
    return {
      name: c.name,
      teacher: staff.filter((s) => s.class_ids.includes(c.id)).map((s) => s.name).join(", "),
      kids: rows.length,
      present: rows.filter((r) => r.attendance === "present" || r.attendance === "late").length,
      weekDrops: rows.reduce((a, r) => a + r.weekDrops, 0),
      weekPoints: rows.reduce((a, r) => a + r.weekPoints, 0),
      idx,
    };
  });

  await db.query("checkpoint");
  const passed = checks.filter((c) => c.ok).length;
  fs.writeFileSync(
    path.join(OUT, "week.json"),
    JSON.stringify({ week: WEEK, days: DAY_NAMES, people: { children: kids.length, teachers: staff.length, admins: 1 }, checks: { total: checks.length, passed, failed: checks.filter((c) => !c.ok) }, findings, events, byClass, table, missionTable, stillPending, neverJoined: neverJoined.map((k) => k.name), todo }, null, 2),
  );
  console.log(`checks ${passed}/${checks.length}, findings ${findings.length}, events ${events.length}`);
  for (const f of findings) console.log(`[${f.kind}] ${f.title} — ${f.detail}`);
  expect(kids.length).toBe(30);
  expect(staff.length).toBe(10);
});
