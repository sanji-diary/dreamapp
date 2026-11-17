import "server-only";
import { headers } from "next/headers";
import { appOrigin } from "./kakao";

/** Public address of the app: APP_URL when set, otherwise the address of the current request. */
export async function publicOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.");
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() ?? (local ? "http" : "https");
  return appOrigin(`${proto}://${host}`);
}
