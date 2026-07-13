// scene-director — natural-language scene builder
// Input: a free-text description (any language) + duration + the user's library
// Output: render-ready English aiPrompt, optional localized dialogScript,
//         matched library asset IDs, dropped actions, follow-up suggestions.
//
// The function never auto-creates assets — when the description mentions
// something the user doesn't own, we surface it as a `missingAssets` hint so
// the UI can show a one-click "Generate with AI" affordance into the existing
// generate-world-asset flow.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { SCENE_NEGATIVE_CLAUSE, SCENE_HARD_RULES_EN } from '../_shared/scene-director-rules.ts';

import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

interface AssetEntry {
  id: string;
  name: string;
  slug?: string;
  descriptor?: string | null;
}

interface DirectorRequest {
  description: string;
  durationSeconds: number;
  language?: 'en' | 'de' | 'es';
  brandKitContext?: string;
  realismPreset?: 'cinematic-spot' | 'documentary' | 'lifestyle-hero' | null;
  /** IDs the user already locked in the cast picker — MUST be matched + visible. */
  requiredCharacterIds?: string[];
  /** Names corresponding 1:1 to requiredCharacterIds (for prompt enforcement). */
  requiredCharacterNames?: string[];
  library: {
    characters?: AssetEntry[];
    locations?: AssetEntry[];
    buildings?: AssetEntry[];
    props?: AssetEntry[];
  };
}

// Inline realism profile contexts — must stay in sync with src/config/cinematicRealismPresets.ts
const REALISM_CONTEXTS: Record<string, string> = {
  'cinematic-spot': `REALISM PROFILE — CINEMATIC SPOT (TV commercial / brand film).
Prefer action beats that feel like a real commercial: driving establishing shots, hero close-ups during a meaningful action, push-ins on hands working with the product, slow steadicam glides through real environments. Lighting reads as "motivated practical + soft key", never flat. Camera operates with subtle breathing handheld or a Steadicam glide — never locked-off tripod for sprech moments. Treat dialog as voiceover-over-action, not as direct camera address, unless the user explicitly asks for a presenter shot.`,
  'documentary': `REALISM PROFILE — DOCUMENTARY / UGC AUTHENTIC.
Prefer captured-not-staged beats: subject mid-action, glancing at the camera mid-sentence, hands in motion, subtle imperfections (shallow handheld drift, natural reframe). Lighting is whatever the real scene would have — window light, lamp practicals, available sunlight. Camera is a small handheld lens at focal lengths between 24-35 mm, with believable micro-shake. Dialog is delivered casually while the subject keeps doing what they were doing.`,
  'lifestyle-hero': `REALISM PROFILE — LIFESTYLE HERO (aspirational brand film).
Prefer wide aspirational beats: subject moving through a beautiful location, golden-hour or magic-hour lighting, slow Steadicam orbits, hands interacting with hero props. Camera language is composed, deliberate, with anamorphic-style oval bokeh and cinematic depth of field. Dialog is delivered with confident, calm tonality while the subject continues a hero action (driving, walking, working, arriving).`,
};


const BUDGETS = [
  { upTo: 4,  maxActions: 1, maxCameraMoves: 1, maxScriptWords: 9,  maxAssets: 2 },
  { upTo: 6,  maxActions: 2, maxCameraMoves: 1, maxScriptWords: 14, maxAssets: 3 },
  { upTo: 9,  maxActions: 2, maxCameraMoves: 2, maxScriptWords: 20, maxAssets: 4 },
  { upTo: 12, maxActions: 3, maxCameraMoves: 2, maxScriptWords: 28, maxAssets: 5 },
  { upTo: 15, maxActions: 3, maxCameraMoves: 3, maxScriptWords: 35, maxAssets: 6 },
];

function pickBudget(d: number) {
  const dur = Math.max(3, Math.min(15, Math.round(d || 5)));
  const row = BUDGETS.find((r) => dur <= r.upTo) ?? BUDGETS[BUDGETS.length - 1];
  return { ...row, durationSeconds: dur };
}

async function sha1(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function libraryFingerprint(lib: DirectorRequest['library']): string {
  const ids = (arr?: AssetEntry[]) => (arr || []).map((a) => a.id).sort().join(',');
  return `c:${ids(lib.characters)}|l:${ids(lib.locations)}|b:${ids(lib.buildings)}|p:${ids(lib.props)}`;
}

function buildSystemPrompt(req: DirectorRequest): string {
  const b = pickBudget(req.durationSeconds);
  const lang = req.language ?? 'en';
  const fmt = (label: string, items?: AssetEntry[]) => {
    const list = (items || []).slice(0, 60);
    if (list.length === 0) return `${label}: (none)`;
    return `${label}:\n` + list.map((a) => `  • id="${a.id}" name="${a.name}"${a.descriptor ? ` — ${a.descriptor.slice(0, 140)}` : ''}`).join('\n');
  };

  const realismContext = req.realismPreset && REALISM_CONTEXTS[req.realismPreset]
    ? `\n${REALISM_CONTEXTS[req.realismPreset]}\n`
    : '';

  return `You are Scene Director — a cinematographer that turns ONE free-text scene description into ONE render-ready video prompt that produces REAL CINEMATIC ACTION, not a static talking-head bust.

DURATION: ${b.durationSeconds} seconds. BUDGET (hard limits — do NOT exceed):
- max ${b.maxActions} distinct visual actions
- max ${b.maxCameraMoves} camera movement(s)
- max ${b.maxScriptWords} spoken words (≈ 2.3 words/sec)
- max ${b.maxAssets} distinct on-screen subjects (people + objects + setting elements combined)

If the description has more than the budget allows, KEEP the most cinematic / most narratively important beat for THIS scene and put the rest into "droppedActions" + "followupSceneSuggestions" (one full description string per follow-up scene). Do NOT cram everything in.

${SCENE_HARD_RULES_EN}
${realismContext}
ACTION-FIRST DIRECTIVE (critical):
- ALWAYS deliver a concrete physical action for the on-screen character — driving, walking, working with hands, gesturing, looking around, reaching for something — even when dialog is present.
- NEVER write "person speaks directly to camera" unless the user explicitly asked for a presenter shot. Default is action + dialog as voiceover-over-action.
- The aiPrompt MUST describe body language, hands, environment motion (wind, light shifts, passing cars, etc.) and camera language. Never just face and lips.
- Populate \`actionBeat\` with: \`characterAction\` (what the character physically does — English, present continuous, one sentence), \`environmentMotion\` (what moves around them — English, one sentence), and \`motionIntensity\`:
    • static    → direct camera address bust (avoid unless explicitly asked)
    • subtle    → seated/standing while doing something small (sipping coffee, typing, glancing)
    • moderate  → walking, gesturing, working with hands, looking around an environment
    • high      → driving, running, riding, dancing, sports, anything with travel speed

LIBRARY MATCHING:
For every person, place, building or object the user mentions, find the best match in the library below by name + descriptor. Rules:
- Match generously (e.g. "Leopard tank" → a prop named "Leopard 2" or "Main Battle Tank"; "gothic cathedral" → a building named "Cathedral of Notre-Dame"). Use IDs from the library.
- If no good match exists, list the missing item under "missingAssets" with a one-line description so the UI can offer "Generate with AI".
- Set confidence: high = every named entity matched cleanly; medium = some matched + 1-2 missing; low = mostly missing or ambiguous.

CAST COVERAGE (critical — multi-character lip-sync depends on this):
- EVERY character listed in matchedAssets.characterIds MUST appear visibly in the aiPrompt action body, by name, doing something concrete.
- A character mentioned only in a "Featuring …:" / cast header DOES NOT COUNT. They need a verb in the action body.
- If you cannot fit all matched characters into the duration budget, then either:
    (a) drop them from matchedAssets.characterIds (do NOT keep them as "ghost" cast that is referenced but never seen), OR
    (b) split the overflow into followupSceneSuggestions.
- For ensemble scenes with 2+ characters: describe the spatial arrangement (side by side, facing each other, sitting around a table, walking together, intercut between desks). NEVER write a solo close-up scene while listing extra characters as matched — the downstream Multi-Portrait renderer will only see one face and the lip-sync face-map collapses.
- For 3-4 character scenes: prefer a wide group composition or fast intercuts between named subjects, not a single close-up on one face.

EXAMPLE — GOOD (3 cast members, all visible):
  matchedAssets.characterIds: [alice, bob, carol]
  aiPrompt: "Alice leans over the laptop pointing at the screen while Bob takes notes; Carol stands behind them holding a coffee cup, glancing toward the window. Wide ensemble shot, …"

EXAMPLE — FORBIDDEN (3 matched, only 1 acts):
  matchedAssets.characterIds: [alice, bob, carol]
  aiPrompt: "Alice stares at her laptop screen, overwhelmed, hand on her forehead. Close-up on her face."
  → Either rewrite to include Bob + Carol with concrete actions, OR drop them from characterIds.
${req.requiredCharacterIds && req.requiredCharacterIds.length > 0 && req.requiredCharacterNames?.length ? `
PRESELECTED CAST (the user already locked these slots — ALL of them MUST appear visibly in this scene's action body, by name, doing something concrete):
${req.requiredCharacterIds.map((id, i) => `  • id="${id}" name="${req.requiredCharacterNames![i] ?? ''}"`).join('\n')}
The matchedAssets.characterIds you return MUST include every preselected ID above. Do not silently drop them.
` : ''}
OUTPUT LANGUAGES:
- aiPrompt: English ALWAYS (visual model performance).
- dialogScript: ${lang} (the user's UI language). Empty string if no spoken line is needed.
- actionBeat fields: English ALWAYS.
- sceneActionEn: English ALWAYS. ONE sentence (≤ 25 words) that summarizes the on-screen action of THIS scene — exactly what is shown in the aiPrompt action body, without the cast header and without the negative clause.
- sceneActionLocalized: faithful ${lang} translation of sceneActionEn (identical string if ${lang} === 'en').
- perCharacterActions: EXACTLY one entry per character ID you return in matchedAssets.characterIds. Use the character's name + a concrete verb (≤ 12 words, English).
- perCharacterActionsLocalized: same entries, translated into ${lang}, same order and length.

${fmt('CHARACTERS', req.library.characters)}

${fmt('LOCATIONS', req.library.locations)}

${fmt('BUILDINGS', req.library.buildings)}

${fmt('PROPS', req.library.props)}

${req.brandKitContext ? `BRAND CONTEXT: ${req.brandKitContext}\n` : ''}
You MUST call the tool \`emitScene\` exactly once with the final result. Do not return prose.`;
}


const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'emitScene',
    description: 'Finalize the scene with a render-ready prompt and matched assets.',
    parameters: {
      type: 'object',
      properties: {
        aiPrompt: { type: 'string', description: 'English render-ready prompt, 50–80 words, ending with the mandatory negative clause.' },
        dialogScript: { type: 'string', description: 'Optional spoken line in the user UI language. Empty string if none.' },
        matchedAssets: {
          type: 'object',
          properties: {
            characterIds: { type: 'array', items: { type: 'string' } },
            locationIds: { type: 'array', items: { type: 'string' } },
            buildingIds: { type: 'array', items: { type: 'string' } },
            propIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['characterIds', 'locationIds', 'buildingIds', 'propIds'],
        },
        droppedActions: { type: 'array', items: { type: 'string' }, description: 'Beats from the user description that did not fit this scene\'s duration budget.' },
        followupSceneSuggestions: { type: 'array', items: { type: 'string' }, description: '0–2 ready-to-use scene descriptions for follow-up scenes, in the user language.' },
        missingAssets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['character', 'location', 'building', 'prop'] },
              name: { type: 'string' },
              suggestedPrompt: { type: 'string' },
            },
            required: ['kind', 'name', 'suggestedPrompt'],
          },
        },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        actionBeat: {
          type: 'object',
          description: 'Action-First cinematic layer. characterAction + environmentMotion are appended to the i2v prompt with higher priority than dialog so the renderer produces real motion, not a static talking-head bust.',
          properties: {
            characterAction: { type: 'string', description: 'English present-continuous sentence describing what the on-screen character physically does (e.g. "driving through golden-hour streets, hands relaxed on the wheel").' },
            environmentMotion: { type: 'string', description: 'English sentence describing what moves around the character (light, wind, traffic, weather, parallax, props).' },
            motionIntensity: { type: 'string', enum: ['static', 'subtle', 'moderate', 'high'] },
          },
          required: ['characterAction', 'environmentMotion', 'motionIntensity'],
        },
        sceneActionEn: { type: 'string', description: 'ONE English sentence summarizing what physically happens in the scene (mirrors the action body of aiPrompt, excluding cast header and negative clause). ≤ 25 words.' },
        sceneActionLocalized: { type: 'string', description: 'Faithful translation of sceneActionEn into the user UI language. Identical to sceneActionEn when UI language is en.' },
        perCharacterActions: {
          type: 'array',
          description: 'EXACTLY one entry per matchedAssets.characterIds member. Each entry describes what THIS character physically does in the scene, in English, ≤ 12 words, with a concrete verb. Required for multi-character lip-sync face-mapping.',
          items: {
            type: 'object',
            properties: {
              characterId: { type: 'string' },
              actionEn: { type: 'string' },
            },
            required: ['characterId', 'actionEn'],
          },
        },
        perCharacterActionsLocalized: {
          type: 'array',
          description: 'Same entries as perCharacterActions, translated into the user UI language. Same length and same order.',
          items: {
            type: 'object',
            properties: {
              characterId: { type: 'string' },
              action: { type: 'string' },
            },
            required: ['characterId', 'action'],
          },
        },
      },
      required: ['aiPrompt', 'matchedAssets', 'droppedActions', 'followupSceneSuggestions', 'missingAssets', 'confidence', 'actionBeat', 'sceneActionEn', 'perCharacterActions'],
    },
  },
};

async function callGateway(model: string, system: string, userMsg: string) {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'function', function: { name: 'emitScene' } },
      max_tokens: 1500,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(`gateway ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error('no tool call returned');
  return JSON.parse(call.function.arguments);
}

function ensureNegativeClause(prompt: string): string {
  const trimmed = (prompt || '').trim().replace(/[\s,]+$/, '');
  // remove any partial duplicate of the clause keywords at the end
  const stripped = trimmed.replace(/,?\s*no on-screen text[\s\S]*$/i, '');
  return stripped.replace(/[\s,]+$/, '') + SCENE_NEGATIVE_CLAUSE;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "scene-director" });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as DirectorRequest;
    if (!body?.description?.trim()) {
      return new Response(JSON.stringify({ error: 'description is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const dur = pickBudget(body.durationSeconds).durationSeconds;
    const lang = body.language ?? 'en';

    const requiredIdsKey = (body.requiredCharacterIds || []).slice().sort().join(',');
    const cacheKey = await sha1(`v4|${dur}|${lang}|${body.description.trim()}|${libraryFingerprint(body.library || {})}|${body.brandKitContext || ''}|${body.realismPreset || ''}|req:${requiredIdsKey}`);

    // 1) Try cache
    const { data: cached } = await supabase
      .from('scene_director_cache')
      .select('payload')
      .eq('user_id', userId)
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (cached?.payload) {
      return new Response(JSON.stringify({ ...cached.payload, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Call gateway with retry
    const system = buildSystemPrompt(body);
    const userMsg = `Scene description (any language; translate as needed):\n\n${body.description.trim()}`;

    let result: any;
    try {
      result = await callGateway('google/gemini-3-flash-preview', system, userMsg);
    } catch (e: any) {
      if (e.status === 429 || e.status === 402) {
        return new Response(JSON.stringify({ error: e.status === 402 ? 'AI credits exhausted — please add credits.' : 'Rate limited — please retry shortly.' }), {
          status: e.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.warn('[scene-director] primary failed, retrying flash:', e.message);
      result = await callGateway('google/gemini-2.5-flash', system, userMsg);
    }

    // 3) Server-side guarantees
    result.aiPrompt = ensureNegativeClause(String(result.aiPrompt || ''));
    result.matchedAssets ??= { characterIds: [], locationIds: [], buildingIds: [], propIds: [] };
    result.droppedActions ??= [];
    result.followupSceneSuggestions ??= [];
    result.missingAssets ??= [];
    result.confidence ??= 'medium';
    result.actionBeat ??= { characterAction: '', environmentMotion: '', motionIntensity: 'subtle' };
    if (!['static', 'subtle', 'moderate', 'high'].includes(result.actionBeat.motionIntensity)) {
      result.actionBeat.motionIntensity = 'subtle';
    }

    // Validate matched IDs actually exist in the supplied library
    const validIds = (kind: 'characters' | 'locations' | 'buildings' | 'props') =>
      new Set((body.library?.[kind] || []).map((a) => a.id));
    const cIds = validIds('characters');
    const lIds = validIds('locations');
    const bIds = validIds('buildings');
    const pIds = validIds('props');
    result.matchedAssets.characterIds = (result.matchedAssets.characterIds || []).filter((id: string) => cIds.has(id));
    result.matchedAssets.locationIds = (result.matchedAssets.locationIds || []).filter((id: string) => lIds.has(id));
    result.matchedAssets.buildingIds = (result.matchedAssets.buildingIds || []).filter((id: string) => bIds.has(id));
    result.matchedAssets.propIds = (result.matchedAssets.propIds || []).filter((id: string) => pIds.has(id));

    // 3b) Cast-coverage validator — drop "ghost cast" that's matched but
    // never named in the action body. Multi-Portrait renderers + Sync.so
    // face-map collapse if matched character count > visible-face count, so
    // a 1-face plate with 4 matched IDs is worse than an honest 1-face plate
    // with 1 matched ID. Also ensure preselected cast IDs survive even if
    // Gemini "forgot" to return them.
    {
      const charLib = body.library?.characters || [];
      const nameOf = (id: string) => charLib.find((c) => c.id === id)?.name || '';
      const promptLower = String(result.aiPrompt || '').toLowerCase();
      // Strip leading "Featuring …:" / "[Cast: …]" / "nName1 and Name2:" header
      // so the header itself doesn't count as "visible in action body".
      const body_only = String(result.aiPrompt || '')
        .replace(/^\s*Featuring\s+[^:]{1,400}:\s*/i, '')
        .replace(/^\s*\[Cast:[^\]]{1,400}\]\s*/i, '')
        .replace(/^\s*n[A-Z][A-Za-z .'\-]{1,200}:\s*/, '');
      const bodyLower = body_only.toLowerCase();

      const isVisible = (id: string): boolean => {
        const name = nameOf(id).toLowerCase().trim();
        if (!name) return false;
        if (bodyLower.includes(name)) return true;
        const first = name.split(/\s+/)[0];
        return !!(first && first.length >= 3 && bodyLower.includes(first));
      };

      // Preserve preselected IDs even if Gemini dropped them — the user
      // explicitly locked them in the cast picker.
      const required = new Set(body.requiredCharacterIds || []);
      const matchedSet = new Set<string>(result.matchedAssets.characterIds);
      for (const id of required) if (cIds.has(id)) matchedSet.add(id);

      const droppedGhostCast: string[] = [];
      const keptIds: string[] = [];
      for (const id of matchedSet) {
        if (required.has(id)) {
          // Required IDs stay regardless — they're the user's explicit
          // intent. Coverage will still be flagged by the client chip.
          keptIds.push(id);
        } else if (isVisible(id)) {
          keptIds.push(id);
        } else {
          droppedGhostCast.push(nameOf(id) || id);
        }
      }
      result.matchedAssets.characterIds = keptIds;
      result.droppedGhostCast = droppedGhostCast;
      // Surface coverage for the UI chip so it doesn't have to re-derive it.
      const missingRequired: string[] = [];
      for (const id of required) {
        if (cIds.has(id) && !isVisible(id)) missingRequired.push(nameOf(id) || id);
      }
      result.castCoverage = {
        ok: missingRequired.length === 0 && droppedGhostCast.length === 0,
        missingRequiredNames: missingRequired,
        droppedGhostCast,
      };
      if (missingRequired.length > 0 || droppedGhostCast.length > 0) {
        console.warn('[scene-director] cast coverage issue', {
          missingRequired,
          droppedGhostCast,
          promptHead: promptLower.slice(0, 200),
        });
      }
    }

    // 3c) Normalize Scene-Action + per-character action fields so the
    // composer UI can pre-fill the manual override fields. We:
    //  - ensure sceneActionEn exists (fallback: actionBeat.characterAction)
    //  - ensure sceneActionLocalized exists (fallback: sceneActionEn)
    //  - rebuild perCharacterActions(+Localized) to match the FINAL
    //    matchedAssets.characterIds (after ghost-cast drop). Missing entries
    //    fall back to actionBeat.characterAction so the field is at least
    //    seeded with something meaningful.
    {
      const rawScene = String(result.sceneActionEn || '').trim();
      const fallbackAction = String(result.actionBeat?.characterAction || '').trim();
      result.sceneActionEn = rawScene || fallbackAction;
      const rawSceneLocal = String(result.sceneActionLocalized || '').trim();
      result.sceneActionLocalized = rawSceneLocal || result.sceneActionEn;

      const rawPCA: Array<{ characterId: string; actionEn: string }> = Array.isArray(result.perCharacterActions)
        ? result.perCharacterActions
        : [];
      const rawPCAL: Array<{ characterId: string; action: string }> = Array.isArray(result.perCharacterActionsLocalized)
        ? result.perCharacterActionsLocalized
        : [];
      const enById = new Map(rawPCA.map((e) => [String(e.characterId), String(e.actionEn || '').trim()]));
      const locById = new Map(rawPCAL.map((e) => [String(e.characterId), String(e.action || '').trim()]));

      const finalIds: string[] = result.matchedAssets.characterIds || [];
      result.perCharacterActions = finalIds.map((id) => ({
        characterId: id,
        actionEn: enById.get(id) || fallbackAction || '',
      }));
      result.perCharacterActionsLocalized = finalIds.map((id) => ({
        characterId: id,
        action: locById.get(id) || enById.get(id) || fallbackAction || '',
      }));
    }

    result.budget = pickBudget(dur);

    // 4) Persist cache (best-effort)
    await supabase
      .from('scene_director_cache')
      .upsert({ user_id: userId, cache_key: cacheKey, payload: result }, { onConflict: 'user_id,cache_key' });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[scene-director] error', e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown error' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
