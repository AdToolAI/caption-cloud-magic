// supabase/functions/generate-ad-script/index.ts
// Generates per-beat ad copy lines for the Ad Director Mode.
// Uses Lovable AI Gateway (LOVABLE_API_KEY) — no external secret required.
//
// Input: { frameworkId, tonalityId, format, goal, language, productName,
//          productDescription, usps[], targetAudience }
// Output: { lines: string[] } — one short line per framework beat.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface FrameworkBeatLite {
  sceneType: string;
  hint: { de: string; en: string; es: string };
}

// Mirrors src/config/adStoryFrameworks.ts (kept tight for the LLM prompt).
const FRAMEWORK_BEATS: Record<string, FrameworkBeatLite[]> = {
  'problem-solution': [
    { sceneType: 'hook', hint: { de: 'Pattern Interrupt in 2s', en: 'Pattern interrupt in 2s', es: 'Pattern interrupt 2s' } },
    { sceneType: 'problem', hint: { de: 'Konkretes Pain Point', en: 'Concrete pain point', es: 'Punto de dolor concreto' } },
    { sceneType: 'solution', hint: { de: 'Hero Reveal + USP', en: 'Hero reveal + USP', es: 'Revelación + USP' } },
    { sceneType: 'social-proof', hint: { de: 'Zahl/Quote', en: 'Number/quote', es: 'Cifra/cita' } },
    { sceneType: 'cta', hint: { de: 'Klare Aktion', en: 'Clear action', es: 'Acción clara' } },
  ],
  'heros-journey': [
    { sceneType: 'hook', hint: { de: 'Charakter vorstellen', en: 'Introduce character', es: 'Presentar personaje' } },
    { sceneType: 'problem', hint: { de: 'Konflikt', en: 'Conflict', es: 'Conflicto' } },
    { sceneType: 'demo', hint: { de: 'Discovery', en: 'Discovery', es: 'Descubrimiento' } },
    { sceneType: 'solution', hint: { de: 'Transformation', en: 'Transformation', es: 'Transformación' } },
    { sceneType: 'cta', hint: { de: 'Tagline', en: 'Tagline', es: 'Eslogan' } },
  ],
  'testimonial': [
    { sceneType: 'hook', hint: { de: 'Opening Statement', en: 'Opening statement', es: 'Declaración inicial' } },
    { sceneType: 'social-proof', hint: { de: 'Konkrete Erfahrung', en: 'Concrete experience', es: 'Experiencia concreta' } },
    { sceneType: 'demo', hint: { de: 'B-Roll Aussage', en: 'B-roll statement', es: 'B-roll' } },
    { sceneType: 'cta', hint: { de: 'CTA mit Vertrauen', en: 'CTA with trust', es: 'CTA con confianza' } },
  ],
  'demo-feature': [
    { sceneType: 'hook', hint: { de: 'Produkt sofort zeigen', en: 'Show product now', es: 'Mostrar producto ya' } },
    { sceneType: 'demo', hint: { de: 'Hauptfeature', en: 'Main feature', es: 'Característica principal' } },
    { sceneType: 'demo', hint: { de: 'Zweite Funktion', en: 'Second function', es: 'Segunda función' } },
    { sceneType: 'cta', hint: { de: 'Preis + CTA', en: 'Price + CTA', es: 'Precio + CTA' } },
  ],
  'lifestyle-aspirational': [
    { sceneType: 'hook', hint: { de: 'Atmosphäre', en: 'Atmosphere', es: 'Atmósfera' } },
    { sceneType: 'solution', hint: { de: 'Casual Use', en: 'Casual use', es: 'Uso casual' } },
    { sceneType: 'solution', hint: { de: 'Detail-Cut', en: 'Detail cut', es: 'Detalle' } },
    { sceneType: 'cta', hint: { de: 'Subtile Endcard', en: 'Subtle end card', es: 'Cierre sutil' } },
  ],
  'comparison-switch': [
    { sceneType: 'hook', hint: { de: 'Frustration Status quo', en: 'Status quo frustration', es: 'Frustración statu quo' } },
    { sceneType: 'problem', hint: { de: 'Was läuft schief', en: 'What is wrong', es: 'Qué falla' } },
    { sceneType: 'solution', hint: { de: 'Eigenes Produkt besser', en: 'Own product better', es: 'Mejor producto' } },
    { sceneType: 'social-proof', hint: { de: 'Wechsler-Beweis', en: 'Switcher proof', es: 'Prueba cambio' } },
    { sceneType: 'cta', hint: { de: 'Wechsel-CTA', en: 'Switch CTA', es: 'CTA cambio' } },
  ],
  'brand-manifesto': [
    { sceneType: 'hook', hint: { de: 'Provokante Frage', en: 'Provocative question', es: 'Pregunta provocadora' } },
    { sceneType: 'solution', hint: { de: 'Marken-Werte', en: 'Brand values', es: 'Valores de marca' } },
    { sceneType: 'solution', hint: { de: 'Produkt als Symbol', en: 'Product as symbol', es: 'Producto símbolo' } },
    { sceneType: 'cta', hint: { de: 'Tagline + Logo', en: 'Tagline + logo', es: 'Eslogan + logo' } },
  ],
};

// Compact tonality summary for the LLM (full rules live in client config).
const TONALITY_RULES: Record<string, string> = {
  'minimal-premium':
    'Short sentences. Formal register. Third person. Present tense. No superlatives, no exclamation marks, no slang. Encourage nominal style and one-word lines.',
  'bold-challenger':
    'Short, punchy sentences. Casual register. Second person. Imperatives and direct questions. No hedging, no corporate speak.',
  'warm-storyteller':
    'Mixed length sentences. First person. Sensory details, time markers, human moments. Avoid statistics and hard sells.',
  'authentic-documentary':
    'Medium sentences. Neutral register. Third person. Include statistics, real-feeling quotes, specific names or dates. No fluff adjectives.',
  'playful-witty':
    'Mixed length. Casual register. Wordplay and surprise. Light humor, never sarcastic toward the audience.',
  'empathic-caring':
    'Medium length. Soft, supportive language. Second person. Acknowledge feelings before promoting solutions.',
  'visionary-inspiring':
    'Mixed length. Future tense allowed. Big-picture vocabulary. Avoid product features in favor of outcomes and meaning.',
  'practical-helpful':
    'Short to medium. Neutral register. Step-by-step phrasing. Concrete verbs. No abstract claims.',
  'edgy-provocative':
    'Short. Confrontational tone. Avoid slurs, profanity, or attacks on protected groups. Push social norms, not people.',
  'energetic-hype':
    'Very short, exclamatory. Casual register. Heavy verbs. Avoid more than one exclamation per line.',
  'trustworthy-expert':
    'Medium to long. Formal register. Third person. Use specific facts and credentials. No hype, no superlatives.',
  'joyful-optimistic':
    'Short to medium. Warm casual register. Positive framing. Avoid sarcasm and negative comparisons.',
};

const FORBIDDEN_BRAND_TERMS = [
  // Generic guardrail — forbid the most commonly trademarked brand-name patterns
  // from leaking into the generated copy.
  'apple', 'coca-cola', 'coca cola', 'pepsi', 'nike', 'adidas', 'samsung', 'google',
  'microsoft', 'amazon', 'tesla', 'mercedes', 'bmw', 'audi', 'red bull',
];

function sanitizeLine(line: string): string {
  let out = line.trim().replace(/^["“”'`]+|["“”'`]+$/g, '');
  for (const term of FORBIDDEN_BRAND_TERMS) {
    const re = new RegExp(`\\b${term}\\b`, 'gi');
    out = out.replace(re, '[brand]');
  }
  return out;
}

// Variant strategies — each describes a different angle for A/B testing.
const VARIANT_STRATEGIES: { id: string; label: string; instruction: string }[] = [
  {
    id: 'emotional',
    label: 'Emotional Hook',
    instruction:
      'Open with an emotional truth or feeling the audience can immediately relate to. Lean into pathos and human moments.',
  },
  {
    id: 'rational',
    label: 'Rational / Benefit',
    instruction:
      'Open with a clear, concrete benefit or fact. Lead with logic and proof. Numbers welcome.',
  },
  {
    id: 'curiosity',
    label: 'Curiosity Gap',
    instruction:
      'Open with an unexpected statement, contradiction or question that creates a curiosity gap. Make scrolling impossible.',
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      frameworkId,
      tonalityId,
      format,
      goal,
      language = 'de',
      productName,
      productDescription = '',
      usps = [],
      targetAudience = '',
      // Stage 2: when true, return 3 variants instead of one.
      generateVariants = false,
      // Optional brand kit hints (used to enrich brand mentions, NOT to clone other brands).
      brandName = '',
    } = body ?? {};

    if (!frameworkId || !tonalityId || !productName) {
      return new Response(
        JSON.stringify({ error: 'Missing frameworkId, tonalityId or productName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const beats = FRAMEWORK_BEATS[frameworkId];
    if (!beats) {
      return new Response(
        JSON.stringify({ error: `Unknown frameworkId: ${frameworkId}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tonalityRule = TONALITY_RULES[tonalityId] ?? TONALITY_RULES['minimal-premium'];
    const lang = (['de', 'en', 'es'].includes(language) ? language : 'de') as 'de' | 'en' | 'es';

    const beatList = beats
      .map((b, i) => `  ${i + 1}. [${b.sceneType}] ${b.hint[lang]}`)
      .join('\n');

    const langName = lang === 'de' ? 'German' : lang === 'es' ? 'Spanish' : 'English';

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const buildSystemPrompt = (extraInstruction: string) => `You are a senior advertising copywriter. You write professional ad copy that competes with the best global brands while being legally safe (no trademarked names, no defamation, no health/finance claims you cannot back up).

OUTPUT LANGUAGE: ${langName}
TONALITY RULES: ${tonalityRule}
${extraInstruction ? `\nVARIANT STRATEGY: ${extraInstruction}\n` : ''}
CRITICAL RULES:
- Never mention real third-party brand names (no Apple, Coca-Cola, Nike, etc.).
- Never make medical, financial or absolute superlative claims.
- Each line must work as on-screen text AND as voiceover (max ~12 words).
- Stay strictly within the tonality rules above.
- Output one line per beat in the requested order, plain text, one per line, no numbering, no quotes.`;

    const userPrompt = `PRODUCT: ${productName}${brandName ? ` (Brand: ${brandName})` : ''}
DESCRIPTION: ${productDescription}
USPS: ${usps.join(' | ') || '(none provided)'}
TARGET AUDIENCE: ${targetAudience || '(not specified)'}
FORMAT: ${format} · GOAL: ${goal}
FRAMEWORK BEATS (write ONE line for each, in this order):
${beatList}

Write exactly ${beats.length} lines. One line per beat. No numbering, no extra text.`;

    const callAi = async (extraInstruction: string): Promise<string[]> => {
      const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: buildSystemPrompt(extraInstruction) },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error('[generate-ad-script] AI gateway error:', aiRes.status, errText);
        throw new Error(`AI gateway error: ${aiRes.status}`);
      }

      const aiJson = await aiRes.json();
      const text: string = aiJson?.choices?.[0]?.message?.content ?? '';

      const rawLines = text
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((l: string) => l.replace(/^(\d+[.)]|[-•])\s*/, ''));

      const lines: string[] = [];
      for (let i = 0; i < beats.length; i++) {
        lines.push(sanitizeLine(rawLines[i] ?? ''));
      }
      return lines;
    };

    if (!generateVariants) {
      const lines = await callAi('');
      return new Response(JSON.stringify({ lines }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Generate 3 variants in parallel
    const settled = await Promise.allSettled(
      VARIANT_STRATEGIES.map((v) => callAi(v.instruction)),
    );

    const variants = settled.map((res, i) => ({
      id: VARIANT_STRATEGIES[i].id,
      label: VARIANT_STRATEGIES[i].label,
      lines: res.status === 'fulfilled' ? res.value : [],
      error: res.status === 'rejected' ? String(res.reason) : null,
    }));

    return new Response(JSON.stringify({ variants }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('[generate-ad-script] fatal:', err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
