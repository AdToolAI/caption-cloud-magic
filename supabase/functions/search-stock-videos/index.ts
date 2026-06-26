// Phase 6.3 — Premium Stock Video Tier
// Aggregates Pexels Video + Pixabay Video into a normalized response.
// 24h cache via stock_video_cache table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isQaMockRequest } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface VideoFile {
  quality: string;
  width: number;
  height: number;
  fps?: number;
  url: string;
  file_type?: string;
}

interface StockVideo {
  id: string;
  provider: "pexels" | "pixabay";
  external_id: string;
  title: string;
  thumbnail: string;
  preview_url: string;
  download_url: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  orientation: "landscape" | "portrait" | "square";
  tags: string[];
  photographer: string;
  source_url: string;
  video_files: VideoFile[];
  is_4k: boolean;
  is_hd: boolean;
  is_vertical: boolean;
  is_slowmo: boolean;
  quality_score: number;
}

const FALLBACK_CATALOG: StockVideo[] = [
  {
    id: "fallback-mixkit-1",
    provider: "pexels",
    external_id: "mixkit-1",
    title: "Cinematic Sunset Drone",
    thumbnail: "https://assets.mixkit.co/videos/preview/mixkit-aerial-shot-of-a-tropical-beach-1564-large.mp4",
    preview_url: "https://assets.mixkit.co/videos/preview/mixkit-aerial-shot-of-a-tropical-beach-1564-small.mp4",
    download_url: "https://assets.mixkit.co/videos/preview/mixkit-aerial-shot-of-a-tropical-beach-1564-large.mp4",
    width: 1920, height: 1080, duration: 12, fps: 30,
    orientation: "landscape", tags: ["drone", "sunset", "cinematic"],
    photographer: "Mixkit", source_url: "https://mixkit.co",
    video_files: [], is_4k: false, is_hd: true, is_vertical: false, is_slowmo: false,
    quality_score: 70,
  },
];

function classifyOrientation(w: number, h: number): "landscape" | "portrait" | "square" {
  const r = w / h;
  if (r > 1.2) return "landscape";
  if (r < 0.85) return "portrait";
  return "square";
}

function pickBestPexelsFile(files: any[]): VideoFile {
  // Prefer 4K hd if available, else largest hd
  const sorted = [...files].sort((a, b) => (b.width || 0) - (a.width || 0));
  const f = sorted[0] ?? files[0];
  return {
    quality: f.quality ?? "hd",
    width: f.width ?? 0,
    height: f.height ?? 0,
    fps: f.fps,
    url: f.link,
    file_type: f.file_type,
  };
}

async function searchPexels(query: string, perPage: number, orientation?: string): Promise<StockVideo[]> {
  const key = Deno.env.get("PEXELS_API_KEY");
  if (!key) return [];
  try {
    const url = new URL("https://api.pexels.com/videos/search");
    url.searchParams.set("query", query || "cinematic");
    url.searchParams.set("per_page", String(perPage));
    if (orientation) url.searchParams.set("orientation", orientation);
    const r = await fetch(url.toString(), { headers: { Authorization: key } });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.videos || []).map((v: any): StockVideo => {
      const files: VideoFile[] = (v.video_files || []).map((f: any) => ({
        quality: f.quality, width: f.width ?? 0, height: f.height ?? 0,
        fps: f.fps, url: f.link, file_type: f.file_type,
      }));
      const best = pickBestPexelsFile(v.video_files || []);
      const w = v.width ?? best.width;
      const h = v.height ?? best.height;
      const orient = classifyOrientation(w, h);
      const fps = best.fps ?? 30;
      return {
        id: `pexels-${v.id}`,
        provider: "pexels",
        external_id: String(v.id),
        title: (v.user?.name ? `${v.user.name} — ` : "") + (v.url?.split("/").filter(Boolean).pop() ?? "Pexels Video").replace(/-/g, " "),
        thumbnail: v.image,
        preview_url: best.url,
        download_url: best.url,
        width: w, height: h, duration: v.duration ?? 0, fps,
        orientation: orient,
        tags: (v.tags || []).slice(0, 8),
        photographer: v.user?.name ?? "Pexels",
        source_url: v.url,
        video_files: files,
        is_4k: w >= 3840,
        is_hd: w >= 1920,
        is_vertical: orient === "portrait",
        is_slowmo: fps >= 50,
        quality_score: (w >= 3840 ? 100 : w >= 1920 ? 80 : 50) + (fps >= 50 ? 10 : 0),
      };
    });
  } catch (e) {
    console.error("[search-stock-videos] pexels error", e);
    return [];
  }
}

async function searchPixabay(query: string, perPage: number, orientation?: string): Promise<StockVideo[]> {
  const key = Deno.env.get("PIXABAY_API_KEY");
  if (!key) return [];
  try {
    const url = new URL("https://pixabay.com/api/videos/");
    url.searchParams.set("key", key);
    url.searchParams.set("q", query || "cinematic");
    url.searchParams.set("per_page", String(Math.max(3, Math.min(50, perPage))));
    url.searchParams.set("video_type", "all");
    const r = await fetch(url.toString());
    if (!r.ok) return [];
    const data = await r.json();
    return (data.hits || []).map((v: any): StockVideo => {
      const sizes = v.videos || {};
      const best = sizes.large || sizes.medium || sizes.small || sizes.tiny || {};
      const w = best.width ?? 1920;
      const h = best.height ?? 1080;
      const orient = classifyOrientation(w, h);
      const files: VideoFile[] = ["large", "medium", "small", "tiny"]
        .filter((k) => sizes[k]?.url)
        .map((k) => ({
          quality: k,
          width: sizes[k].width ?? 0,
          height: sizes[k].height ?? 0,
          url: sizes[k].url,
        }));
      return {
        id: `pixabay-${v.id}`,
        provider: "pixabay",
        external_id: String(v.id),
        title: (v.tags || "Pixabay Video").split(",")[0].trim() || "Pixabay Video",
        thumbnail: `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg`,
        preview_url: best.url,
        download_url: best.url,
        width: w, height: h, duration: v.duration ?? 0, fps: 30,
        orientation: orient,
        tags: (v.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean).slice(0, 8),
        photographer: v.user ?? "Pixabay",
        source_url: v.pageURL,
        video_files: files,
        is_4k: w >= 3840,
        is_hd: w >= 1920,
        is_vertical: orient === "portrait",
        is_slowmo: false,
        quality_score: (w >= 3840 ? 95 : w >= 1920 ? 75 : 45),
      };
    });
  } catch (e) {
    console.error("[search-stock-videos] pixabay error", e);
    return [];
  }
}

function interleave(a: StockVideo[], b: StockVideo[]): StockVideo[] {
  const out: StockVideo[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

async function hashKey(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Require authenticated caller — protects paid Pexels/Pixabay quota and cache.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authError } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const query: string = (body.query ?? "").toString().trim().slice(0, 120);
    const limit: number = Math.min(60, Math.max(6, Number(body.limit ?? 30)));
    const orientation: string | undefined = body.orientation;
    const min_quality: string | undefined = body.min_quality; // 'hd' | '4k'
    const min_fps: number | undefined = body.min_fps;
    const max_duration: number | undefined = body.max_duration;
    const min_duration: number | undefined = body.min_duration;

    const filters = { orientation, min_quality, min_fps, max_duration, min_duration };
    const cacheKey = await hashKey(JSON.stringify({ q: query, limit, ...filters }));

    // Try cache
    const { data: cached } = await sb
      .from("stock_video_cache")
      .select("payload, expires_at")
      .eq("query_hash", cacheKey)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached?.payload) {
      return new Response(JSON.stringify({ ...cached.payload, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const perProvider = Math.ceil(limit / 2);
    const [px, pb] = await Promise.all([
      searchPexels(query, perProvider, orientation),
      searchPixabay(query, perProvider, orientation),
    ]);

    let merged = interleave(px, pb);

    // Apply filters client-side (provider-side filters are limited)
    if (min_quality === "4k") merged = merged.filter((v) => v.is_4k);
    else if (min_quality === "hd") merged = merged.filter((v) => v.is_hd);
    if (typeof min_fps === "number") merged = merged.filter((v) => (v.fps ?? 0) >= min_fps);
    if (typeof max_duration === "number") merged = merged.filter((v) => (v.duration ?? 0) <= max_duration);
    if (typeof min_duration === "number") merged = merged.filter((v) => (v.duration ?? 0) >= min_duration);

    if (merged.length === 0 && !Deno.env.get("PEXELS_API_KEY") && !Deno.env.get("PIXABAY_API_KEY")) {
      merged = FALLBACK_CATALOG;
    }

    merged = merged.slice(0, limit);

    const payload = {
      results: merged,
      providers: { pexels: px.length, pixabay: pb.length },
      query,
      filters,
    };

    // Write cache (best-effort)
    sb.from("stock_video_cache")
      .upsert({
        query_hash: cacheKey,
        query,
        filters,
        payload,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "query_hash" })
      .then(() => {});

    return new Response(JSON.stringify({ ...payload, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[search-stock-videos] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message, results: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
