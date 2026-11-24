import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { finishEggRound, openEggRound, type EggAnswer } from "@/lib/kid/egg-game";

/**
 * 〈달걀 홀인원〉 as this app serves it: /minigames/egg-hole-in-one/…
 *
 * - GET: the game's own page and scripts, read from games/egg-hole-in-one/public (the same files
 *   the game's stand-alone server sends; next.config.ts bundles them with the server).
 * - POST api/rounds and api/rounds/<id>/finish: the game's server (src/lib/kid/egg-game.ts).
 *
 * The page asks for its scripts and its server by relative address, so it must be opened as
 * …/egg-hole-in-one/index.html; the bare folder address goes there.
 * No sign-in is needed here, as on the game's own server: a round can only ever be paid through a
 * launch that a signed-in child's mission screen made (src/lib/kid/hosted-game.ts).
 */
const HOME = "/minigames/egg-hole-in-one/index.html";
const DIR = path.join(process.cwd(), "games", "egg-hole-in-one", "public");
const TYPES: Record<string, string> = { html: "text/html", css: "text/css", mjs: "text/javascript", svg: "image/svg+xml" };
const MAX_BODY = 8192;

interface Asset {
  type: string;
  body: Buffer;
  etag: string;
}

let loaded: Promise<Map<string, Asset>> | null = null;
async function readAssets(): Promise<Map<string, Asset>> {
  const out = new Map<string, Asset>();
  for (const entry of await readdir(DIR, { recursive: true })) {
    const name = entry.replaceAll("\\", "/");
    const type = TYPES[name.split(".").pop() ?? ""];
    if (!type) continue;
    const body = await readFile(path.join(DIR, name));
    out.set(name, { type, body, etag: `"${createHash("sha1").update(body).digest("hex")}"` });
  }
  return out;
}
/** Read once per server; while developing, read every time so a change to the game shows at once. */
function assets(): Promise<Map<string, Asset>> {
  if (process.env.NODE_ENV !== "production") return readAssets();
  loaded ??= readAssets().catch((e) => {
    loaded = null;
    throw e;
  });
  return loaded;
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  const parts = (await ctx.params).path ?? [];
  if (parts.length === 0) return Response.redirect(new URL(HOME, req.url), 307);
  const asset = (await assets()).get(parts.join("/"));
  if (!asset) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": `${asset.type}; charset=utf-8`,
    // Always asked again, answered "unchanged" when it is: a new version of the game never mixes with an old one.
    "Cache-Control": "no-cache",
    ETag: asset.etag,
    "X-Content-Type-Options": "nosniff",
  };
  // The game is shown inside this app's own mission screen, and nowhere else.
  if (asset.type === "text/html") headers["Content-Security-Policy"] = "frame-ancestors 'self'";
  if (req.headers.get("if-none-match") === asset.etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(asset.body), { headers });
}

const json = (a: EggAnswer) => Response.json(a.body, { status: a.status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request, ctx: Ctx) {
  const parts = (await ctx.params).path ?? [];
  const opening = parts.length === 2 && parts[0] === "api" && parts[1] === "rounds";
  const finishing = parts.length === 4 && parts[0] === "api" && parts[1] === "rounds" && parts[3] === "finish";
  if (!opening && !finishing) return json({ status: 404, body: { error: "unknown_route" } });
  let input: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ status: 413, body: { error: "body_too_large" } });
    input = JSON.parse(raw);
  } catch {
    return json({ status: 400, body: { error: "invalid_json" } });
  }
  return json(opening ? await openEggRound(input) : await finishEggRound(parts[2], input));
}
