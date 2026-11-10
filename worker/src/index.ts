import { ingestFeed, runCollector, type CollectEnv } from "./collect";
import { LATEST_READING_COLUMNS, shapeHistoryPage } from "./db";

interface Env extends CollectEnv {
  /** Bearer token for POST /ingest. Set with `wrangler secret put INGEST_TOKEN`. */
  INGEST_TOKEN?: string;
}

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const MAX_INGEST_BYTES = 256 * 1024;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, cache = "no-store"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache, ...CORS },
  });
}

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = value === null ? NaN : Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Constant-time string compare, so the token cannot be guessed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function latest(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT ${LATEST_READING_COLUMNS} FROM latest ORDER BY buoyId`
  ).all();
  return json({ rows: results }, 200, "public, max-age=60");
}

async function history(env: Env, url: URL): Promise<Response> {
  const afterSeq = intParam(url.searchParams.get("afterSeq"), 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = intParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const buoy = url.searchParams.get("buoy");

  const stmt = buoy
    ? env.DB.prepare("SELECT * FROM snapshots WHERE seq > ?1 AND buoyId = ?2 ORDER BY seq LIMIT ?3").bind(
        afterSeq,
        buoy,
        limit + 1
      )
    : env.DB.prepare("SELECT * FROM snapshots WHERE seq > ?1 ORDER BY seq LIMIT ?2").bind(afterSeq, limit + 1);

  const [{ results }, stats] = await Promise.all([
    stmt.all<{ seq: number }>(),
    env.DB.prepare("SELECT maxSeq FROM stats WHERE id = 1").first<{ maxSeq: number }>(),
  ]);
  const maxSeq = stats?.maxSeq ?? 0;
  return json(shapeHistoryPage(results, afterSeq, limit, maxSeq), 200, "public, max-age=30");
}

async function status(env: Env): Promise<Response> {
  const [sources, totals, buoys] = await Promise.all([
    env.DB.prepare("SELECT * FROM sync_state ORDER BY source").all(),
    env.DB.prepare("SELECT maxSeq, rowCount FROM stats WHERE id = 1").first(),
    env.DB.prepare(
      "SELECT buoyId, timestamp AS latestTimestamp, rowCount FROM latest ORDER BY buoyId"
    ).all(),
  ]);
  return json(
    {
      serverTime: new Date().toISOString(),
      maxSeq: (totals as { maxSeq?: number } | null)?.maxSeq ?? 0,
      rowCount: (totals as { rowCount?: number } | null)?.rowCount ?? 0,
      sources: sources.results,
      buoys: buoys.results,
    },
    200,
    "public, max-age=30"
  );
}

async function ingest(request: Request, env: Env): Promise<Response> {
  if (!env.INGEST_TOKEN) return json({ error: "ingest is not configured" }, 503);
  const auth = request.headers.get("Authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.INGEST_TOKEN}`)) return json({ error: "unauthorized" }, 401);

  const text = await request.text();
  if (text.length > MAX_INGEST_BYTES) return json({ error: "body too large" }, 413);

  let feed: unknown;
  try {
    feed = (JSON.parse(text) as { feed?: unknown }).feed;
  } catch {
    return json({ error: "body must be JSON like {\"feed\": \"<King County text>\"}" }, 400);
  }
  if (typeof feed !== "string" || feed.length === 0) return json({ error: "missing feed" }, 400);

  try {
    return json(await ingestFeed(env, feed, "ingest"));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "ingest failed" }, 422);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    try {
      if (request.method === "GET") {
        if (url.pathname === "/v1/latest") return await latest(env);
        if (url.pathname === "/v1/history") return await history(env, url);
        if (url.pathname === "/v1/status") return await status(env);
        if (url.pathname === "/") return json({ name: "2lakes-api", docs: "worker/API.md", version: 1 });
      }
      if (request.method === "POST" && url.pathname === "/ingest") return await ingest(request, env);
      return json({ error: "not found" }, 404);
    } catch (error) {
      console.error("[2lakes-api] request failed", error);
      return json({ error: "internal error" }, 500);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runCollector(env).then(
        (r) => console.log("[2lakes-api] collected", JSON.stringify(r)),
        (e) => console.error("[2lakes-api] collect failed", e instanceof Error ? e.message : e)
      )
    );
  },
};
