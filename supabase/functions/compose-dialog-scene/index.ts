/**
 * compose-dialog-scene — Per-turn PARALLEL Sync.so dispatcher (v4).
 *
 * Design (v4, May 2026):
 *  - Treats `audio_plan.twoshot.speakers[*].voicedRange.turns[]` as a flat,
 *    time-ordered list of speaker turns.
 *  - Each turn = ONE Sync.so lipsync-2-pro pass on the ORIGINAL pristine
 *    master plate (no chaining). Tight single-window `segments_secs=[[t]]`
 *    + identity-matched face coordinates from cached
 *    `audio_plan.twoshot.faceMap` + per-turn temperature (1.0 if <2s, else 0.9).
 *  - All passes run IN PARALLEL in `poll-dialog-shots`. When all are ready,
 *    the poller stitches them with ffmpeg by time-slicing: window i from
 *    out_T_i, gaps from the pristine master, then remuxes the master WAV.
 *
 * Why v4 beats v3 (per-speaker multi-window):
 *  - v3 gave Sync.so multiple windows in one pass → provider weighted
 *    articulation toward the first/longest window, leaving later sentences
 *    under-animated. v4 gives every turn full Sync.so attention.
 *  - v4 has exactly ONE re-encode generation per pixel (vs v3's chained
 *    Pass-1→Pass-2 softening).
 *  - v4 is faster: passes run in parallel instead of serial.
 *
 * Returns 202 after queueing all shots. `poll-dialog-shots` (pg_cron, 1min)
 * dispatches/polls/stitches.
 */


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { probeImageDims } from "../_shared/image-dims.ts";

// ── v19 Dialog Plate Prompt Constraints ────────────────────────────────
// Free-form scene prompts (low angles, handheld, hands waving, head turning
// away) produce "noodle limb" Hailuo plates that no lipsync can rescue and
// often hide the mouth from Sync.so's face detector entirely. For dialog
// scenes that go through Sync.so we override the framing/motion clauses so
// every speaker stays a clean, locked head-and-shoulders subject.
function buildDialogPlatePromptSuffix(speakerCount: number): string {
  const framing = speakerCount >= 2
    ? "two-shot or three-shot medium close-up, all speakers facing camera, head-and-shoulders framing, eye-line to lens"
    : "medium close-up, head-and-shoulders framing, eye-line to lens";
  return [
    `Cinematic dialog plate: ${framing}.`,
    "Locked-off camera, no handheld shake, no dolly, no orbit, no zoom.",
    "Subtle natural micro-motion only — relaxed posture, no head turn away from camera, mouths visible at all times, no occlusion of the face.",
    "Hands relaxed at sides or out of frame, no waving, no pointing, no overlapping arms, no rapid body movement, no exaggerated gestures.",
    "Photo-realistic skin texture, natural lighting, no on-screen text, no captions, no subtitles, no watermarks, no logos.",
  ].join(" ");
}


// ── FaceMap helpers (ported from compose-twoshot-lipsync) ──────────────
// The dialog pipeline needs per-character pixel-space face coordinates so
// every Sync.so turn lands on the correct mouth. Older anchors only have an
// `anchor_face_audit` (counts/identity ok), but no positional faceMap. We
// build one on the fly from the pinned anchor image when missing.

interface FaceMapFace {
  side: "left" | "right";
  center: [number, number];
  bbox?: [number, number, number, number];
  normCenter?: [number, number];
  characterId?: string | null;
  matchConfidence?: number;
  matchSource?: "gemini-identity" | "gemini-inferred" | "unresolved";
}
interface FaceMap {
  faces: FaceMapFace[];
  width: number;
  height: number;
  source: "cache" | "anchor" | "auto-rebuilt";
}

async function resolveCharacterPortraits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  characterIds: string[],
): Promise<Array<{ characterId: string; portraitUrl: string }>> {
  const uniq = Array.from(
    new Set(characterIds.map((s) => String(s).toLowerCase().trim()).filter(Boolean)),
  );
  if (!uniq.length) return [];
  try {
    const { data, error } = await supabase
      .from("brand_characters")
      .select("name, portrait_url, reference_image_url, user_id, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error || !Array.isArray(data)) return [];
    const out: Array<{ characterId: string; portraitUrl: string }> = [];
    for (const id of uniq) {
      const row = (data as any[]).find((r) => {
        const slug = String(r?.name ?? "")
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "-");
        return slug === id;
      });
      if (!row) continue;
      const url = String(row.portrait_url || row.reference_image_url || "").trim();
      if (url) out.push({ characterId: id, portraitUrl: url });
    }
    return out;
  } catch {
    return [];
  }
}

async function askGeminiForFaces(
  url: string,
  lovableKey: string,
): Promise<{ faces: any[] } | null> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "You see a multi-shot frame with one or more human faces. " +
                  "Return STRICT JSON only — no prose, no markdown fences. " +
                  'Schema: {"faces": [{"side": "left"|"right", "center": [nx,ny], "bbox": [nx1,ny1,nx2,ny2]}]}. ' +
                  "Coordinates MUST be NORMALIZED to 0..1 (0,0 = top-left, 1,1 = bottom-right). " +
                  "Sort by horizontal position: smallest x = left.",
              },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return { faces: Array.isArray(parsed?.faces) ? parsed.faces : [] };
  } catch {
    return null;
  }
}

async function askGeminiForIdentityMatch(
  anchorUrl: string,
  characters: Array<{ characterId: string; portraitUrl: string }>,
  lovableKey: string,
): Promise<{ left?: string | null; right?: string | null } | null> {
  if (!characters.length) return null;
  try {
    const ids = characters.map((c) => c.characterId);
    const content: any[] = [
      {
        type: "text",
        text:
          "The FIRST image is a two-shot scene (one person on the LEFT, one on the RIGHT). " +
          "Remaining images are reference portraits in order: " +
          ids.map((id, i) => `(${i + 1}) ${id}`).join(", ") + ". " +
          "Identify which portrait matches the LEFT and RIGHT person by facial identity. " +
          'Return STRICT JSON only: {"left":"<id or null>","right":"<id or null>"}. ' +
          "Allowed ids: " + ids.join(", ") + ".",
      },
      { type: "image_url", image_url: { url: anchorUrl } },
      ...characters.map((c) => ({ type: "image_url", image_url: { url: c.portraitUrl } })),
    ];
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const allowed = new Set(ids.map((id) => id.toLowerCase()));
    const sanitize = (v: any): string | null => {
      const s = v ? String(v).toLowerCase().trim() : "";
      return s && allowed.has(s) ? s : null;
    };
    return { left: sanitize(parsed?.left), right: sanitize(parsed?.right) };
  } catch {
    return null;
  }
}

async function buildFaceMapFromAnchor(
  supabase: ReturnType<typeof createClient>,
  sceneId: string,
  anchorUrl: string,
  characters: Array<{ characterId: string; portraitUrl: string }>,
  lovableKey: string,
): Promise<FaceMap | null> {
  const dims = (await probeImageDims(anchorUrl)) ?? { width: 1280, height: 720 };
  const raw = await askGeminiForFaces(anchorUrl, lovableKey);
  if (!raw || !Array.isArray(raw.faces) || raw.faces.length < 1) return null;

  const W = dims.width;
  const H = dims.height;
  const toPx = (n: number, axis: "x" | "y") => {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    const isNorm = Math.abs(v) <= 1.5;
    const scaled = isNorm ? v * (axis === "x" ? W : H) : v;
    const max = axis === "x" ? W : H;
    return Math.round(Math.max(1, Math.min(max - 1, scaled)));
  };
  let faces: FaceMapFace[] = raw.faces
    .filter((f: any) => Array.isArray(f?.center) && f.center.length === 2)
    .map((f: any) => {
      const cx = toPx(f.center[0], "x");
      const cy = toPx(f.center[1], "y");
      const bb = Array.isArray(f.bbox) && f.bbox.length === 4
        ? [toPx(f.bbox[0], "x"), toPx(f.bbox[1], "y"), toPx(f.bbox[2], "x"), toPx(f.bbox[3], "y")] as [
          number, number, number, number,
        ]
        : undefined;
      return {
        center: [cx, cy] as [number, number],
        bbox: bb,
        normCenter: [Number(f.center[0]) || 0, Number(f.center[1]) || 0] as [number, number],
        side: "left" as const,
      };
    })
    .sort((a, b) => a.center[0] - b.center[0])
    .map((f, idx, arr) => ({
      ...f,
      side: (arr.length === 1 ? "left" : idx === 0 ? "left" : "right") as "left" | "right",
    }));

  if (characters.length >= 2 && faces.length >= 2) {
    const identity = await askGeminiForIdentityMatch(anchorUrl, characters, lovableKey);
    if (identity) {
      faces = faces.map((f) => {
        if (f.side === "left" && identity.left) {
          return { ...f, characterId: identity.left, matchConfidence: 0.9, matchSource: "gemini-identity" };
        }
        if (f.side === "right" && identity.right) {
          return { ...f, characterId: identity.right, matchConfidence: 0.9, matchSource: "gemini-identity" };
        }
        return { ...f, matchSource: "unresolved" as const };
      });
      const ids = characters.map((c) => c.characterId);
      const assigned = new Set(faces.map((f) => f.characterId).filter(Boolean) as string[]);
      const missing = ids.filter((id) => !assigned.has(id));
      if (missing.length === 1) {
        faces = faces.map((f) =>
          f.characterId
            ? f
            : { ...f, characterId: missing[0], matchConfidence: 0.5, matchSource: "gemini-inferred" },
        );
      }
    }
  } else if (characters.length === 1 && faces.length >= 1) {
    faces = faces.map((f, i) => (i === 0 ? { ...f, characterId: characters[0].characterId, matchSource: "gemini-inferred" } : f));
  }

  const result: FaceMap = { faces, width: W, height: H, source: "auto-rebuilt" };
  // Persist into audio_plan.twoshot.faceMap so retries skip Gemini.
  try {
    const { data: row } = await supabase
      .from("composer_scenes")
      .select("audio_plan")
      .eq("id", sceneId)
      .single();
    const prevPlan = ((row as any)?.audio_plan ?? {}) as Record<string, any>;
    const prevTwoshot = ((prevPlan as any).twoshot ?? {}) as Record<string, any>;
    await supabase
      .from("composer_scenes")
      .update({
        audio_plan: {
          ...prevPlan,
          twoshot: {
            ...prevTwoshot,
            faceMap: {
              faces: result.faces,
              width: result.width,
              height: result.height,
              source: result.source,
            },
          },
        },
      })
      .eq("id", sceneId);
  } catch {
    // best-effort
  }
  return result;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

// Sync.so lipsync-2-pro pricing: 9 credits per second per pass.
// Min 9 credits per turn (covers <1s utterances). One pass per turn.
const LIPSYNC_CREDITS_PER_SEC = 9;
const LIPSYNC_MIN_CREDITS = 9;
const MIN_TURN_DUR_SEC = 0.4;

const computeTurnCost = (durSec: number) =>
  Math.max(LIPSYNC_MIN_CREDITS, Math.ceil(Math.max(0, durSec)) * LIPSYNC_CREDITS_PER_SEC);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Turn {
  startSec: number;
  endSec: number;
}
interface TwoshotSpeaker {
  speaker?: string;
  character_id?: string | null;
  voicedRange?: { turns?: Turn[]; startSec?: number; endSec?: number };
}

/**
 * v4 SHOT MODEL — one Sync.so pass per TURN, ALL passes run in PARALLEL
 * on the SAME pristine master plate. No chaining → no cumulative re-encode
 * softening. Each turn gets full Sync.so attention (single-window pass)
 * with its own per-turn temperature → equally strong mouth animation on
 * every sentence, including 2nd/3rd lines of the same speaker.
 *
 * The poller stitches all per-turn outputs together with ffmpeg by
 * time-slicing: window i from out_T_i, gaps from the pristine master.
 */
interface DialogShot {
  idx: number;
  speaker_idx: number;
  speaker_name: string;
  character_id: string | null;
  /** Single time window for THIS turn. */
  window: [number, number];
  /** Window duration (seconds). Used for pricing and temperature. */
  durSec: number;
  /** Sync.so coords [x, y] in master-plate pixel space. */
  target_coords: [number, number] | null;
  /** v21: optional bbox [x1,y1,x2,y2] of the speaker's face in master-plate
   *  pixel space. Used by render-dialog-turn to compute a tight face-crop
   *  preclip so Sync.so sees ONE face on 3+ speaker scenes. */
  target_bbox?: [number, number, number, number] | null;
  /** Per-turn temperature: short turns (<2s) get 1.0 for max articulation. */
  temperature: number;
  /** v7: ISOLATED per-speaker audio (only this speaker's voice + silence
   *  elsewhere). Falls back to merged master WAV only for single-speaker. */
  audio_url: string;
  /** v7: when true (multi-speaker scenes), poll-dialog-shots MUST use
   *  deterministic coords + frame_number, not auto_detect. */
  deterministic_coords: boolean;
  status: "pending" | "lipsyncing" | "ready" | "failed";
  sync_job_id?: string;
  /** Output URL of THIS turn's Sync.so pass (full-length MP4 with only this window animated). */
  output_url?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

interface DialogShotsState {
  /** v5 = v4 + per-shot `target_bbox` + `preclip_crop` (face-region preclip
   *  path for 3+ speaker scenes).
   *  v4 = per-turn parallel passes + ffmpeg time-slice stitch.
   *  v3 = per-speaker multi-window passes (legacy, ignored by poller).
   *  v2 = per-turn chained passes (legacy, ignored by poller). */
  version: 5;
  status: "queued" | "lipsyncing" | "stitching" | "done" | "failed";
  /** Per-turn passes, ordered by window start. */
  shots: DialogShot[];
  /** Stable reference back to the original Hailuo master plate. */
  source_clip_url: string;
  /** Master audio WAV. Sent in full to every pass; remuxed into the final stitched clip. */
  master_audio_url: string;
  total_sec: number;
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  video_width: number;
  video_height: number;
  /** Final stitched output URL. */
  final_url?: string | null;
  finished_at?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { scene_id: sceneId } = await req.json().catch(() => ({}));
    if (!sceneId || typeof sceneId !== "string") {
      return json({ error: "scene_id_required" }, 400);
    }

    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, audio_plan, dialog_shots, clip_url, lip_sync_source_clip_url, lip_sync_applied_at, reference_image_url, clip_source, engine_override, dialog_script, ai_prompt, duration_seconds, clip_quality",
      )
      .eq("id", sceneId)
      .single();
    if (sceneErr || !scene) {
      return json({ error: "scene_not_found", details: sceneErr?.message }, 404);
    }

    const { data: project } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", scene.project_id)
      .single();
    const userId = project?.user_id;
    if (!userId) return json({ error: "missing_user" }, 403);

    // ─── STAGE 2 HOTFIX (May 2026): retroactive HappyHorse-master guard ────
    // Only invalidate when the master plate is NOT yet a usable rendered clip.
    // If clip_url already exists and clip_status='ready', the master was either
    // (a) a successful Hailuo regen whose clip_source label is just stale, or
    // (b) the user explicitly wants to lipsync the existing master. In both
    // cases we must NOT throw it away — that caused the "render never finishes"
    // loop where every webhook auto-trigger nuked the freshly finished clip.
    {
      const cs = String((scene as any).clip_source ?? "");
      const eo = String((scene as any).engine_override ?? "auto");
      const hasReadyClip =
        !!(scene as any).clip_url &&
        String((scene as any).clip_url).length > 0;
      if (cs === "ai-happyhorse" && eo === "cinematic-sync" && !hasReadyClip) {
        const dlg = String((scene as any).dialog_script ?? "");
        const speakerNames = new Set(
          dlg
            .split(/\r?\n/)
            .map((l) => l.match(/^\s*\[?([A-Za-zÀ-ÿ][\w\s.'-]{0,40}?)\]?\s*[:：]/))
            .filter((m): m is RegExpMatchArray => !!m)
            .map((m) => m[1].trim().toLowerCase()),
        );
        if (speakerNames.size >= 2) {
          console.warn(
            `[compose-dialog-scene] scene ${sceneId}: HappyHorse + cinematic-sync + ${speakerNames.size} speakers, no ready master — re-rendering with ai-hailuo (Stage 2 hotfix).`,
          );
          await supabase
            .from("composer_scenes")
            .update({
              clip_source: "ai-hailuo",
              clip_url: null,
              clip_status: "pending",
              clip_error: null,
              reference_image_url: null,
              dialog_shots: null,
              lip_sync_status: null,
              lip_sync_applied_at: null,
              lip_sync_source_clip_url: null,
              twoshot_stage: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sceneId);

          const baseAi = String((scene as any).ai_prompt ?? "").trim();
          const dialogSuffix = buildDialogPlatePromptSuffix(speakerNames.size);
          const constrainedAi = baseAi
            ? `${baseAi}\n\n${dialogSuffix}`
            : dialogSuffix;
          const clipsPayload = {
            projectId: scene.project_id,
            scenes: [
              {
                id: sceneId,
                clipSource: "ai-hailuo",
                clipQuality: (scene as any).clip_quality ?? "standard",
                aiPrompt: constrainedAi,
                durationSeconds: Number((scene as any).duration_seconds ?? 6),
              },
            ],
          };

          try {
            fetch(`${supabaseUrl}/functions/v1/compose-video-clips`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify(clipsPayload),
            }).catch((e) => {
              console.warn(
                `[compose-dialog-scene] scene ${sceneId}: compose-video-clips re-invoke failed:`,
                (e as Error).message,
              );
            });
          } catch (e) {
            console.warn(
              `[compose-dialog-scene] scene ${sceneId}: compose-video-clips dispatch threw:`,
              (e as Error).message,
            );
          }

          return json(
            {
              ok: true,
              status: "master_regenerated_for_lipsync_stability",
              scene_id: sceneId,
              message:
                "HappyHorse master is not viable for 2+ speaker lip-sync. Master is being re-rendered with Hailuo; lip-sync will start automatically when the new master is ready.",
            },
            202,
          );
        }
      }
      // If the master is already a ready clip but clip_source is still the
      // legacy HappyHorse label, silently normalize it to ai-hailuo so future
      // sweeps and the UI don't misclassify it.
      if (cs === "ai-happyhorse" && hasReadyClip) {
        await supabase
          .from("composer_scenes")
          .update({ clip_source: "ai-hailuo", updated_at: new Date().toISOString() })
          .eq("id", sceneId);
        (scene as any).clip_source = "ai-hailuo";
      }
    }


    const plan = ((scene as any).audio_plan ?? {}) as Record<string, any>;
    let twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    let speakers = Array.isArray(twoshot.speakers)
      ? (twoshot.speakers as TwoshotSpeaker[])
      : [];
    let masterAudioUrl = String(twoshot.url ?? "");
    const totalSec = Number(twoshot.totalSec ?? 0);
    const faceMap = (twoshot.faceMap ?? null) as {
      faces?: Array<{
        center?: [number, number];
        characterId?: string | null;
        side?: "left" | "right";
      }>;
      width?: number;
      height?: number;
    } | null;

    if (!masterAudioUrl || speakers.length === 0 || totalSec <= 0) {
      return json(
        {
          error: "missing_audio_plan",
          message:
            "Cinematic-Sync requires compose-twoshot-audio output (master WAV + speakers[].voicedRange.turns[]).",
        },
        422,
      );
    }

    // ── v8 staleness guard: detect the per-speaker-track bug ────────────
    // Older `compose-twoshot-audio` builds aligned `sampleBuffers[i]` to the
    // segment index, but `sampleBuffers` also contained inter-speaker
    // pause-silence between utterances. The result was that the 2nd
    // speaker's `track_url` contained the 0.25s pause as its only audio,
    // and the 3rd speaker's track contained the 2nd speaker's PCM. Sync.so
    // then animated the wrong face or no face at all → "ghost speech".
    //
    // Heuristic: a speaker whose script turns sum to ≥ TURN_DUR seconds but
    // whose `voicedRange.voicedSec` is < ~0.4s is almost certainly a victim
    // of the old bug. Regenerate audio (force_regenerate=true) before
    // spending any Sync.so credits on broken tracks.
    const STALE_VOICED_THRESHOLD = 0.4;
    const stalePerSpeakerTrack = speakers.some((sp) => {
      const turns = Array.isArray(sp.voicedRange?.turns) ? sp.voicedRange!.turns! : [];
      const turnSum = turns.reduce(
        (s, t) => s + Math.max(0, Number(t.endSec) - Number(t.startSec)),
        0,
      );
      const voiced = Number((sp as any)?.voicedRange?.voicedSec) || 0;
      return turnSum >= 0.6 && voiced > 0 && voiced < STALE_VOICED_THRESHOLD;
    });
    if (stalePerSpeakerTrack) {
      console.warn(
        `[compose-dialog-scene] scene ${sceneId} has stale per-speaker tracks ` +
          `(voicedSec << turn duration) — regenerating audio before Sync.so dispatch.`,
      );
      try {
        const regen = await fetch(`${supabaseUrl}/functions/v1/compose-twoshot-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ scene_id: sceneId, force_regenerate: true }),
        });
        if (!regen.ok) {
          const t = await regen.text().catch(() => "");
          console.error(
            `[compose-dialog-scene] audio regeneration failed status=${regen.status} body=${t.slice(0, 300)}`,
          );
        }
      } catch (e) {
        console.error(
          `[compose-dialog-scene] audio regeneration crashed: ${(e as Error)?.message}`,
        );
      }
      // Reload the scene so we use the freshly built audio_plan.
      const { data: refreshed } = await supabase
        .from("composer_scenes")
        .select("audio_plan")
        .eq("id", sceneId)
        .single();
      if (refreshed?.audio_plan) {
        const freshPlan = refreshed.audio_plan as any;
        const fresh = freshPlan?.twoshot;
        if (fresh?.url && Array.isArray(fresh.speakers)) {
          (plan as any).twoshot = fresh;
          twoshot = fresh;
          speakers = fresh.speakers as TwoshotSpeaker[];
          masterAudioUrl = String(fresh.url ?? "");
        }
      }
    }

    const sourceClipUrl =
      (scene as any).lip_sync_source_clip_url || (scene as any).clip_url || null;
    if (!sourceClipUrl) {
      return json(
        { error: "missing_source_clip", message: "Scene has no master plate to lipsync onto." },
        422,
      );
    }

    // Idempotency: if a fresh, non-failed dialog_shots state exists, just
    // nudge the poller.
    const existing = (scene as any).dialog_shots as DialogShotsState | null;
    if (
      existing &&
      existing.status &&
      !["failed", "done"].includes(String(existing.status))
    ) {
      const resume = async () => {
        try {
          await fetch(`${supabaseUrl}/functions/v1/poll-dialog-shots`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ scene_id: sceneId }),
          });
        } catch (e) {
          console.warn("[compose-dialog-scene] resume failed", e);
        }
      };
      // @ts-expect-error EdgeRuntime is global in Supabase functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-expect-error
        EdgeRuntime.waitUntil(resume());
      }
      return json({ ok: true, status: "resumed", scene_id: sceneId }, 202);
    }

    // ── Build per-turn shot list ────────────────────────────────────────
    const buildCoordsMap = (fm: typeof faceMap) => {
      const m = new Map<string, [number, number]>();
      if (fm?.faces?.length) {
        for (const f of fm.faces) {
          const cid = String(f.characterId ?? "").toLowerCase();
          if (cid && Array.isArray(f.center) && f.center.length === 2) {
            m.set(cid, [Number(f.center[0]), Number(f.center[1])]);
          }
        }
      }
      return m;
    };

    let workingFaceMap: any = faceMap;
    let coordsByCharId = buildCoordsMap(workingFaceMap);

    const distinctCharIds = Array.from(
      new Set(
        speakers
          .map((sp) => String(sp.character_id ?? "").toLowerCase())
          .filter(Boolean),
      ),
    );
    const needsRebuild =
      distinctCharIds.length >= 1 &&
      distinctCharIds.some((id) => !coordsByCharId.has(id));

    if (needsRebuild) {
      const anchorUrl =
        (scene as any).reference_image_url || sourceClipUrl || null;
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (anchorUrl && lovableKey && /\.(png|jpe?g|webp)(\?|$)/i.test(String(anchorUrl))) {
        console.log(
          `[compose-dialog-scene] faceMap missing/incomplete — auto-rebuilding from anchor (${distinctCharIds.length} speakers)`,
        );
        const portraits = await resolveCharacterPortraits(supabase, userId, distinctCharIds);
        const rebuilt = await buildFaceMapFromAnchor(
          supabase,
          sceneId,
          String(anchorUrl),
          portraits,
          lovableKey,
        );
        if (rebuilt) {
          workingFaceMap = rebuilt;
          coordsByCharId = buildCoordsMap(rebuilt);
          console.log(
            `[compose-dialog-scene] faceMap rebuilt: ${rebuilt.faces.length} faces, identities=${rebuilt.faces.map((f) => f.characterId ?? "?").join(",")}`,
          );
        } else {
          console.warn(
            `[compose-dialog-scene] auto-rebuild returned null (anchor=${String(anchorUrl).slice(0, 80)} portraits=${portraits.length}/${distinctCharIds.length})`,
          );
        }
      } else {
        console.warn(
          `[compose-dialog-scene] cannot auto-rebuild faceMap (anchor=${!!anchorUrl} key=${!!lovableKey})`,
        );
      }
    }

    const videoW = Number(workingFaceMap?.width) || 1280;
    const videoH = Number(workingFaceMap?.height) || 720;

    // ── Build per-TURN shot list (v4) ───────────────────────────────────
    // One Sync.so pass per turn. All passes run in PARALLEL on the SAME
    // pristine master plate. The poller stitches per-turn outputs by
    // time-slicing (window i from out_T_i, gaps from master). Result:
    // every sentence gets full Sync.so attention with no cumulative
    // re-encode softening.
    interface RawTurn {
      speaker_idx: number;
      speaker_name: string;
      character_id: string | null;
      start: number;
      end: number;
      audio_url: string;
    }
    const rawTurns: RawTurn[] = [];
    speakers.forEach((sp, sIdx) => {
      const turns = Array.isArray(sp.voicedRange?.turns)
        ? sp.voicedRange!.turns!
        : sp.voicedRange?.startSec != null && sp.voicedRange?.endSec != null
          ? [{ startSec: sp.voicedRange.startSec, endSec: sp.voicedRange.endSec }]
          : [];
      if (turns.length === 0) return;
      const charId = String(sp.character_id ?? "").toLowerCase() || null;
      const speakerName = String(sp.speaker ?? `Speaker ${sIdx + 1}`);
      // v7: prefer per-speaker isolated WAV (`track_url`) so each Sync.so
      // job only sees ONE voice. The merged master WAV used to bleed other
      // speakers into a turn's audio, which made Sync.so animate the wrong
      // face and produced "ghost speech" on silent turns.
      const speakerAudio =
        String((sp as any).track_url ?? "").trim() || masterAudioUrl;
      for (const t of turns) {
        const start = Number(t.startSec);
        const end = Math.max(start + MIN_TURN_DUR_SEC, Number(t.endSec));
        rawTurns.push({
          speaker_idx: sIdx,
          speaker_name: speakerName,
          character_id: charId,
          start,
          end,
          audio_url: speakerAudio,
        });
      }
    });

    // Pre-compute multi-speaker flag so every shot knows whether to force
    // deterministic coords (mandatory) or may fall back to auto_detect
    // (single-speaker only).
    const distinctSpeakerCount = new Set(rawTurns.map((t) => t.speaker_idx)).size;
    const requireDeterministic = distinctSpeakerCount >= 2;

    const rawShots: DialogShot[] = rawTurns
      .sort((a, b) => a.start - b.start)
      .map((t, i) => {
        const dur = t.end - t.start;
        const coords = t.character_id
          ? coordsByCharId.get(t.character_id) ?? null
          : null;
        return {
          idx: i,
          speaker_idx: t.speaker_idx,
          speaker_name: t.speaker_name,
          character_id: t.character_id,
          window: [t.start, t.end] as [number, number],
          durSec: dur,
          target_coords: coords,
          temperature: dur < 2.0 ? 1.0 : 0.9,
          audio_url: t.audio_url,
          deterministic_coords: requireDeterministic && !!coords,
          status: "pending",
        };
      });

    if (rawShots.length === 0) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_no_turns",
        })
        .eq("id", sceneId);
      return json(
        { error: "no_turns", message: "No speaker turns found in audio_plan.twoshot." },
        422,
      );
    }


    // Identity coverage check: every multi-speaker shot MUST have a coord.
    // Single-speaker scenes can fall back to Sync.so auto_detect safely.
    //
    // STAGE 1 RESILIENCE (May 2026): if identity-based mapping fails but we
    // have ≥N face coordinates from the anchor, fall back to **positional
    // assignment** by script-appearance order — the anchor was composed with
    // portraits in script order, so leftmost face ≈ first speaker, next ≈
    // second, etc. This prevents the `dialog_missing_face_coords` hard-stop
    // from blocking otherwise-valid two-shot scenes whenever Gemini Vision
    // returns ambiguous identity matches.
    const distinctSpeakerIdxs = new Set(rawShots.map((s) => s.speaker_idx));
    if (distinctSpeakerIdxs.size >= 2) {
      let missing = rawShots.filter((s) => !s.target_coords);
      if (missing.length > 0) {
        const faces = Array.isArray(workingFaceMap?.faces) ? workingFaceMap!.faces : [];
        const sortedFaces = [...faces]
          .filter((f: any) => Array.isArray(f?.center) && f.center.length === 2)
          .sort((a: any, b: any) => Number(a.center[0]) - Number(b.center[0]));
        if (sortedFaces.length >= distinctSpeakerIdxs.size) {
          // Build positional map: script-appearance order → leftmost-first face
          const appearanceOrder: string[] = [];
          for (const s of rawShots) {
            const key = String(s.character_id ?? `__spk_${s.speaker_idx}`).toLowerCase();
            if (!appearanceOrder.includes(key)) appearanceOrder.push(key);
          }
          const positional = new Map<string, [number, number]>();
          appearanceOrder.forEach((key, idx) => {
            const f = sortedFaces[idx];
            if (f) positional.set(key, [Number(f.center[0]), Number(f.center[1])]);
          });
          let recovered = 0;
          for (const s of rawShots) {
            if (s.target_coords) continue;
            const key = String(s.character_id ?? `__spk_${s.speaker_idx}`).toLowerCase();
            const c = positional.get(key);
            if (c) {
              s.target_coords = c;
              s.deterministic_coords = true;
              recovered++;
            }
          }
          if (recovered > 0) {
            console.warn(
              `[compose-dialog-scene] scene ${sceneId} positional-fallback recovered ` +
                `${recovered} missing face coords (identity mapping ambiguous, ` +
                `${sortedFaces.length} faces in anchor, ${distinctSpeakerIdxs.size} speakers).`,
            );
          }
          missing = rawShots.filter((s) => !s.target_coords);
        }
      }
      if (missing.length > 0) {
        const missingChars = Array.from(
          new Set(missing.map((m) => m.character_id ?? m.speaker_name)),
        );
        const facesFound = Array.isArray(workingFaceMap?.faces)
          ? workingFaceMap!.faces.length
          : 0;
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "failed",
            twoshot_stage: "needs_clip_rerender",
            clip_error:
              `dialog_missing_face_coords: ${missingChars.join(", ")} — ` +
              `Anchor enthält nur ${facesFound} erkennbare Gesichter für ${distinctSpeakerIdxs.size} Sprecher. ` +
              `Bitte „🎥 Clip + Lip-Sync neu rendern" für eine frische Anchor + Identity-Detection.`,
          })
          .eq("id", sceneId);
        return json(
          {
            error: "missing_face_coords",
            missing: missingChars,
            facesFound,
            next_action: "rerender_clip_and_lipsync",
            hint: "Master-Plate zeigt nicht alle Sprecher — Lip-Sync ist nicht retryable. Bitte Clip + Lip-Sync neu rendern.",
          },
          422,
        );
      }
    }

    // ── Wallet reserve (one cost per turn) ──────────────────────────────
    const totalCost = rawShots.reduce((sum, s) => sum + computeTurnCost(s.durSec), 0);
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();
    if (!wallet || Number(wallet.balance) < totalCost) {
      return json(
        {
          error: "INSUFFICIENT_CREDITS",
          required: totalCost,
          have: wallet?.balance ?? 0,
          message: `Dialog-Pipeline benötigt ${totalCost} Credits (${rawShots.length} Turns × ~${LIPSYNC_CREDITS_PER_SEC} cr/s).`,
        },
        402,
      );
    }
    await supabase
      .from("wallets")
      .update({
        balance: Number(wallet.balance) - totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    const nowIso = new Date().toISOString();
    const state: DialogShotsState = {
      version: 5,
      status: "queued",
      shots: rawShots,
      source_clip_url: sourceClipUrl,
      master_audio_url: masterAudioUrl,
      total_sec: totalSec,
      cost_credits: totalCost,
      refunded: false,
      started_at: nowIso,
      video_width: videoW,
      video_height: videoH,
      final_url: null,
    };

    // Strip legacy two-shot state so we don't mix with old syncJobs/heartbeat
    const cleanPlan = { ...plan };
    if (cleanPlan.twoshot && typeof cleanPlan.twoshot === "object") {
      const ts = { ...(cleanPlan.twoshot as Record<string, any>) };
      delete ts.syncJobs;
      delete ts.heartbeat;
      delete ts.diagnostics;
      // Keep faceMap! We need it for chained passes.
      cleanPlan.twoshot = ts;
    }

    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: state,
        audio_plan: cleanPlan,
        replicate_prediction_id: null,
        lip_sync_status: "running",
        twoshot_stage: "dialog_chain",
        lip_sync_source_clip_url: sourceClipUrl,
        clip_error: null,
        updated_at: nowIso,
      })
      .eq("id", sceneId);

    // Kick the poller immediately so turn 0 dispatches on this request,
    // not 1min later from pg_cron.
    const kick = async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/poll-dialog-shots`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ scene_id: sceneId }),
        });
      } catch (e) {
        console.warn("[compose-dialog-scene] poller kick failed", e);
      }
    };
    // @ts-expect-error EdgeRuntime global
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-expect-error
      EdgeRuntime.waitUntil(kick());
    } else {
      kick();
    }

    return json(
      {
        ok: true,
        status: "queued",
        scene_id: sceneId,
        turns: rawShots.length,
        cost_credits: totalCost,
      },
      202,
    );
  } catch (e) {
    console.error("[compose-dialog-scene] error", e);
    return json(
      { error: e instanceof Error ? e.message : "unknown" },
      500,
    );
  }
});
