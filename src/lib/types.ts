export type Role = "basic" | "homeroom" | "head" | "admin";

export interface Staff {
  id: number;
  name: string;
  role: Role;
  can_attendance: boolean;
  can_visits: boolean;
  can_approve: boolean;
  can_view_all: boolean;
  can_read_pastor_worries: boolean;
  active: boolean;
  class_ids: number[];
}

export interface Child {
  id: number;
  name: string;
  class_id: number | null;
  birth_date: string | null;
  birth_year: number | null;
  gender: "M" | "F" | null;
  school: string | null;
  school_class: string | null;
  address: string | null;
  phone: string | null;
  guardian_phone: string | null;
  photo_url: string | null;
  best_friend_id: number | null;
  best_friend_name: string | null;
  has_phone: boolean;
  qr_token: string;
  has_pin: boolean;
  onboarded_at: string | null;
  consent_on: string | null;
  photo_consent: boolean;
  memo: string | null;
  active: boolean;
}

export type MissionKind = "self" | "text" | "photo" | "verse" | "quiz" | "game" | "qr" | "teacher" | "worry" | "comment" | "attendance";

/** One quiz question. `answer` is the index of the right choice and must never reach a child's browser before they answer. */
export interface QuizQuestion {
  q: string;
  choices: string[];
  answer: number;
}

export interface Mission {
  id: number;
  title: string;
  description: string;
  kind: MissionKind;
  icon: string;
  verse_text: string | null;
  verse_ref: string | null;
  qr_code: string | null;
  points: number;
  drops: number;
  repeat: "once" | "daily" | "weekly";
  weekly_limit: number | null;
  target_grade: number | null;
  target_class_id: number | null;
  starts_on: string;
  ends_on: string;
  is_challenge: boolean;
  active: boolean;
  /** Quiz missions only. Holds the right answers: server-side use only. */
  quiz: QuizQuestion[] | null;
  /** How many answers must be right; null means all. */
  quiz_pass: number | null;
  /** Game missions only: an id from src/games/registry.ts. */
  game_id: string | null;
}

export interface Tree {
  id: number;
  child_id: number;
  seq: number;
  species: string;
  level: number;
  given: number;
  planted_at: string;
  harvested_at: string | null;
}

export type WorryAudience = "teacher" | "pastor" | "both";

export const LEVEL_NAMES = ["씨앗", "새싹", "어린나무", "큰나무", "꽃나무", "열매나무"] as const;
export const ROLE_NAMES: Record<Role, string> = { basic: "교사 기본", homeroom: "담임", head: "부장", admin: "관리자" };
export const KIND_NAMES: Record<MissionKind, string> = {
  self: "스스로 체크",
  text: "글 쓰기",
  photo: "사진 올리기",
  verse: "말씀 쓰기",
  quiz: "퀴즈",
  game: "게임",
  qr: "QR 찍기",
  teacher: "교사 확인",
  worry: "고민 적기",
  comment: "숲 소식 댓글",
  attendance: "주일 출석",
};
