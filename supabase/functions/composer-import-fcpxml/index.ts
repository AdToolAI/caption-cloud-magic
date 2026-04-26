// composer-import-fcpxml v1.0.0
// Roundtrip: parse a modified FCPXML and diff it against composer_scenes.
// Returns reorder/trim/delete proposals; only mutates DB when apply === true.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  projectId: string;
  fcpxmlContent: string;
  apply?: boolean;
}

interface ParsedClip {
  assetId: string;
  url: string | null;
  name: string | null;
  /** seconds */
  duration: number;
  /** seconds (in-point inside source) */
  startInSource: number;
  /** order in spine (0-based) */
  spineOrder: number;
}

interface SceneDiff {
  sceneId: string;
  matchedAssetUrl: string;
  oldOrderIndex: number;
  newOrderIndex: number;
  oldDuration: number;
  newDuration: number;
  oldTrimStart: number;
  newTrimStart: number;
  reordered: boolean;
  trimmed: boolean;
}

interface DiffResult {
  reordered: SceneDiff[];
  trimmed: SceneDiff[];
  unchanged: SceneDiff[];
  deleted: { sceneId: string; orderIndex: number; clipUrl: string | null }[];
  unknownAssets: { assetId: string; url: string | null; spineOrder: number }[];
  warnings: string[];
}

/* ---------------- helpers ---------------- */

/** Parse FCPXML rational time like "1500/30s" or "0s" → seconds. */
const parseRational = (raw: string | undefined | null): number => {
  if (!raw) return 0;
  const v = String(raw).trim();
  if (v === "0s" || v === "0") return 0;
  const m = v.match(/^(-?\d+)(?:\/(\d+))?s?$/);
  if (!m) return 0;
  const num = Number(m[1]);
  const den = m[2] ? Number(m[2]) : 1;
  return den > 0 ? num / den : 0;
};

const ensureArray = <T>(v: T | T[] | undefined): T[] => {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
};

/** Walk a node tree and collect all asset-clip elements in spine order. */
function collectSpineClips(spine: any, assetMap: Map<string, { url: string | null; name: string | null }>): ParsedClip[] {
  const clips: ParsedClip[] = [];
  if (!spine) return clips;

  // asset-clip (direct video clip)
  const assetClips = ensureArray(spine["asset-clip"]);
  for (const c of assetClips) {
    const ref = c?.["@_ref"] ?? c?.ref;
    if (!ref) continue;
    const asset = assetMap.get(String(ref));
    // Skip audio-only lanes (lane attribute negative) to avoid mixing into spine order
    const lane = c?.["@_lane"];
    if (lane !== undefined && Number(lane) < 0) continue;

    clips.push({
      assetId: String(ref),
      url: asset?.url ?? null,
      name: asset?.name ?? c?.["@_name"] ?? null,
      duration: parseRational(c?.["@_duration"]),
      startInSource: parseRational(c?.["@_start"]),
      spineOrder: clips.length,
    });
  }

  return clips;
}

/* ---------------- main ---------------- */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // --- auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    // --- input ---
    const body = (await req.json()) as ReqBody;
    if (!body.projectId) throw new Error("projectId required");
    if (!body.fcpxmlContent || typeof body.fcpxmlContent !== "string") {
      throw new Error("fcpxmlContent required");
    }
    if (body.fcpxmlContent.length > 5_000_000) {
      throw new Error("FCPXML too large (max 5 MB)");
    }
    const apply = body.apply === true;

    // --- ownership check ---
    const { data: ownership } = await supabase
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", body.projectId)
      .single();
    if (!ownership || ownership.user_id !== user.id) {
      throw new Error("Project not found or not owned by user");
    }

    // --- load current scenes ---
    const { data: dbScenes, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select("id, order_index, duration_seconds, clip_url, upload_url, trim_start_sec, trim_end_sec")
      .eq("project_id", body.projectId)
      .order("order_index", { ascending: true });
    if (sceneErr) throw new Error(`Failed to load scenes: ${sceneErr.message}`);

    // --- parse FCPXML ---
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      allowBooleanAttributes: false,
      processEntities: true,
      // Don't trim text nodes — preserve URLs exactly
      trimValues: false,
    });

    let parsed: any;
    try {
      parsed = parser.parse(body.fcpxmlContent);
    } catch (e) {
      throw new Error(`Invalid FCPXML: ${(e as Error).message}`);
    }

    const fcpxml = parsed?.fcpxml;
    if (!fcpxml) throw new Error("Missing <fcpxml> root element");

    // --- build asset map (id -> url) ---
    const assetMap = new Map<string, { url: string | null; name: string | null }>();
    const assets = ensureArray(fcpxml?.resources?.asset);
    for (const a of assets) {
      const id = a?.["@_id"];
      if (!id) continue;
      assetMap.set(String(id), {
        url: (a?.["@_src"] ?? null) as string | null,
        name: (a?.["@_name"] ?? null) as string | null,
      });
    }

    // --- find spine clips ---
    // Path: fcpxml > library > event > project > sequence > spine
    const events = ensureArray(fcpxml?.library?.event);
    let spine: any = null;
    for (const ev of events) {
      const projects = ensureArray(ev?.project);
      for (const p of projects) {
        const seqs = ensureArray(p?.sequence);
        for (const s of seqs) {
          if (s?.spine) {
            spine = s.spine;
            break;
          }
        }
        if (spine) break;
      }
      if (spine) break;
    }
    if (!spine) throw new Error("No <spine> found in FCPXML");

    const fcpClips = collectSpineClips(spine, assetMap);

    // --- diff ---
    const warnings: string[] = [];
    const reordered: SceneDiff[] = [];
    const trimmed: SceneDiff[] = [];
    const unchanged: SceneDiff[] = [];
    const matchedSceneIds = new Set<string>();
    const unknownAssets: DiffResult["unknownAssets"] = [];

    // Build lookup: clipUrl -> scene
    const sceneByUrl = new Map<string, typeof dbScenes[number]>();
    for (const sc of dbScenes ?? []) {
      const url = (sc.clip_url || sc.upload_url || "").trim();
      if (url) sceneByUrl.set(url, sc);
    }

    for (const fc of fcpClips) {
      if (!fc.url) {
        warnings.push(`Spine clip #${fc.spineOrder + 1}: no source URL — skipped`);
        continue;
      }
      const scene = sceneByUrl.get(fc.url.trim());
      if (!scene) {
        unknownAssets.push({
          assetId: fc.assetId,
          url: fc.url,
          spineOrder: fc.spineOrder,
        });
        continue;
      }
      if (matchedSceneIds.has(scene.id)) {
        warnings.push(
          `Scene "${scene.id.slice(0, 8)}" appears multiple times in FCPXML — only first match used`,
        );
        continue;
      }
      matchedSceneIds.add(scene.id);

      const oldOrder = scene.order_index ?? 0;
      const newOrder = fc.spineOrder;
      const oldDur = Number(scene.duration_seconds ?? 0);
      const newDur = Number(fc.duration.toFixed(3));
      const oldTrim = Number(scene.trim_start_sec ?? 0);
      const newTrim = Number(fc.startInSource.toFixed(3));

      const isReordered = oldOrder !== newOrder;
      // Tolerance: 1 frame at 30fps = 0.033s
      const isTrimmed = Math.abs(oldDur - newDur) > 0.05 || Math.abs(oldTrim - newTrim) > 0.05;

      const diff: SceneDiff = {
        sceneId: scene.id,
        matchedAssetUrl: fc.url,
        oldOrderIndex: oldOrder,
        newOrderIndex: newOrder,
        oldDuration: oldDur,
        newDuration: newDur,
        oldTrimStart: oldTrim,
        newTrimStart: newTrim,
        reordered: isReordered,
        trimmed: isTrimmed,
      };

      if (isReordered) reordered.push(diff);
      if (isTrimmed) trimmed.push(diff);
      if (!isReordered && !isTrimmed) unchanged.push(diff);
    }

    const deleted = (dbScenes ?? [])
      .filter((sc) => !matchedSceneIds.has(sc.id))
      .map((sc) => ({
        sceneId: sc.id,
        orderIndex: sc.order_index ?? 0,
        clipUrl: sc.clip_url || sc.upload_url || null,
      }));

    const result: DiffResult = {
      reordered,
      trimmed,
      unchanged,
      deleted,
      unknownAssets,
      warnings,
    };

    // --- apply mutations (only when explicitly requested) ---
    let applied: { reordered: number; trimmed: number; deletedSoft: number } | null = null;

    if (apply) {
      let reorderedCount = 0;
      let trimmedCount = 0;

      // Reorder + trim in one update per scene where needed
      const sceneUpdates = new Map<
        string,
        { order_index?: number; duration_seconds?: number; trim_start_sec?: number }
      >();

      for (const d of reordered) {
        const u = sceneUpdates.get(d.sceneId) ?? {};
        u.order_index = d.newOrderIndex;
        sceneUpdates.set(d.sceneId, u);
      }
      for (const d of trimmed) {
        const u = sceneUpdates.get(d.sceneId) ?? {};
        u.duration_seconds = d.newDuration;
        u.trim_start_sec = d.newTrimStart;
        sceneUpdates.set(d.sceneId, u);
      }

      // Two-phase reorder to avoid unique-index conflicts: shift all to negative first.
      if (sceneUpdates.size > 0) {
        const idsToShift = Array.from(sceneUpdates.keys());
        // phase 1: bump to large negative space (use -10000 - newOrder)
        for (const id of idsToShift) {
          const u = sceneUpdates.get(id)!;
          if (u.order_index !== undefined) {
            await supabase
              .from("composer_scenes")
              .update({ order_index: -10000 - u.order_index })
              .eq("id", id)
              .eq("project_id", body.projectId);
          }
        }
        // phase 2: apply final values
        for (const [id, u] of sceneUpdates) {
          const patch: Record<string, unknown> = {};
          if (u.order_index !== undefined) patch.order_index = u.order_index;
          if (u.duration_seconds !== undefined) patch.duration_seconds = u.duration_seconds;
          if (u.trim_start_sec !== undefined) patch.trim_start_sec = u.trim_start_sec;
          if (Object.keys(patch).length === 0) continue;

          const { error } = await supabase
            .from("composer_scenes")
            .update(patch)
            .eq("id", id)
            .eq("project_id", body.projectId);
          if (error) {
            warnings.push(`Failed to update scene ${id.slice(0, 8)}: ${error.message}`);
            continue;
          }
          if (u.order_index !== undefined) reorderedCount++;
          if (u.duration_seconds !== undefined || u.trim_start_sec !== undefined) trimmedCount++;
        }
      }

      // Soft-delete: we DO NOT hard-delete. Just warn — the user can manually remove
      // missing scenes inside the composer if they truly want them gone.
      // (Hard-delete here would risk silent data loss.)
      const deletedSoft = deleted.length;
      if (deletedSoft > 0) {
        warnings.push(
          `${deletedSoft} scene(s) missing from FCPXML — left untouched (no auto-delete). Remove manually if intended.`,
        );
      }

      applied = { reordered: reorderedCount, trimmed: trimmedCount, deletedSoft };
    }

    return new Response(
      JSON.stringify({
        success: true,
        diff: result,
        applied,
        summary: {
          reorderedCount: reordered.length,
          trimmedCount: trimmed.length,
          unchangedCount: unchanged.length,
          deletedCount: deleted.length,
          unknownAssetsCount: unknownAssets.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[composer-import-fcpxml] error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
