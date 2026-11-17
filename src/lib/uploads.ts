import "server-only";
import { db, one } from "./db";

const MAX_BYTES = 1_500_000;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export type UploadPurpose = "mission" | "profile" | "post";

/** Stores an image and returns the URL to save in photo_url / image_url columns. */
export async function saveUpload(file: File, purpose: UploadPurpose, owner: { childId?: number; staffId?: number }): Promise<string> {
  if (!TYPES.includes(file.type)) throw new Error("이미지 파일만 올릴 수 있어요");
  if (file.size > MAX_BYTES) throw new Error("사진이 너무 커요");
  const bytes = Buffer.from(await file.arrayBuffer());
  const rows = await db.query<{ id: number }>("insert into uploads (purpose, child_id, staff_id, mime, bytes) values ($1,$2,$3,$4,$5) returning id", [
    purpose,
    owner.childId ?? null,
    owner.staffId ?? null,
    file.type,
    bytes,
  ]);
  return `/api/photo/${rows[0].id}`;
}

export async function readUpload(id: number) {
  return one<{ id: number; purpose: UploadPurpose; child_id: number | null; mime: string; bytes: Uint8Array }>(db, "select id, purpose, child_id, mime, bytes from uploads where id = $1", [id]);
}
