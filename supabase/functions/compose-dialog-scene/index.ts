/**
 * compose-dialog-scene — Per-turn sequential Sync.so chain initiator.
 *
 * Design (May 2026 rewrite):
 *  - Treats `audio_plan.twoshot.speakers[*].voicedRange.turns[]` as a flat,
 *    time-ordered list of speaker turns.
 *  - Each turn = ONE Sync.so lipsync-2-pro pass on the existing master plate
 *    (the two-shot Hailuo clip). Tight `segments_secs=[[t.startSec, t.endSec]]`
 *    + identity-matched face coordinates from cached `audio_plan.twoshot.faceMap`.
 *  - Passes run SEQUENTIALLY in `poll-dialog-shots`: the output of turn N
 *    becomes the video input of turn N+1. The final turn's output is the
 *    new `clip_url`. NO ffmpeg, NO Remotion stitching needed.
 *
 * Why this beats the legacy compose-twoshot-lipsync two-pass-per-speaker:
 *  - Per-turn windows are the tightest possible scope → Sync.so face VAD
 *    has minimum competing audio and animates only one mouth per pass.
 *  - Sequential chaining preserves earlier turns' animation because
 *    `sync_mode='cut_off'` leaves frames outside `segments_secs` untouched.
 *  - Identity-matched coordinates eliminate the "wrong character speaks"
 *    swap that auto_detect produces on multi-window passes.
 *
 * Returns 202 after queueing turn 0. `poll-dialog-shots` (pg_cron, 1min)
 * advances the chain.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { probeImageDims } from "../_shared/image-dims.ts";

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
  /** Per-turn temperature: short turns (<2s) get 1.0 for max articulation. */
  temperature: number;
  status: "pending" | "lipsyncing" | "ready" | "failed";
  sync_job_id?: string;
  /** Output URL of THIS turn's Sync.so pass (full-length MP4 with only this window animated). */
  output_url?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

interface DialogShotsState {
  /** v4 = per-turn parallel passes + ffmpeg time-slice stitch (current).
   *  v3 = per-speaker multi-window passes (legacy, ignored by poller).
   *  v2 = per-turn chained passes (legacy, ignored by poller). */
  version: 4;
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
        "id, project_id, audio_plan, dialog_shots, clip_url, lip_sync_source_clip_url, lip_sync_applied_at, reference_image_url",
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

    const plan = ((scene as any).audio_plan ?? {}) as Record<string, any>;
    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    const speakers = Array.isArray(twoshot.speakers)
      ? (twoshot.speakers as TwoshotSpeaker[])
      : [];
    const masterAudioUrl = String(twoshot.url ?? "");
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

    // ── Build per-SPEAKER shot list (v3) ────────────────────────────────
    // Group all of each speaker's turns into one shot with multi-window
    // segments_secs. This avoids re-encoding the same face multiple times
    // and produces smoother, sharper lipsync across the whole scene.
    interface SpeakerAgg {
      speaker_idx: number;
      speaker_name: string;
      character_id: string | null;
      windows: Array<[number, number]>;
      firstStart: number;
    }
    const agg = new Map<string, SpeakerAgg>();

    speakers.forEach((sp, sIdx) => {
      const turns = Array.isArray(sp.voicedRange?.turns)
        ? sp.voicedRange!.turns!
        : sp.voicedRange?.startSec != null && sp.voicedRange?.endSec != null
          ? [{ startSec: sp.voicedRange.startSec, endSec: sp.voicedRange.endSec }]
          : [];
      if (turns.length === 0) return;
      const charId = String(sp.character_id ?? "").toLowerCase() || null;
      const key = `${sIdx}::${charId ?? sp.speaker ?? ""}`;
      let entry = agg.get(key);
      if (!entry) {
        entry = {
          speaker_idx: sIdx,
          speaker_name: String(sp.speaker ?? `Speaker ${sIdx + 1}`),
          character_id: charId,
          windows: [],
          firstStart: Number.POSITIVE_INFINITY,
        };
        agg.set(key, entry);
      }
      for (const t of turns) {
        const start = Number(t.startSec);
        const end = Math.max(start + MIN_TURN_DUR_SEC, Number(t.endSec));
        entry.windows.push([start, end]);
        if (start < entry.firstStart) entry.firstStart = start;
      }
    });

    const rawShots: DialogSpeakerShot[] = Array.from(agg.values())
      .map((a) => {
        const windows = a.windows.sort((x, y) => x[0] - y[0]);
        const durSec = windows.reduce((s, [a0, a1]) => s + (a1 - a0), 0);
        const minWindow = Math.min(
          ...windows.map(([a0, a1]) => a1 - a0),
          Number.POSITIVE_INFINITY,
        );
        const coords = a.character_id
          ? coordsByCharId.get(a.character_id) ?? null
          : null;
        return {
          idx: 0,
          speaker_idx: a.speaker_idx,
          speaker_name: a.speaker_name,
          character_id: a.character_id,
          windows,
          durSec,
          target_coords: coords,
          temperature: minWindow < 2.0 ? 1.0 : 0.9,
          status: "pending",
          firstStart: a.firstStart,
        } as DialogSpeakerShot & { firstStart: number };
      })
      .sort((a, b) => a.firstStart - b.firstStart)
      .map((s, i) => {
        const { firstStart: _f, ...rest } = s as any;
        return { ...rest, idx: i } as DialogSpeakerShot;
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
    const distinctSpeakerIdxs = new Set(rawShots.map((s) => s.speaker_idx));
    if (distinctSpeakerIdxs.size >= 2) {
      const missing = rawShots.filter((s) => !s.target_coords);
      if (missing.length > 0) {
        const missingChars = Array.from(
          new Set(missing.map((m) => m.character_id ?? m.speaker_name)),
        );
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error:
              `dialog_missing_face_coords: ${missingChars.join(", ")} — Gesichts-Identitäts-Mapping nicht möglich. Bitte „🎥 Clip + Lip-Sync neu rendern" für eine frische Anchor + Identity-Detection.`,
          })
          .eq("id", sceneId);
        return json(
          { error: "missing_face_coords", missing: missingChars },
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
          message: `Dialog-Pipeline benötigt ${totalCost} Credits (${rawShots.length} Sprecher × ~${LIPSYNC_CREDITS_PER_SEC} cr/s).`,
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
      version: 3,
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
        speakers: rawShots.length,
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
