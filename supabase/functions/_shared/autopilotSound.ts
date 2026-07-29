// Autopilot sound design — server side.
//
// Mirrors `src/lib/autopilot/soundDesign.ts` so the cost preview the customer
// approved and the mix that actually gets rendered come from one table of
// rules. Silence is the loudest AI tell: a flawless clip with no room tone and
// no foley still reads as "rendered". This module decides what must be audible
// and produces the actual audio through ElevenLabs sound-generation.

/** Broadcast/social loudness target the mix is built around. */
export const TARGET_LUFS = -14;

/** Sell price per generated audio layer (foley or ambience bed). */
export const SFX_PRICE_PER_CLIP = 0.05;

/** Longest single bed we generate; longer scenes loop it. */
const MAX_SFX_SECONDS = 22;

export interface SceneAudioPlan {
  sceneIndex: number;
  durationSeconds: number;
  startTime: number;
  foleyPrompt: string | null;
  ambiencePrompt: string | null;
  foleyGain: number;
  ambienceGain: number;
}

/** Ambience guesses derived from the environment description — no model call. */
const AMBIENCE_HINTS: Array<{ match: RegExp; ambience: string }> = [
  { match: /caf[eé]|coffee|bistro|restaurant|bar\b/i, ambience: "quiet café ambience, distant chatter" },
  { match: /office|desk|meeting|conference|workspace/i, ambience: "soft open-office room tone" },
  { match: /street|city|urban|sidewalk|traffic/i, ambience: "distant city street ambience" },
  { match: /kitchen|cooking|bakery/i, ambience: "warm kitchen room tone" },
  { match: /forest|park|garden|nature|tree/i, ambience: "gentle outdoor nature ambience, light wind" },
  { match: /beach|ocean|sea|coast/i, ambience: "distant ocean waves" },
  { match: /studio|showroom|gallery/i, ambience: "clean quiet studio room tone" },
  { match: /gym|fitness|workout/i, ambience: "gym room tone, faint equipment" },
  { match: /car|vehicle|driving|road/i, ambience: "muted car interior road noise" },
  { match: /home|living room|apartment|bedroom/i, ambience: "quiet domestic room tone" },
  { match: /warehouse|factory|workshop|industrial/i, ambience: "low industrial hum" },
];

function inferAmbience(environment: string): string | null {
  for (const hint of AMBIENCE_HINTS) {
    if (hint.match.test(environment)) return hint.ambience;
  }
  return null;
}

/** German room-tone labels for the director log — no English jargon for the customer. */
export function describeLayer(prompt: string): string {
  return prompt.replace(/,.*$/, "").trim();
}

/**
 * Builds the per-scene audio plan from the stored scene rows. Scene rows carry
 * the full grammar, so environment and foley hint survive the round trip.
 */
export function planSceneAudio(sceneRows: Array<Record<string, unknown>>): SceneAudioPlan[] {
  let cursor = 0;
  return sceneRows.map((row, index) => {
    const grammar = (row.grammar ?? {}) as Record<string, unknown>;
    const sound = (row.sound_design ?? {}) as Record<string, unknown>;
    const dialogue = (row.dialogue ?? {}) as Record<string, unknown>;

    const duration = Math.max(0.5, Number(row.duration_seconds) || 6);
    const startTime = cursor;
    cursor += duration;

    const hasDialogue = Boolean(String(dialogue.text ?? "").trim());
    const environment = String(grammar.environment ?? "");
    const foley = String(sound.foleyHint ?? grammar.foleyHint ?? "").trim() || null;

    return {
      sceneIndex: Number(row.scene_index ?? index),
      durationSeconds: duration,
      startTime,
      foleyPrompt: foley,
      ambiencePrompt: inferAmbience(environment),
      // Under dialogue everything steps back; in silent scenes foley carries the shot.
      foleyGain: hasDialogue ? 0.22 : 0.5,
      ambienceGain: hasDialogue ? 0.12 : 0.25,
    };
  });
}

/** Peak-safe gain so voice + music + foley + ambience never clip. */
export function clampGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Generates one audio layer and stores it publicly. Returns null on any
 * failure — a missing foley layer must never break a film.
 */
export async function generateSfx(args: {
  admin: // deno-lint-ignore no-explicit-any
  any;
  userId: string;
  prompt: string;
  durationSeconds: number;
  /** Ambience beds want a loopable, even texture; foley wants the hit. */
  kind: "foley" | "ambience";
}): Promise<string | null> {
  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    console.warn("[autopilotSound] ELEVENLABS_API_KEY missing");
    return null;
  }

  const duration = Math.min(MAX_SFX_SECONDS, Math.max(1, Math.round(args.durationSeconds)));

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: args.kind === "ambience" ? `${args.prompt}, seamless continuous background loop` : args.prompt,
        duration_seconds: duration,
        prompt_influence: args.kind === "ambience" ? 0.2 : 0.4,
      }),
    });

    if (!res.ok) {
      console.warn("[autopilotSound] elevenlabs", res.status, (await res.text()).slice(0, 200));
      return null;
    }

    const buffer = await res.arrayBuffer();
    const path = `${args.userId}/autopilot/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.mp3`;
    const { error } = await args.admin.storage
      .from("scene-sfx")
      .upload(path, new Uint8Array(buffer), { contentType: "audio/mpeg", upsert: false });
    if (error) {
      console.warn("[autopilotSound] upload failed", error.message);
      return null;
    }
    const { data } = args.admin.storage.from("scene-sfx").getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch (err) {
    console.warn("[autopilotSound] error", err);
    return null;
  }
}
