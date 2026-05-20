// compose-scene-anchor
//
// Renders a scene-aware first-frame for an i2v provider:
// takes a character portrait + the scene's text prompt and asks
// Nano Banana 2 (google/gemini-3.1-flash-image-preview) to place the person
// into the described composition. The result is uploaded to the
// `composer-frames` bucket and cached in `scene_anchor_cache` so repeated
// "Generate All" runs don't re-pay.
//
// On any failure we return { strategy: 'text-only' } so the caller can fall
// back gracefully (no face-lock, no broken first-frame).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface Body {
  sceneId: string;
  /** Single-portrait legacy field — used as fallback when portraitUrls absent. */
  portraitUrl?: string;
  /** Multi-portrait array — preferred. Up to 4 characters in one composed frame. */
  portraitUrls?: string[];
  /** Optional character names matched 1:1 with portraitUrls (used in prompt). */
  characterNames?: string[];
  scenePrompt: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  shotType?: string;
  /** When true, append an extra anti-duplicate/anti-extra-person hardening
   *  block. Used by compose-video-clips on the SECOND attempt after the
   *  first anchor showed a cloned identity or an extra person. */
  strictNoDuplicates?: boolean;
}

async function sha1(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "image" });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // Verify user
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const portraits = (body.portraitUrls && body.portraitUrls.length > 0)
      ? body.portraitUrls.slice(0, 4) // hard cap — 4 chars max in one frame
      : (body.portraitUrl ? [body.portraitUrl] : []);
    const names = (body.characterNames ?? []).slice(0, portraits.length);

    if (!body.sceneId || portraits.length === 0 || !body.scenePrompt) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Sanitize: strip any spoken-dialog patterns that would otherwise
    // be rendered as burned-in captions / shirt labels by Nano Banana 2.
    // Targets: `Name: line` script format, quoted speech ("...", „...", «...»),
    // and stray multi-newlines.
    const stripSpokenDialog = (raw: string): { clean: string; stripped: boolean } => {
      if (!raw) return { clean: "", stripped: false };
      const before = raw;
      let s = raw
        // Drop lines like "Alex: Das ist ein Traum!" or "BEN — Hello"
        .replace(/^[\p{Lu}][\p{L}\s'\-]{0,40}\s*[:\-—]\s.*$/gmu, "")
        // Drop content in straight or typographic quotes
        .replace(/"[^"]{1,400}"/g, "")
        .replace(/„[^"]{1,400}"/g, "")
        .replace(/«[^»]{1,400}»/g, "")
        .replace(/'[^']{2,400}'/g, "")
        .replace(/\n{2,}/g, "\n")
        .trim();
      return { clean: s, stripped: s !== before.trim() };
    };
    const { clean: cleanedPrompt, stripped: dialogStripped } = stripSpokenDialog(body.scenePrompt || "");
    if (dialogStripped) {
      console.log(`[compose-scene-anchor] stripped spoken-dialog patterns from scenePrompt (scene=${body.sceneId})`);
    }
    const safeScenePrompt = cleanedPrompt || "natural cinematic scene, no rendered text";

    // --- Cache lookup ---
    const portraitHash = await sha1(portraits.join("|"));
    // v6 — bumped after two-shot framing enforcement (mandatory N-shot
    // composition with equal screen share + anti-occlusion negatives).
    const promptHash = await sha1(`v6|${safeScenePrompt}|${body.aspectRatio ?? "16:9"}|${body.shotType ?? ""}|n=${portraits.length}`);

    const { data: cached } = await admin
      .from("scene_anchor_cache")
      .select("composed_url")
      .eq("scene_id", body.sceneId)
      .eq("portrait_hash", portraitHash)
      .eq("prompt_hash", promptHash)
      .maybeSingle();

    if (cached?.composed_url) {
      return new Response(
        JSON.stringify({ composedUrl: cached.composed_url, cached: true, strategy: "first-frame-composed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Build edit prompt ---
    const aspect = body.aspectRatio ?? "16:9";
    const isMulti = portraits.length > 1;
    const peopleNoun = isMulti ? `these ${portraits.length} people` : "this person";
    const nameClause = names.length > 0
      ? ` Reference portraits, in strict order: ${names.map((n, i) => `Image #${i + 1} = ${n} (use ONLY image #${i + 1} for ${n}'s face)`).join("; ")}.`
      : "";
    const multiClause = isMulti
      ? ` ABSOLUTE IDENTITY LOCK — NON-NEGOTIABLE: Treat each reference portrait as a forensic photograph of a real, specific person. ` +
        `Copy each face PIXEL-FOR-PIXEL from its reference portrait. ` +
        `Do NOT generalize, beautify, slim, age, de-age, restyle hair, change ethnicity, or "improve" any face. ` +
        `Preserve EXACTLY: face shape, jawline, cheekbones, nose shape and width, eye shape and spacing, eyebrow shape, lip shape, hairline, hair color, hair length, beard/stubble, skin tone, freckles, moles, scars, glasses, ASYMMETRIC details. ` +
        `NO face morphing, NO blending of faces, NO "average" composite faces, NO de-aging, NO smoothing of skin texture. ` +
        `Identity preservation outranks aesthetics — keep the people looking like themselves even if the lighting is unflattering. ` +
        `Faces MUST remain clearly recognizable as the SAME individuals from the reference portraits — a stranger comparing the result to the references must immediately confirm they are the same people. ` +
        `All ${portraits.length} characters appear together in the SAME frame, naturally placed per the scene (side by side, facing each other, in conversation), faces clearly visible to camera. ` +
        `If scene lighting differs, only adapt skin shading and color temperature — NEVER alter underlying face geometry, hair, or distinctive marks. ` +
        `Generic lookalikes, AI "average" faces, or substituted people are FORBIDDEN.`
      : ` ABSOLUTE IDENTITY LOCK: Copy this person's face pixel-for-pixel from the reference portrait. Preserve face shape, eyes, nose, mouth, hairline, hair, skin tone, ASYMMETRIC details and any distinctive marks EXACTLY. NO morphing, NO beautification, NO de-aging. Identity preservation outranks aesthetics. The result must be unmistakably the same person.`;
    const HARD_LOCK_SUFFIX =
      ` IDENTITY LOCK (final): Preserve each person's exact facial identity, age, skin tone, hair style and color from the reference photos. Do NOT age them, do NOT change face shape. Photorealistic.`;
    // Hard no-typography suffix — prevents Nano Banana 2 from rendering
    // any spoken dialog, captions, or labels into the composed first frame.
    const NO_TYPOGRAPHY_SUFFIX =
      ` ABSOLUTELY NO rendered text of any kind: no captions, no subtitles, no speech bubbles, no spoken words rendered as text, no words on clothing or shirts, no signs, no labels, no logos with text, no watermarks, no on-screen titles. The image must contain ZERO typography. Treat any dialog quoted in the scene description as audio-only context — do NOT visualize it as text.`;
    // Two-shot framing enforcement — when ≥2 portraits, the downstream
    // lipsync pipeline REQUIRES that all N faces are clearly visible and
    // separable in the first frame. Without this, Hailuo i2v often crops
    // to a single character or stacks faces and the multi-pass face-target
    // lipsync collapses to one speaker. This rule is Artlist-parity.
    const TWO_SHOT_FRAMING_SUFFIX = isMulti
      ? ` MANDATORY TWO-SHOT FRAMING: a wide ${portraits.length}-shot where ALL ${portraits.length} characters are fully visible in the SAME frame at roughly EQUAL screen share. Each face must be unobstructed, front-3/4 to camera, with clear separation between subjects (no occlusion, no overlap of heads). NEVER produce a single-character close-up, NEVER cut anyone out of frame, NEVER show only the back of a head. Position the subjects left/right or in a slight arc so a face detector can find ${portraits.length} distinct faces.`
      : "";
    const TWO_SHOT_NEGATIVE = isMulti
      ? ` AVOID: single person, solo close-up, one face cropped to frame, back of head, full profile silhouette where the face is hidden, one character occluded by the other, faces overlapping.`
      : "";
    const editInstruction =
      `Place ${peopleNoun} into the following scene without altering their facial identity, age, ethnicity, hair, or distinctive features.${nameClause}${multiClause}${HARD_LOCK_SUFFIX}${NO_TYPOGRAPHY_SUFFIX}${TWO_SHOT_FRAMING_SUFFIX}${TWO_SHOT_NEGATIVE} ` +
      `Match the requested framing and composition precisely — they do NOT have to be centered or facing the camera, but their faces should remain clearly recognizable. ` +
      `Aspect ratio: ${aspect}. Photorealistic, natural lighting matching the scene description.\n\n` +
      `Scene: ${safeScenePrompt}`;

    // --- Call Nano Banana 2 with all portraits as separate image_url parts ---
    const userContent: any[] = [{ type: "text", text: editInstruction }];
    for (const url of portraits) {
      userContent.push({ type: "image_url", image_url: { url } });
    }

    // Hard 45s timeout — Nano Banana 2 multi-portrait calls can hang on the
    // gateway and would otherwise stall the client invoke() forever.
    const ac = new AbortController();
    const t0 = Date.now();
    const timeoutId = setTimeout(() => ac.abort(), 45_000);
    let aiResp: Response;
    try {
      aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: userContent }],
          modalities: ["image", "text"],
        }),
        signal: ac.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const elapsedMs = Date.now() - t0;
      const reason = (e as any)?.name === "AbortError" ? "ai_timeout" : "ai_network";
      console.warn(
        `[compose-scene-anchor] ${reason} sceneId=${body.sceneId} portraits=${portraits.length} elapsedMs=${elapsedMs}`,
      );
      return new Response(
        JSON.stringify({ strategy: "text-only", error: reason }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    clearTimeout(timeoutId);

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("[compose-scene-anchor] AI gateway error", aiResp.status, txt);
      return new Response(
        JSON.stringify({ strategy: "text-only", error: "ai_failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log(
      `[compose-scene-anchor] ok sceneId=${body.sceneId} portraits=${portraits.length} elapsedMs=${Date.now() - t0}`,
    );

    const aiJson = await aiResp.json();
    const dataUrl: string | undefined =
      aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      console.error("[compose-scene-anchor] no image in response", JSON.stringify(aiJson).slice(0, 400));
      return new Response(
        JSON.stringify({ strategy: "text-only", error: "no_image" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Decode + upload
    const [meta, b64] = dataUrl.split(",", 2);
    const mime = /data:(image\/[a-z+]+);/.exec(meta)?.[1] ?? "image/png";
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const path = `${user.id}/scene-anchors/${body.sceneId}-${promptHash.slice(0, 12)}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("composer-frames")
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) {
      console.error("[compose-scene-anchor] upload error", upErr);
      return new Response(
        JSON.stringify({ strategy: "text-only", error: "upload_failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: pub } = admin.storage.from("composer-frames").getPublicUrl(path);
    const composedUrl = pub.publicUrl;

    // Cache
    await admin
      .from("scene_anchor_cache")
      .upsert(
        {
          user_id: user.id,
          scene_id: body.sceneId,
          portrait_hash: portraitHash,
          prompt_hash: promptHash,
          composed_url: composedUrl,
        },
        { onConflict: "scene_id,portrait_hash,prompt_hash" },
      );

    // For multi-portrait Two-Shot anchors, ALSO persist the composed URL as
    // `lock_reference_url` on the scene so the Continuity Guardian can
    // compare the rendered clip against it. Single-character anchors stay
    // out of lock_reference_url to avoid clobbering manually pinned refs.
    if (portraits.length >= 2) {
      try {
        await admin
          .from("composer_scenes")
          .update({
            lock_reference_url: composedUrl,
            twoshot_stage: "anchor",
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.sceneId);
      } catch (e) {
        console.warn("[compose-scene-anchor] lock_reference_url persist failed (non-fatal)", e);
      }
    }

    return new Response(
      JSON.stringify({ composedUrl, cached: false, strategy: "first-frame-composed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[compose-scene-anchor] fatal", e);
    return new Response(
      JSON.stringify({ strategy: "text-only", error: e instanceof Error ? e.message : "unknown" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
