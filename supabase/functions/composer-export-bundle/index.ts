// composer-export-bundle v1.0.0
// Packs sequence.fcpxml + sequence.edl + all media assets + README into a ZIP,
// uploads to composer-nle-exports, returns a signed download URL.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import JSZip from "https://esm.sh/jszip@3.10.1";
import {
  buildBundleReadme,
  buildEDL,
  buildFCPXML,
  type NLEAudio,
  type NLEProject,
  type NLEScene,
} from "../_shared/nle-export.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

const RESOLUTIONS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
  "4:3": { w: 1440, h: 1080 },
};

const MAX_BUNDLE_BYTES = 500 * 1024 * 1024; // 500 MB hard limit
const FETCH_TIMEOUT_MS = 60_000;

interface ReqBody {
  projectId: string;
  fps?: number;
}

async function fetchAsBytes(url: string): Promise<Uint8Array | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      console.warn(`[bundle] fetch ${url} → ${res.status}`);
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    console.warn(`[bundle] fetch ${url} failed:`, (e as Error).message);
    return null;
  }
}

const extFromUrl = (url: string, fallback: string) => {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-zA-Z0-9]{2,5})$/);
    return m ? m[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const body = (await req.json()) as ReqBody;
    if (!body.projectId) throw new Error("projectId required");

    const requestedFps = body.fps ?? 30;
    const fps = ([24, 30, 60].includes(requestedFps) ? requestedFps : 30) as 24 | 30 | 60;

    // ---- Fetch project + ownership ----
    const { data: project, error: pErr } = await supabase
      .from("composer_projects")
      .select("id, user_id, title, assembly_config, briefing")
      .eq("id", body.projectId)
      .single();
    if (pErr || !project) throw new Error("Project not found");
    if (project.user_id !== user.id) throw new Error("Not owned by user");

    const { data: scenes } = await supabase
      .from("composer_scenes")
      .select("id, order_index, duration_seconds, clip_url, upload_url, scene_type")
      .eq("project_id", body.projectId)
      .order("order_index", { ascending: true });

    const warnings: string[] = [];
    const nleScenes: NLEScene[] = (scenes ?? []).map((s: any, idx: number) => {
      const url = s.clip_url || s.upload_url || null;
      if (!url) warnings.push(`Scene ${s.order_index ?? idx}: no clip — skipped`);
      return {
        id: s.id,
        order_index: s.order_index ?? idx,
        duration_seconds: Number(s.duration_seconds ?? 5),
        videoUrl: url,
        name: s.scene_type ? `${s.scene_type}_${(s.order_index ?? idx) + 1}` : undefined,
      };
    });

    const usableScenes = nleScenes.filter((s) => s.videoUrl);
    if (usableScenes.length === 0) throw new Error("No scenes with usable clips");

    const briefing = (project.briefing as any) ?? {};
    const aspect = (briefing.aspectRatio as string) ?? "16:9";
    const res = RESOLUTIONS[aspect] ?? RESOLUTIONS["16:9"];

    const ac = (project.assembly_config as any) ?? {};
    const totalDur = nleScenes.reduce((s, x) => s + x.duration_seconds, 0);
    const audio: NLEAudio[] = [];
    if (ac.voiceover?.audioUrl) {
      audio.push({
        laneIndex: 1,
        url: ac.voiceover.audioUrl,
        name: ac.voiceover.voiceName ? `voiceover-${ac.voiceover.voiceName}` : "voiceover",
        durationSeconds: ac.voiceover.durationSeconds || totalDur,
      });
    }
    if (ac.music?.trackUrl) {
      audio.push({
        laneIndex: 2,
        url: ac.music.trackUrl,
        name: ac.music.trackName || "music",
        durationSeconds: totalDur,
      });
    }
    if (ac.globalTextOverlays?.length) {
      warnings.push(
        `${ac.globalTextOverlays.length} text overlay(s) exported as static text only.`,
      );
    }
    if (ac.colorGrading && ac.colorGrading !== "none") {
      warnings.push(`Color grading "${ac.colorGrading}" must be re-applied in your NLE.`);
    }

    const nleProject: NLEProject = {
      id: project.id,
      title: project.title || "Composer Project",
      fps,
      width: res.w,
      height: res.h,
      scenes: nleScenes,
      audio,
    };

    // ---- Build bundle ----
    const zip = new JSZip();

    // 1. Sequence files
    zip.file("sequence.fcpxml", buildFCPXML(nleProject));
    zip.file("sequence.edl", buildEDL(nleProject));

    // 2. Clips (parallelize fetch with cap)
    const clipsFolder = zip.folder("clips")!;
    let totalSize = 0;
    for (let i = 0; i < usableScenes.length; i++) {
      const sc = usableScenes[i];
      const ext = extFromUrl(sc.videoUrl!, "mp4");
      const bytes = await fetchAsBytes(sc.videoUrl!);
      if (!bytes) {
        warnings.push(`Scene ${sc.order_index}: clip download failed — placeholder used`);
        clipsFolder.file(
          `scene_${(i + 1).toString().padStart(3, "0")}_MISSING.txt`,
          `Original URL: ${sc.videoUrl}\nDownload failed at export time.`,
        );
        continue;
      }
      totalSize += bytes.byteLength;
      if (totalSize > MAX_BUNDLE_BYTES) {
        throw new Error(
          `Bundle exceeds 500 MB limit — use FCPXML export and download clips manually.`,
        );
      }
      clipsFolder.file(`scene_${(i + 1).toString().padStart(3, "0")}.${ext}`, bytes);
    }

    // 3. Audio
    if (audio.length > 0) {
      const audioFolder = zip.folder("audio")!;
      for (const a of audio) {
        const ext = extFromUrl(a.url, "mp3");
        const bytes = await fetchAsBytes(a.url);
        if (!bytes) {
          warnings.push(`Audio "${a.name}" download failed`);
          continue;
        }
        totalSize += bytes.byteLength;
        if (totalSize > MAX_BUNDLE_BYTES) {
          throw new Error(`Bundle exceeds 500 MB limit.`);
        }
        audioFolder.file(`${a.name.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`, bytes);
      }
    }

    // 4. README
    zip.file("README.md", buildBundleReadme(nleProject, warnings));

    // ---- Generate + upload ----
    const zipBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    if (zipBytes.byteLength > MAX_BUNDLE_BYTES) {
      throw new Error("Bundle ZIP exceeds 500 MB after compression.");
    }

    const ts = Date.now();
    const storagePath = `${user.id}/${body.projectId}/bundle-${ts}.zip`;
    const { error: upErr } = await supabase.storage
      .from("composer-nle-exports")
      .upload(storagePath, zipBytes, {
        contentType: "application/zip",
        upsert: true,
      });
    if (upErr) throw new Error(`ZIP upload failed: ${upErr.message}`);

    const { data: exportRow, error: insErr } = await supabase
      .from("composer_nle_exports")
      .insert({
        user_id: user.id,
        project_id: body.projectId,
        format: "bundle",
        storage_path: storagePath,
        file_size_bytes: zipBytes.byteLength,
        scene_count: nleScenes.length,
        total_duration_sec: totalDur,
        warnings,
      })
      .select("id, expires_at")
      .single();
    if (insErr) throw new Error(`DB insert failed: ${insErr.message}`);

    const { data: signed } = await supabase.storage
      .from("composer-nle-exports")
      .createSignedUrl(storagePath, 3600);

    return new Response(
      JSON.stringify({
        success: true,
        exportId: exportRow!.id,
        downloadUrl: signed?.signedUrl,
        expiresAt: exportRow!.expires_at,
        warnings,
        format: "bundle",
        sizeBytes: zipBytes.byteLength,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[composer-export-bundle] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
