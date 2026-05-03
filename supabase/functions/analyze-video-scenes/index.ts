import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

interface SceneAnalysis {
  id: string;
  start_time: number;
  end_time: number;
  original_start_time?: number;
  original_end_time?: number;
  playbackRate?: number;
  description: string;
  mood: string;
  suggested_effects: {
    type: string;
    name: string;
    reason: string;
    confidence: number;
  }[];
  ai_suggestions: string[];
}

interface SceneBoundary {
  time: number;
  type: 'hard_cut' | 'soft_transition';
  score: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { video_url, duration, frames, scene_boundaries, detected_cuts, client_extraction_failed, boundary_source } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: "video_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const videoDuration = duration || 30;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // scene_boundaries from deterministic client-side detection
    const boundaries: SceneBoundary[] = Array.isArray(scene_boundaries) ? scene_boundaries : [];
    const legacyCuts: number[] = Array.isArray(detected_cuts) ? detected_cuts : [];
    const hasClientBoundaries = boundaries.length > 0 || legacyCuts.length > 0;
    
    console.log(`[analyze-video-scenes] Video: ${video_url}, duration: ${videoDuration}s, boundaries: ${boundaries.length}, legacy_cuts: ${legacyCuts.length}, frames: ${frames?.length || 0}, client_failed: ${!!client_extraction_failed}`);

    let analysisMode = 'client_deterministic';
    let serverBoundaries: SceneBoundary[] = [];
    let detectionError: string | null = null;
    const hasFramesInput = Array.isArray(frames) && frames.length >= 2;

    // PATH A: Client provided boundaries → use them
    // PATH B: Frames available (e.g. video too large for inline) → AI boundary detection from timestamped frames
    // PATH C: No boundaries, no frames → server-side video analysis (small videos only)
    if (!hasClientBoundaries) {
      if (hasFramesInput) {
        console.log(`[analyze-video-scenes] No client boundaries — running frame-based AI boundary detection on ${frames.length} frames`);
        analysisMode = 'server_frame_analysis';
        try {
          serverBoundaries = await detectScenesFromFrames(frames, videoDuration, LOVABLE_API_KEY);
          if (serverBoundaries.length === 0) analysisMode = 'server_frame_no_cuts_found';
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error("[analyze-video-scenes] Frame-based detection failed:", errMsg);
          detectionError = errMsg;
          analysisMode = 'server_error';
        }
      } else {
        console.log("[analyze-video-scenes] No client boundaries, no frames — running server-side video analysis");
        analysisMode = 'server_video_analysis';
        try {
          serverBoundaries = await detectScenesFromVideo(video_url, videoDuration, LOVABLE_API_KEY);
          console.log(`[analyze-video-scenes] Server detected ${serverBoundaries.length} boundaries: ${serverBoundaries.map(b => `${b.time.toFixed(1)}s(${b.type})`).join(', ')}`);
          if (serverBoundaries.length === 0) analysisMode = 'server_no_cuts_found';
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error("[analyze-video-scenes] Server-side detection failed:", errMsg);
          detectionError = errMsg;
          analysisMode = 'server_error';
        }
      }
    }

    // No silent uniform 5s fallback anymore — return an honest error so the
    // UI can display the cause and offer a manual split option.
    if (analysisMode === 'server_error') {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'scene_detection_failed',
          detail: detectionError || 'Unknown error',
          analysis_mode: 'server_error',
          can_manual_split: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build deterministic scenes
    const allBoundaries = hasClientBoundaries ? boundaries : serverBoundaries;
    const allLegacyCuts = hasClientBoundaries ? legacyCuts : [];
    // Trusted external detectors (e.g. PySceneDetect) get a much lower min-scene
    // length so genuine short shots near start/end are not silently merged.
    const trustedSource = boundary_source === 'pyscenedetect' || boundary_source === 'trusted' || boundary_source === 'fused';
    const minSceneDuration = trustedSource ? 0.3 : 3.0;
    const buildResult = buildDeterministicScenes(allBoundaries, allLegacyCuts, videoDuration, minSceneDuration);
    const deterministicScenes = buildResult.scenes;

    console.log(`[analyze-video-scenes] Scenes: ${deterministicScenes.length} → ${deterministicScenes.map(s => `${s.start_time.toFixed(1)}-${s.end_time.toFixed(1)}s`).join(', ')} (mode: ${analysisMode}, source: ${boundary_source || 'auto'}, minDur: ${minSceneDuration}s)`);
    if (buildResult.dropped.length > 0) {
      console.log(`[analyze-video-scenes] Dropped boundaries: ${buildResult.dropped.map(d => `${d.time.toFixed(2)}s(${d.reason})`).join(', ')}`);
    }

    // Ask AI to DESCRIBE each scene
    const hasFrames = frames && frames.length > 0;

    const sceneList = deterministicScenes.map((s, i) => 
      `Szene ${i + 1}: ${s.start_time.toFixed(1)}s bis ${s.end_time.toFixed(1)}s`
    ).join('\n');

    const systemPrompt = `Du bist ein Video-Analyst. Die Szenengrenzen sind bereits FEST bestimmt.
Du darfst die Anzahl oder Zeitgrenzen der Szenen NICHT ändern!

VORGEGEBENE SZENEN (unveränderlich):
${sceneList}

Deine Aufgabe: Beschreibe jede vorgegebene Szene anhand der Frames/des Videos.

Für JEDE Szene gib zurück:
{
  "id": "scene-N",
  "description": "Kurze Beschreibung (max 50 Zeichen)",
  "mood": "dynamic|calm|energetic|emotional|neutral",
  "suggested_effects": [
    { "type": "filter", "name": "cinematic|vintage|warm|cool|vibrant|noir|muted|highkey", "reason": "...", "confidence": 0.8 },
    { "type": "color", "name": "brightness-110|contrast-115|saturation-120|vignette-40", "reason": "...", "confidence": 0.8 }
  ],
  "ai_suggestions": ["Vorschlag 1", "Vorschlag 2"]
}

REGELN:
- Gib EXAKT ${deterministicScenes.length} Szenen zurück (nicht mehr, nicht weniger!)
- Szene 1 startet bei ${deterministicScenes[0].start_time}s, letzte endet bei ${deterministicScenes[deterministicScenes.length - 1].end_time}s
- JEDE Szene braucht 2 suggested_effects (1 filter + 1 color)
- Beschreibungen MAXIMAL 50 Zeichen
- Antworte NUR mit einem validen JSON-Array!`;

    let aiDescriptions: any[] | null = null;

    // Try AI description with frames or video URL
    const describePromptText = `Beschreibe die ${deterministicScenes.length} vorgegebenen Szenen. Antworte NUR mit JSON-Array!`;
    
    // Description integrity: if we have NO frames AND client_extraction_failed,
    // do NOT ask the AI to invent descriptions — it will hallucinate
    // ("city at night", "people walking") with zero visual grounding.
    // Return neutral labels instead so the user knows the timeline is correct
    // but descriptions are placeholders.
    const skipAIDescription = !hasFrames && !!client_extraction_failed;

    if (!skipAIDescription) try {
      const userContent: any[] = [{ type: "text", text: describePromptText }];
      
      if (hasFrames) {
        const frameImages = (typeof frames[0] === 'object' && 'image' in frames[0])
          ? frames.map((f: { image: string }) => f.image)
          : frames;
        for (const frame of frameImages) {
          userContent.push({ type: "image_url", image_url: { url: frame, detail: "high" } });
        }
      }
      // Don't send video URL as image_url — it fails with "Unsupported image format"

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ],
          temperature: 0.2,
          max_tokens: 4096,
        }),
      });

      if (response.ok) {
        const aiResponse = await response.json();
        const content = aiResponse.choices?.[0]?.message?.content || "";
        aiDescriptions = parseAIResponse(content);
      }
    } catch (e) {
      console.error("[analyze-video-scenes] AI description error:", e);
    }


    // Merge AI descriptions into deterministic scenes
    const finalScenes: SceneAnalysis[] = deterministicScenes.map((scene, i) => {
      const aiScene = aiDescriptions && aiDescriptions[i];
      const mood = aiScene?.mood || "neutral";
      
      return {
        id: `scene-${i + 1}`,
        start_time: scene.start_time,
        end_time: scene.end_time,
        original_start_time: scene.start_time,
        original_end_time: scene.end_time,
        playbackRate: 1.0,
        description: aiScene?.description || (skipAIDescription ? `Szene ${i + 1} (Beschreibung übersprungen — keine Frames)` : (deterministicScenes.length === 1 ? "Gesamtes Video" : `Szene ${i + 1}`)),
        mood,
        suggested_effects: (aiScene?.suggested_effects?.length >= 2)
          ? aiScene.suggested_effects
          : generateDefaultEffectsForMood(mood),
        ai_suggestions: aiScene?.ai_suggestions?.length > 0
          ? aiScene.ai_suggestions
          : ["Farbkorrektur empfohlen"],
      };
    });

    console.log(`[analyze-video-scenes] Final: ${finalScenes.map(s => `${s.id}:${s.start_time}-${s.end_time}s`).join(', ')}`);

    return new Response(
      JSON.stringify({ 
        scenes: finalScenes, 
        source: analysisMode,
        boundaries_used: allBoundaries.length,
        analysis_mode: analysisMode,
        boundary_source: boundary_source || 'auto',
        min_scene_duration: minSceneDuration,
        debug_boundary_times: allBoundaries.map(b => b.time),
        debug_dropped_boundaries: buildResult.dropped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyze-video-scenes] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Server-side scene detection: downloads the video, base64-encodes it,
 * and sends it to Gemini as actual video content (data:video/mp4;base64,...).
 * Gemini natively supports video analysis and can identify scene cuts.
 */
async function detectScenesFromVideo(
  videoUrl: string, 
  duration: number, 
  apiKey: string
): Promise<SceneBoundary[]> {
  // Step 1: Download video
  console.log(`[detectScenesFromVideo] Downloading video: ${videoUrl}`);
  const videoResponse = await fetch(videoUrl);
  
  if (!videoResponse.ok) {
    throw new Error(`Video download failed: ${videoResponse.status} ${videoResponse.statusText}`);
  }
  
  const videoBytes = await videoResponse.arrayBuffer();
  const videoSizeMB = videoBytes.byteLength / (1024 * 1024);
  console.log(`[detectScenesFromVideo] Downloaded ${videoSizeMB.toFixed(1)}MB`);
  
  // Raised inline limit — above this we rely on the frame-based path instead.
  if (videoSizeMB > 40) {
    throw new Error(`Video too large for inline analysis: ${videoSizeMB.toFixed(1)}MB (max 40MB) — client should provide frames`);
  }
  
  // Step 2: Base64 encode
  const uint8Array = new Uint8Array(videoBytes);
  let binary = '';
  // Process in chunks to avoid call stack overflow
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode(...chunk);
  }
  const base64Video = btoa(binary);
  
  // Determine MIME type from URL or default to mp4
  const mimeType = videoUrl.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4';
  const dataUri = `data:${mimeType};base64,${base64Video}`;
  
  console.log(`[detectScenesFromVideo] Encoded to base64 (${(base64Video.length / (1024 * 1024)).toFixed(1)}MB), sending to Gemini as ${mimeType}`);
  
  // Step 3: Send to Gemini Vision with video as data URI
  const prompt = `Du bist ein präziser Video-Schnitt-Detektor. Analysiere dieses ${duration.toFixed(1)} Sekunden lange Video und finde ALLE echten Szenenwechsel.

AUFGABE: Identifiziere die exakten Zeitpunkte (in Sekunden), an denen ein Szenenwechsel stattfindet.

Ein Szenenwechsel ist:
- Harter Schnitt (abrupter Wechsel zwischen zwei verschiedenen Szenen/Einstellungen)
- Weicher Übergang (Fade, Dissolve, Morph zwischen zwei verschiedenen Szenen)

KEIN Szenenwechsel ist:
- Kamerabewegung innerhalb derselben Szene
- Zoom in/out in derselben Szene  
- Helligkeitsänderung durch Lichtwechsel
- Gleiche Szene aus leicht anderem Winkel

WICHTIG: 
- Sei SEHR GENAU mit den Zeitangaben
- Gib nur ECHTE, eindeutige Szenenwechsel an
- Wenn es keine Szenenwechsel gibt, gib ein leeres Array zurück: []

Antworte NUR mit einem JSON-Array:
[
  { "time": 30.0, "type": "hard_cut", "confidence": 0.95, "description": "Wechsel von Szene A zu Szene B" }
]

Mögliche Typen: "hard_cut", "soft_transition"
confidence: 0.0 bis 1.0

Antworte NUR mit dem JSON-Array, kein weiterer Text!`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUri } }
        ]}
      ],
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 300)}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content || "";
  
  console.log(`[detectScenesFromVideo] Raw AI response: ${content.substring(0, 500)}`);
  
  const parsed = parseAIResponse(content);
  if (!parsed || !Array.isArray(parsed)) {
    console.log("[detectScenesFromVideo] Could not parse response as array, returning empty");
    return [];
  }

  // Filter valid boundaries — discard those too close to start/end (artifacts)
  const MIN_EDGE_DISTANCE = 3.0;
  const boundaries: SceneBoundary[] = [];
  for (const item of parsed) {
    const time = typeof item.time === 'number' ? item.time : parseFloat(item.time);
    const confidence = typeof item.confidence === 'number' ? item.confidence : 0.5;
    
    if (isNaN(time) || time < MIN_EDGE_DISTANCE || time > duration - MIN_EDGE_DISTANCE) continue;
    if (confidence < 0.5) continue;
    
    boundaries.push({
      time,
      type: item.type === 'soft_transition' ? 'soft_transition' : 'hard_cut',
      score: confidence,
    });
  }

  // Sort and deduplicate (merge boundaries within 2s of each other)
  boundaries.sort((a, b) => a.time - b.time);
  const deduped: SceneBoundary[] = [];
  for (const b of boundaries) {
    if (deduped.length === 0 || b.time - deduped[deduped.length - 1].time > 2.0) {
      deduped.push(b);
    } else if (b.score > deduped[deduped.length - 1].score) {
      deduped[deduped.length - 1] = b;
    }
  }

  console.log(`[detectScenesFromVideo] Final boundaries: ${deduped.map(b => `${b.time.toFixed(1)}s(${b.type},${b.score})`).join(', ')}`);
  return deduped;
}

// Build scenes from deterministic boundaries — AI CANNOT change these.
// Returns both the scenes and any boundaries that were dropped for diagnostics.
function buildDeterministicScenes(
  boundaries: SceneBoundary[],
  legacyCuts: number[],
  duration: number,
  minSceneDuration = 3.0
): { scenes: { start_time: number; end_time: number }[]; dropped: { time: number; reason: string }[] } {
  const cutTimes = boundaries.length > 0
    ? boundaries.map(b => b.time)
    : legacyCuts.length > 0
      ? legacyCuts
      : [];

  const dropped: { time: number; reason: string }[] = [];

  if (cutTimes.length === 0) {
    return { scenes: [{ start_time: 0, end_time: duration }], dropped };
  }

  const sorted = [...cutTimes].sort((a, b) => a - b);
  const scenes: { start_time: number; end_time: number }[] = [];
  let lastStart = 0;

  for (const t of sorted) {
    if (t <= lastStart + minSceneDuration) {
      dropped.push({ time: t, reason: `too_close_to_prev(<${minSceneDuration}s)` });
      continue;
    }
    if (t >= duration - minSceneDuration) {
      // Tail too short — still keep the cut for trusted (low minDur) sources,
      // but for a 3s safeguard drop it as before.
      if (minSceneDuration <= 1.0) {
        scenes.push({ start_time: lastStart, end_time: t });
        lastStart = t;
      } else {
        dropped.push({ time: t, reason: `too_close_to_end(<${minSceneDuration}s)` });
      }
      continue;
    }
    scenes.push({ start_time: lastStart, end_time: t });
    lastStart = t;
  }
  scenes.push({ start_time: lastStart, end_time: duration });

  return { scenes, dropped };
}

function parseAIResponse(content: string): any[] | null {
  try {
    let clean = content.trim();
    if (clean.startsWith("```json")) clean = clean.slice(7);
    if (clean.startsWith("```")) clean = clean.slice(3);
    if (clean.endsWith("```")) clean = clean.slice(0, -3);
    const parsed = JSON.parse(clean.trim());
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function generateDefaultEffectsForMood(mood: string) {
  const moodEffects: Record<string, any[]> = {
    dynamic: [
      { type: "filter", name: "vibrant", reason: "Verstärkt dynamische Energie", confidence: 0.85 },
      { type: "color", name: "saturation-130", reason: "Lebendige Farben", confidence: 0.8 }
    ],
    calm: [
      { type: "filter", name: "muted", reason: "Ruhige Stimmung", confidence: 0.85 },
      { type: "color", name: "brightness-105", reason: "Sanfte Aufhellung", confidence: 0.8 }
    ],
    energetic: [
      { type: "filter", name: "highkey", reason: "Energiegeladene Optik", confidence: 0.85 },
      { type: "color", name: "contrast-120", reason: "Verstärkter Kontrast", confidence: 0.8 }
    ],
    emotional: [
      { type: "filter", name: "cinematic", reason: "Filmische Tiefe", confidence: 0.85 },
      { type: "color", name: "saturation-90", reason: "Reduzierte Farben", confidence: 0.8 }
    ],
    neutral: [
      { type: "filter", name: "cinematic", reason: "Professioneller Look", confidence: 0.8 },
      { type: "color", name: "contrast-110", reason: "Leicht erhöhter Kontrast", confidence: 0.75 }
    ]
  };
  return moodEffects[mood] || moodEffects.neutral;
}

/**
 * Frame-based scene boundary detection. Sends a sequence of timestamped
 * thumbnails to Gemini and asks it to identify which timestamps mark a real
 * shot change. This works for arbitrarily large source videos because we
 * never upload the whole video — only ~30-80 small JPEG thumbs.
 */
async function detectScenesFromFrames(
  frames: Array<{ time: number; image: string }>,
  duration: number,
  apiKey: string
): Promise<SceneBoundary[]> {
  // Cap to ~60 frames evenly spaced to keep token usage sane.
  const MAX = 60;
  let sample = frames;
  if (frames.length > MAX) {
    const step = frames.length / MAX;
    sample = [];
    for (let i = 0; i < MAX; i++) sample.push(frames[Math.floor(i * step)]);
  }

  const indexList = sample
    .map((f, i) => `${i}: t=${f.time.toFixed(2)}s`)
    .join('\n');

  const systemPrompt = `Du bist ein präziser Shot-Boundary-Detektor (wie PySceneDetect / CapCut Auto-Cut).
Du bekommst nummerierte Frames eines ${duration.toFixed(1)}s langen Videos mit ihren Zeitstempeln.

AUFGABE: Identifiziere die Indizes, an denen ein ECHTER Szenenwechsel zwischen Frame i-1 und Frame i stattfindet.

Ein Szenenwechsel ist:
- Harter Schnitt (komplett anderes Bild, anderer Ort/Person/Einstellung)
- Weicher Übergang (Fade/Dissolve zu anderer Szene)

KEIN Szenenwechsel ist:
- Kamerabewegung in derselben Szene
- Zoom/Pan in derselben Szene
- Lichtwechsel/Helligkeit
- Person bewegt sich, Hintergrund bleibt
- Sprecher-Talking-Head ohne Cut

Frame-Index → Zeitstempel:
${indexList}

Antworte NUR mit JSON-Array:
[
  { "index": 7, "time": ${sample[Math.min(7, sample.length-1)].time.toFixed(2)}, "type": "hard_cut", "confidence": 0.92 }
]
Wenn keine Cuts → leeres Array []. Kein weiterer Text.`;

  const userContent: any[] = [{ type: "text", text: "Finde die echten Szenenwechsel." }];
  for (const f of sample) {
    userContent.push({ type: "image_url", image_url: { url: f.image, detail: "low" } });
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini frame analysis failed: ${response.status} - ${errText.substring(0, 200)}`);
  }

  const ai = await response.json();
  const content = ai.choices?.[0]?.message?.content || "";
  console.log(`[detectScenesFromFrames] Raw AI response: ${content.substring(0, 400)}`);
  const parsed = parseAIResponse(content);
  if (!parsed || !Array.isArray(parsed)) return [];

  const MIN_EDGE_DISTANCE = 1.5;
  const MIN_SPACING = 2.0;
  const boundaries: SceneBoundary[] = [];
  for (const item of parsed) {
    let time = typeof item.time === 'number' ? item.time : parseFloat(item.time);
    if (isNaN(time) && typeof item.index === 'number' && sample[item.index]) {
      time = sample[item.index].time;
    }
    const confidence = typeof item.confidence === 'number' ? item.confidence : 0.6;
    if (isNaN(time) || time < MIN_EDGE_DISTANCE || time > duration - MIN_EDGE_DISTANCE) continue;
    if (confidence < 0.5) continue;
    boundaries.push({
      time,
      type: item.type === 'soft_transition' ? 'soft_transition' : 'hard_cut',
      score: confidence,
    });
  }

  boundaries.sort((a, b) => a.time - b.time);
  const deduped: SceneBoundary[] = [];
  for (const b of boundaries) {
    if (deduped.length === 0 || b.time - deduped[deduped.length - 1].time > MIN_SPACING) {
      deduped.push(b);
    } else if (b.score > deduped[deduped.length - 1].score) {
      deduped[deduped.length - 1] = b;
    }
  }
  console.log(`[detectScenesFromFrames] Final boundaries: ${deduped.map(b => `${b.time.toFixed(2)}s(${b.type},${b.score.toFixed(2)})`).join(', ')}`);
  return deduped;
}
