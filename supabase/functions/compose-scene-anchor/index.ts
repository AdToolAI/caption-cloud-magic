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
  /** v111 — canonical face-only reference portraits aligned 1:1 with
   *  `portraitUrls`. When `portraitUrls` contains outfit covers (full-body
   *  Gemini renders that occasionally drift in identity), these canonical
   *  headshots are appended as ADDITIONAL reference images and labelled
   *  "IDENTITY reference for <name>" so Nano Banana 2 anchors the face to
   *  the real person and the wardrobe to the outfit cover. */
  identityPortraitUrls?: string[];
  scenePrompt: string;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  shotType?: string;
  /** When true, append an extra anti-duplicate/anti-extra-person hardening
   *  block. Used by compose-video-clips on the SECOND attempt after the
   *  first anchor showed a cloned identity or an extra person. */
  strictNoDuplicates?: boolean;
  /** v111 — strict identity-swap retry mode. When set, append a SWAP RETRY
   *  clause naming the specific characters whose face was rendered wrong on
   *  the previous attempt. */
  strictSwapMode?: boolean;
  swapMismatches?: string[];
  /** v131.6 — FINAL face-lock attempt after swap-retry failed. Adds a
   *  pixel-copy-from-identity-headshot clause and forces deterministic
   *  generation (temperature: 0). Implies strictSwapMode. */
  faceLockMode?: boolean;
  /** Stage A — World Assets as Visual References. */
  locationUrls?: string[];
  buildingUrls?: string[];
  propUrls?: string[];
  locationNames?: string[];
  buildingNames?: string[];
  propNames?: string[];
  /** Wardrobe-Lock — when true, the wardrobe shown in `portraitUrls` is a
   *  user-picked saved outfit (e.g. Roman armor) that MUST be rendered
   *  literally even when it contradicts the scene description (e.g.
   *  "modern office"). Without this flag, Nano Banana 2 silently translates
   *  the outfit into something "scene-appropriate". Names listed in
   *  `wardrobeLockNames` are the cast members whose wardrobe is locked. */
  wardrobeLock?: boolean;
  wardrobeLockNames?: string[];
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

    // v111 — canonical identity refs (face-only headshots), 1:1 with portraits.
    const identityPortraits = (body.identityPortraitUrls ?? [])
      .filter((u) => typeof u === "string" && u.length > 0)
      .slice(0, portraits.length);

    // Stage A — World refs. Hard caps: 1 location, 1 building, 3 props.
    const locationUrls = (body.locationUrls ?? []).filter((u) => typeof u === "string" && u.length > 0).slice(0, 1);
    const buildingUrls = (body.buildingUrls ?? []).filter((u) => typeof u === "string" && u.length > 0).slice(0, 1);
    const propUrls = (body.propUrls ?? []).filter((u) => typeof u === "string" && u.length > 0).slice(0, 3);
    const locationNames = (body.locationNames ?? []).slice(0, locationUrls.length);
    const buildingNames = (body.buildingNames ?? []).slice(0, buildingUrls.length);
    const propNames = (body.propNames ?? []).slice(0, propUrls.length);

    if (!body.sceneId || portraits.length === 0 || !body.scenePrompt) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Extract [CastActions] BEFORE the dialog stripper. The bullet syntax
    // (`- Name: action`) otherwise matches the generic speaker-line regex and
    // gets thrown away, which is why per-character actions like
    // "Matthew is making a phone call in the background" never reached the
    // image model and Matthew ended up symmetrically next to Sarah. We parse
    // them into a structured list, drop the marker block from the prose, and
    // re-inject them as a protected CHARACTER ACTIONS clause further down.
    const extractCastActions = (raw: string): { stripped: string; actions: { name: string; action: string }[] } => {
      if (!raw) return { stripped: "", actions: [] };
      const actions: { name: string; action: string }[] = [];
      const stripped = raw.replace(/\[\s*CastActions\s*\]([\s\S]*?)\[\s*\/\s*CastActions\s*\]/gi, (_m, body) => {
        const lines = String(body || "").split(/\n+/);
        for (const ln of lines) {
          const m = ln.match(/^\s*[-*•]\s*([\p{L}][\p{L}\s.'\-]{0,80}?)\s*:\s*(.+?)\s*$/u);
          if (m) actions.push({ name: m[1].trim(), action: m[2].trim() });
        }
        return "";
      });
      return { stripped, actions };
    };
    const { stripped: rawWithoutCast, actions: castActions } = extractCastActions(body.scenePrompt || "");

    // Heuristic: does any cast action describe an asymmetric placement /
    // activity that contradicts the default equal-share two-shot framing?
    const ASYM_RE = /\b(background|foreground|phone|standing|walking|leaning|distance|behind|away\s+from|aside|in\s+the\s+back|in\s+the\s+front|on\s+the\s+couch|by\s+the\s+window|across\s+the\s+room|on\s+(?:their|the|his|her)\s+(?:phone|laptop))\b/i;
    const hasAsymmetricCast = castActions.some((c) => ASYM_RE.test(c.action));

    // --- Sanitize: strip any spoken-dialog patterns that would otherwise
    // be rendered as burned-in captions / shirt labels by Nano Banana 2.
    // Targets: `Name: line` script format, quoted speech ("...", „...", «...»),
    // and stray multi-newlines.
    const stripSpokenDialog = (raw: string): { clean: string; stripped: boolean } => {
      if (!raw) return { clean: "", stripped: false };
      const before = raw;
      let s = raw
        // Drop ENTIRE [Dialog] ... [/Dialog] blocks (case-insensitive, multiline).
        // The composer's storyboard layer embeds a `[Dialog]` block with one
        // bullet per speaker turn — if that leaks into the image prompt, Nano
        // Banana renders the same speaker twice (because they appear twice in
        // the script). This MUST be stripped before the prompt reaches the
        // image model.
        .replace(/\[\s*dialog\s*\][\s\S]*?\[\s*\/\s*dialog\s*\]/gi, "")
        // Drop server-injected "Featuring NAME (shot): ..." / "Featuring NAME and NAME: ..."
        // prefixes — they often label a slot with ONE name while the trailing
        // sentence describes a DIFFERENT character, which the image model
        // resolves visually as "render slot-name as other-name" (the source of
        // the wrong-face / duplicated-character failure).
        .replace(/^\s*featuring\s+[^:\n]{1,200}:.*$/gim, "")
        .replace(/\bfeaturing\s+[^:\n.]{1,200}:\s*[^.\n]{1,600}\.?/gim, "")
        // Drop bullet/dash speaker lines like "- Samuel Dusatko says: ..."
        // or "* Matthew Dusatko speaks: ..." or "• Sarah: ..."
        .replace(/^\s*[-*•]\s*[\p{L}][\p{L}\s.'\-]{0,60}\s+(says?|speaks?|tells|asks|whispers|shouts|replies|responds)\s*:?\s.*$/gimu, "")
        .replace(/^\s*[-*•]\s*[\p{L}][\p{L}\s.'\-]{0,60}\s*:\s.*$/gmu, "")
        // Drop dialog-meta sentences ("speak to camera in turns", "lip-sync mouth movement",
        // "timing must follow speaker order", "speaker order", "in turns", "dialogue:").
        .replace(/^.*\b(speak\s+to\s+camera\s+in\s+turns|lip[- ]?sync\s+mouth\s+movement|timing\s+must\s+follow|speaker\s+order|in\s+turns|dialogue\s*:|conversation\s+script).*$/gim, "")
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
    const { clean: cleanedPrompt, stripped: dialogStripped } = stripSpokenDialog(rawWithoutCast);
    if (dialogStripped) {
      console.log(`[compose-scene-anchor] stripped spoken-dialog patterns from scenePrompt (scene=${body.sceneId})`);
    }
    if (castActions.length > 0) {
      console.log(`[compose-scene-anchor] extracted ${castActions.length} cast actions, asymmetric=${hasAsymmetricCast} (scene=${body.sceneId})`);
    }
    // Neutral fallback when very little visual content remains after stripping
    // dialog. For multi-portrait scenes we explicitly emphasise the exact
    // headcount so the model does not invent extras.
    const portraitsForFallback = portraits.length;
    const meaningful = cleanedPrompt && cleanedPrompt.replace(/[\s.\-,;:!?]/g, "").length >= 10;
    const safeScenePrompt = meaningful
      ? cleanedPrompt
      : (portraitsForFallback >= 2
        ? `Exactly ${portraitsForFallback} distinct people${names.length ? ` (${names.join(' and ')})` : ''} in a modern office meeting, each visible exactly once, seated together in conversation. No other humans. No rendered text.`
        : "Natural cinematic scene, photorealistic, no rendered text.");

    // --- Cache lookup ---
    const portraitHash = await sha1(portraits.join("|"));
    const strictMode = body.strictNoDuplicates === true;
    const swapMode = body.strictSwapMode === true;
    const swapMismatches = Array.isArray(body.swapMismatches)
      ? body.swapMismatches.filter((s) => typeof s === "string" && s.length > 0)
      : [];
    const faceLockMode = body.faceLockMode === true;
    const worldRefSig = `loc=${locationUrls.join(',')}|bld=${buildingUrls.join(',')}|prop=${propUrls.join(',')}`;
    const identitySig = identityPortraits.length > 0
      ? `id=${identityPortraits.join(',')}`
      : 'id=none';
    const castActionsSig = castActions
      .map((c) => `${c.name.toLowerCase()}:${c.action.toLowerCase()}`)
      .sort()
      .join('|');
    // v16 — adds face-lock mode (v131.6).
    const promptHash = await sha1(
      `v16|${safeScenePrompt}|${body.aspectRatio ?? "16:9"}|${body.shotType ?? ""}|n=${portraits.length}|strict=${strictMode ? 1 : 0}|swap=${swapMode ? 1 : 0}|fl=${faceLockMode ? 1 : 0}|sm=${swapMismatches.join(',').toLowerCase()}|names=${names.join(',').toLowerCase()}|${worldRefSig}|${identitySig}|cast=${castActionsSig}|asym=${hasAsymmetricCast ? 1 : 0}`,
    );

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
    const N = portraits.length;
    const peopleNoun = isMulti ? `these ${N} people` : "this person";
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
        `All ${N} characters appear together in the SAME frame, naturally placed per the scene (side by side, facing each other, in conversation), faces clearly visible to camera. ` +
        `If scene lighting differs, only adapt skin shading and color temperature — NEVER alter underlying face geometry, hair, or distinctive marks. ` +
        `Generic lookalikes, AI "average" faces, or substituted people are FORBIDDEN.`
      : ` ABSOLUTE IDENTITY LOCK: Copy this person's face pixel-for-pixel from the reference portrait. Preserve face shape, eyes, nose, mouth, hairline, hair, skin tone, ASYMMETRIC details and any distinctive marks EXACTLY. NO morphing, NO beautification, NO de-aging. Identity preservation outranks aesthetics. The result must be unmistakably the same person.`;
    const HARD_LOCK_SUFFIX =
      ` IDENTITY LOCK (final): Preserve each person's exact facial identity, age, skin tone, hair style and color from the reference photos. Do NOT age them, do NOT change face shape. Photorealistic.`;
    // Hard no-typography suffix — prevents Nano Banana 2 from rendering
    // any spoken dialog, captions, or labels into the composed first frame.
    const NO_TYPOGRAPHY_SUFFIX =
      ` ABSOLUTELY NO rendered text of any kind: no captions, no subtitles, no speech bubbles, no spoken words rendered as text, no words on clothing or shirts, no signs, no labels, no logos with text, no watermarks, no on-screen titles. The image must contain ZERO typography. Treat any dialog quoted in the scene description as audio-only context — do NOT visualize it as text.`;
    // EXACT-COUNT enforcement (multi only). The lipsync pipeline relies on
    // the anchor showing EXACTLY N distinct faces — no extras, no duplicates,
    // no background bystanders. This is the single biggest source of the
    // "character appears twice / a third stranger appears" failure mode.
    const EXACT_COUNT_SUFFIX = isMulti
      ? ` EXACT PERSON COUNT — NON-NEGOTIABLE: the final image must show EXACTLY ${N} human beings — not ${N - 1}, not ${N + 1}, not ${N + 2}. ` +
        `Each of the ${N} reference people appears EXACTLY ONCE. ` +
        `FORBIDDEN: duplicating any reference person, rendering the same identity twice, twins, doppelgängers, clones, mirror reflections of a person, posters/photos of a person on the wall, screens showing a person, statues or mannequins of a person. ` +
        `FORBIDDEN: any additional human beyond the ${N} references — no extra colleague, no bystander at the desk/table, no waiter, no passer-by in the background, no crowd, no silhouettes of other people, no hands or arms of unseen people entering the frame. ` +
        `Empty background humans (out-of-focus crowd) are also FORBIDDEN. The frame contains EXACTLY ${N} people total.`
      : ` EXACT PERSON COUNT — NON-NEGOTIABLE: the final image must show EXACTLY 1 human being — not 2, not 3, not more. ` +
        `The single reference person appears EXACTLY ONCE in ONE continuous frame. ` +
        `FORBIDDEN: duplicating the reference person, rendering the same identity twice or three times, twins, doppelgängers, clones, mirror reflections of the same person, posters/photos/screens/statues/mannequins showing the same person. ` +
        `FORBIDDEN: triptych layout, panel grid, multi-panel composition, split-screen, side-by-side panels of the same person, photo collage, contact sheet, before/after grid, "variations of the same person" composition. ` +
        `FORBIDDEN: any additional human beyond the 1 reference — no extra colleague, no bystander, no passer-by, no crowd, no silhouettes, no background humans. ` +
        `The frame contains EXACTLY 1 person total in 1 continuous shot.`;
    // Two-shot framing enforcement — when ≥2 portraits, the downstream
    // lipsync pipeline REQUIRES that all N faces are clearly visible and
    // separable in the first frame. Without this, Hailuo i2v often crops
    // to a single character or stacks faces and the multi-pass face-target
    // lipsync collapses to one speaker. This rule is Artlist-parity.
    const TWO_SHOT_FRAMING_SUFFIX = isMulti
      ? (hasAsymmetricCast
        ? ` MULTI-CHARACTER FRAMING (asymmetric, per CHARACTER ACTIONS above): all ${N} reference people must be clearly visible and individually recognizable in the SAME frame. Screen share may be UNEQUAL — honor the per-character placement (foreground/background, primary/secondary, near/far) exactly as written in CHARACTER ACTIONS. Each face must still be unobstructed enough that a face detector can locate ${N} distinct faces (no full back-of-head, no fully hidden face, no silhouette). Do NOT collapse the scene to a symmetric side-by-side shot if the actions describe different positions.`
        : ` MANDATORY TWO-SHOT FRAMING: a wide ${N}-shot where ALL ${N} characters are fully visible in the SAME frame at roughly EQUAL screen share. Each face must be unobstructed, front-3/4 to camera, with clear separation between subjects (no occlusion, no overlap of heads). NEVER produce a single-character close-up, NEVER cut anyone out of frame, NEVER show only the back of a head. Position the subjects left/right or in a slight arc so a face detector can find ${N} distinct faces.`)
      : "";
    const TWO_SHOT_NEGATIVE = isMulti
      ? (hasAsymmetricCast
        ? ` AVOID: any reference person with face fully hidden, back of head only, full silhouette where the face is unreadable, faces fully occluded by laptops/phones/objects, duplicated identity, extra unreferenced person.`
        : ` AVOID: single person, solo close-up, one face cropped to frame, back of head, full profile silhouette where the face is hidden, one character occluded by the other, faces overlapping, three people when only two are referenced, extra coworker, extra colleague, extra bystander, background crowd, twins, identical-looking people, repeated face.`)
      : ` AVOID: triptych layout, panel grid, multi-panel composition, split-screen, side-by-side panels of the same person, photo collage, contact sheet, before/after grid, mirror duplicates, twins, doppelgängers, repeated face, two of the same person, three of the same person, extra unreferenced human, background bystander, coworker, crowd.`;
    const STRICT_RETRY_SUFFIX = strictMode
      ? (isMulti
        ? ` STRICT RETRY MODE — the previous attempt FAILED because it produced either a duplicated identity, an extra human body, or a partial third person in frame. Read this carefully: there are EXACTLY ${N} reference portraits, so the output must show EXACTLY ${N} HUMAN BEINGS total — count every visible body, including profile views, partial bodies, background humans, mirror reflections, posters, screens, mannequins, statues. The total human count anywhere in the frame must equal ${N}. ISOLATE the ${N} reference people: clear or empty the rest of the environment (empty office, empty hallway, empty street). Crop/frame tight enough to physically EXCLUDE any additional humans. Do NOT add coworkers, colleagues, bystanders, passers-by, or a "third figure" to balance the composition. Do NOT repeat any reference person. Final human headcount in frame: ${N}. Repeat: exactly ${N} bodies, no more, no fewer.`
        : ` STRICT RETRY MODE — the previous attempt FAILED because it produced MULTIPLE instances of the same person (triptych, split-screen panels, side-by-side duplicates, or two/three bodies of the same identity). Render EXACTLY 1 single human being in 1 single continuous frame — no panels, no grid, no split-screen, no side-by-side variations, no mirror duplicates, no posters/screens/statues of the same person. ISOLATE the single reference person: empty the rest of the environment of other humans. Final human headcount in frame: 1. Repeat: exactly 1 body, in 1 continuous shot, no panels.`)
      : "";

    // v111 — STRICT SWAP RETRY: the previous attempt rendered the WRONG face
    // for one or more named characters (e.g. a woman's head on a male
    // reference). Name the offenders explicitly.
    const STRICT_SWAP_SUFFIX = (swapMode || faceLockMode) && isMulti
      ? ` STRICT IDENTITY SWAP RETRY — the previous attempt rendered the WRONG PERSON in the slot of: ${swapMismatches.length > 0 ? swapMismatches.join(", ") : "one or more characters"}. Read carefully: every named reference person above has a CANONICAL IDENTITY headshot supplied later in the image list — that IDENTITY image is the ground truth for that person's FACE (sex, age, hair color, hair length, skin tone, jawline, nose, eye color, beard/stubble). Do NOT swap, replace, regender, or substitute any character with a different person. If a reference looks androgynous, follow the IDENTITY headshot's apparent sex and age STRICTLY. Wardrobe and body shape may come from the outfit-cover image for that character, but the FACE must match the IDENTITY headshot pixel-for-pixel. Double-check before output: does each named character's face actually match THEIR identity headshot? If not, regenerate the face from the identity headshot.`
      : "";

    // v131.6 — FACE LOCK SUFFIX: final-attempt hard pixel-copy directive.
    // Used only after attempt-1 (normal) and attempt-2 (strict-swap) have
    // both failed the identity audit. Demands the model copy the face
    // straight from the IDENTITY headshot of each slot with zero creative
    // interpretation. Combined with temperature: 0 below.
    const FACE_LOCK_SUFFIX = faceLockMode && isMulti && identityPortraits.length === portraits.length
      ? ` FINAL FACE-LOCK MODE — the previous TWO attempts both produced the wrong face in at least one slot${swapMismatches.length > 0 ? ` (offenders: ${swapMismatches.join(", ")})` : ""}. For each numbered reference slot, COPY THE FACE DIRECTLY FROM THAT SLOT'S IDENTITY HEADSHOT pixel-for-pixel — same geometry, same jaw, same eyes, same nose, same hairline, same skin tone, same age, same sex. NO creative interpretation of faces. NO blending. NO substitution. NO "improvement". The IDENTITY headshot IS the face — paste it. Outfits come from the wardrobe references (Image #1..#${portraits.length}), but every face is a direct copy from its IDENTITY headshot. If you cannot copy a face exactly from its identity headshot, leave that character out rather than substitute a different person.`
      : "";

    // Per-character action clause — protected from the dialog stripper and
    // placed BEFORE the framing rules so the model treats placement /
    // activity per character as the ground truth.
    const CAST_ACTIONS_CLAUSE = castActions.length > 0
      ? ` CHARACTER ACTIONS — each named reference person does EXACTLY this in the frame (spatial placement and activity per character override any default symmetric framing rule that follows):\n` +
        castActions.map((c) => `- ${c.name}: ${c.action}`).join("\n") +
        `\nRender these actions literally — if a character is described "in the background", they MUST be visibly further from camera than the others; if "on the phone", a phone MUST be at their ear; if "leaning", they MUST be leaning. Do NOT relocate any character to a symmetric position just to balance the composition.`
      : "";

    // Stage A — World reference clause. Tells the model WHICH later image
    // indices represent the named location / building / props so it composes
    // them faithfully INTO the scene instead of inventing generic stand-ins.
    let worldClause = "";
    let imgIdx = portraits.length; // next slot
    const worldLines: string[] = [];
    for (let i = 0; i < locationUrls.length; i++) {
      imgIdx += 1;
      worldLines.push(`Image #${imgIdx} = LOCATION "${locationNames[i] ?? "Location"}" (use as the environment / background identity — match its architecture, materials, color palette, lighting and overall spatial layout faithfully).`);
    }
    for (let i = 0; i < buildingUrls.length; i++) {
      imgIdx += 1;
      worldLines.push(`Image #${imgIdx} = ARCHITECTURE "${buildingNames[i] ?? "Building"}" (use as the named landmark / building identity — preserve its silhouette, facade, distinctive features).`);
    }
    for (let i = 0; i < propUrls.length; i++) {
      imgIdx += 1;
      worldLines.push(`Image #${imgIdx} = PROP "${propNames[i] ?? "Prop"}" (this exact object must be visible in the scene — preserve its shape, color, materials, labels; place it naturally per the scene description, e.g. in a character's hand or on a surface).`);
    }
    if (worldLines.length > 0) {
      worldClause =
        ` WORLD REFERENCES — preserve these identities exactly, do NOT generalize or substitute generic alternatives:\n` +
        worldLines.join("\n") +
        `\nIf any world reference is inconsistent with the scene description, the IMAGE wins (visual identity outranks prose). Compose locations and buildings as the background environment; place props in plausible positions per the scene.`;
    }

    // v111 — IDENTITY REFERENCE clause. After world refs, append canonical
    // face-only headshots aligned 1:1 with the first N portraits.
    let identityClause = "";
    const identityLines: string[] = [];
    for (let i = 0; i < identityPortraits.length; i++) {
      imgIdx += 1;
      const nm = names[i] ?? `Character #${i + 1}`;
      identityLines.push(`Image #${imgIdx} = IDENTITY reference for ${nm} (face-only headshot — this is the GROUND TRUTH for ${nm}'s face: sex, age, hair, skin tone, jawline, eyes, nose. Use the body/wardrobe from Image #${i + 1} for ${nm}, but the FACE from this image.).`);
    }
    if (identityLines.length > 0) {
      identityClause =
        ` IDENTITY REFERENCES — these supersede the wardrobe images for face identity. If Image #${1} through #${portraits.length} disagree with the IDENTITY references on a character's face (sex, age, hair color), the IDENTITY reference WINS:\n` +
        identityLines.join("\n");
    }

    // Wardrobe-Lock — when the caller picked a saved outfit for one or more
    // cast members, the wardrobe shown in the reference image MUST override
    // anything implied by the scene description. Without this clause the
    // image model hedges (e.g. Business-Briefing + Roman-armor outfit →
    // generic suit with armor-ish trim instead of full Roman armor).
    const WARDROBE_LOCK_SUFFIX = body.wardrobeLock === true
      ? ` WARDROBE LOCK — the wardrobe / clothing / armor visible in the reference image${portraits.length > 1 ? "s" : ""} for ${(body.wardrobeLockNames && body.wardrobeLockNames.length > 0 ? body.wardrobeLockNames.join(", ") : "the character(s)")} is MANDATORY and OVERRIDES any clothing implied by the scene description. The wardrobe in the reference IS the ground truth — the scene only provides location, lighting, pose and props. If the scene description says "modern office", "business meeting", "wedding", "beach" etc. but the wardrobe reference shows Roman armor, a fantasy robe, a costume, period dress or any unusual garment, the character wears EXACTLY that wardrobe inside the described environment (e.g. full Roman armor inside the modern boardroom). Do NOT translate the outfit into a "scene-appropriate" equivalent. Do NOT swap fabrics, colors, materials, silhouettes, accessories, headwear or footwear to match the setting. Preserve every wardrobe detail visible in the reference: garment type, layers, color palette, patterns, metals, leather, belts, capes, helmets, jewelry, footwear.`
      : "";

    const editInstruction =
      `Place ${peopleNoun} into the following scene without altering their facial identity, age, ethnicity, hair, or distinctive features.${nameClause}${multiClause}${HARD_LOCK_SUFFIX}${NO_TYPOGRAPHY_SUFFIX}${EXACT_COUNT_SUFFIX}${CAST_ACTIONS_CLAUSE}${TWO_SHOT_FRAMING_SUFFIX}${TWO_SHOT_NEGATIVE}${STRICT_RETRY_SUFFIX}${STRICT_SWAP_SUFFIX}${FACE_LOCK_SUFFIX}${WARDROBE_LOCK_SUFFIX}${worldClause}${identityClause} ` +
      `Match the requested framing and composition precisely — they do NOT have to be centered or facing the camera, but their faces should remain clearly recognizable. ` +
      `Aspect ratio: ${aspect}. Photorealistic, natural lighting matching the scene description.\n\n` +
      `Scene: ${safeScenePrompt}`;

    // --- Call Nano Banana 2 with all portraits + world refs + identity refs as separate image_url parts ---
    const userContent: any[] = [{ type: "text", text: editInstruction }];
    for (const url of portraits) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
    for (const url of locationUrls) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
    for (const url of buildingUrls) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
    for (const url of propUrls) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
    for (const url of identityPortraits) {
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
          // v131.6 — force deterministic generation for the final face-lock
          // attempt so the model does not "creatively reinterpret" identity.
          ...(faceLockMode ? { temperature: 0 } : {}),
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
      `[compose-scene-anchor] ok sceneId=${body.sceneId} portraits=${portraits.length} identityRefs=${identityPortraits.length} world=loc${locationUrls.length}/bld${buildingUrls.length}/prop${propUrls.length} swap=${swapMode ? 1 : 0} faceLock=${faceLockMode ? 1 : 0} strict=${strictMode ? 1 : 0} wardrobeLock=${body.wardrobeLock ? 1 : 0}${body.wardrobeLock && body.wardrobeLockNames?.length ? `(${body.wardrobeLockNames.join("/")})` : ""} elapsedMs=${Date.now() - t0}`,
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
    // cacheControl: 3600s so Cloudflare serves the anchor PNG from CDN edge on
    // subsequent fetches. Critical because Replicate fetches `image` inputs with
    // a 10 s read-timeout — origin RTT under load can exceed that, killing the
    // prediction. CDN-cached responses come back in <100ms.
    const { error: upErr } = await admin.storage
      .from("composer-frames")
      .upload(path, bytes, { contentType: mime, upsert: true, cacheControl: "3600" });
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
