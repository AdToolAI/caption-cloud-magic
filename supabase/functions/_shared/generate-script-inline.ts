/**
 * Inline script generation logic — extracted from generate-universal-script
 * to avoid Edge-to-Edge fetch timeouts (504 on cold starts).
 */

// Multi-stage JSON repair for malformed AI output
function tryRepairJson(raw: string): any | null {
  try { return JSON.parse(raw); } catch (_e) { /* continue */ }

  let cleaned = raw;
  cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '');

  try { return JSON.parse(cleaned); } catch (_e) { /* continue */ }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = cleaned.substring(firstBrace, lastBrace + 1)
      .replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
    try { return JSON.parse(extracted); } catch (_e) { /* continue */ }
  }
  return null;
}

async function retryAiForValidJson(
  apiKey: string,
  malformedContent: string,
  originalSystemPrompt: string
): Promise<any | null> {
  console.log('[JSON-Repair] Stage 4: Retrying AI for valid JSON...');
  const retryPrompt = `Dein letzter Output war kein valides JSON. Hier ist der fehlerhafte Output:\n\n---\n${malformedContent.substring(0, 3000)}\n---\n\nBitte gib EXAKT denselben Inhalt als VALIDES JSON zurück. NUR das JSON-Objekt, keine Erklärungen, kein Markdown.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: originalSystemPrompt },
          { role: 'user', content: retryPrompt }
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const retryContent = data.choices?.[0]?.message?.content;
    if (!retryContent) return null;
    return tryRepairJson(retryContent);
  } catch (_e) {
    return null;
  }
}

// Storytelling structure templates
const STORYTELLING_STRUCTURES: Record<string, { name: string; structure: string[] }> = {
  '3-act': { name: '3-Akt-Struktur', structure: ['Einleitung/Setup', 'Hauptteil/Konflikt', 'Auflösung/Schluss'] },
  'hero-journey': { name: 'Heldenreise', structure: ['Gewöhnliche Welt', 'Ruf zum Abenteuer', 'Weigerung', 'Mentor trifft Held', 'Überschreiten der Schwelle', 'Prüfungen', 'Tiefster Punkt', 'Belohnung', 'Rückkehr', 'Transformation'] },
  'aida': { name: 'AIDA', structure: ['Attention (Aufmerksamkeit)', 'Interest (Interesse)', 'Desire (Verlangen)', 'Action (Handlung)'] },
  'problem-solution': { name: 'Problem-Lösung', structure: ['Problem vorstellen', 'Schmerzpunkte vertiefen', 'Lösung präsentieren', 'Benefits zeigen', 'CTA'] },
  'feature-showcase': { name: 'Feature-Showcase', structure: ['Einleitung', 'Feature 1', 'Feature 2', 'Feature 3', 'Zusammenfassung', 'CTA'] },
  'testimonial-arc': { name: 'Testimonial-Arc', structure: ['Vorstellung der Person', 'Problem beschreiben', 'Entdeckung der Lösung', 'Transformation', 'Empfehlung'] },
  'before-after': { name: 'Vorher-Nachher', structure: ['Situation vorher', 'Der Wendepunkt', 'Situation nachher', 'Wie es funktioniert', 'CTA'] },
  'comparison': { name: 'Vergleich', structure: ['Einleitung', 'Option A vorstellen', 'Option B vorstellen', 'Direkter Vergleich', 'Gewinner/Empfehlung'] },
  'list-format': { name: 'Listenformat', structure: ['Hook', 'Punkt 1', 'Punkt 2', 'Punkt 3', 'Punkt 4', 'Punkt 5', 'Zusammenfassung'] },
  'hook-value-cta': { name: 'Hook-Value-CTA', structure: ['Starker Hook', 'Wert liefern', 'Mehr Wert', 'CTA'] },
};

interface CategoryStyleProfile {
  visualDirection: string;
  pacingGuide: string;
  animationSet: string[];
  textAnimationSet: string[];
  characterUsage: string;
  effectsProfile: string;
  transitionStyle: string;
  soundDesign: string;
  contrastOverlay: 'cinematic' | 'bold' | 'subtle' | 'clean' | 'dramatic';
}

const CATEGORY_STYLE_PROFILES: Record<string, CategoryStyleProfile> = {
  'advertisement': {
    visualDirection: 'Bold, hoher Kontrast, schnelle Schnitte. Markenfarben dominant. Jedes Frame muss verkaufen.',
    pacingGuide: 'Schnell: 3-5 Sekunden pro Szene. Hook maximal 2s.',
    animationSet: ['popIn', 'bounce', 'flyIn', 'slideUp'],
    textAnimationSet: ['bounceIn', 'glowPulse', 'splitReveal'],
    characterUsage: 'Minimal — nur in CTA-Szene als Presenter.',
    effectsProfile: 'PopIn für Produkt-Reveal, Bounce für CTA-Button, GlowPulse für Preise.',
    transitionStyle: 'Nur "slide" und "zoom". Schnell und energetisch.',
    soundDesign: 'Viele SFX: whoosh bei Transitions, pop bei Feature-Reveals, success bei CTA.',
    contrastOverlay: 'bold',
  },
  'storytelling': {
    visualDirection: 'Cinematic, warme Farbtöne, weiche Übergänge, emotionale Bildsprache.',
    pacingGuide: 'Langsam: 6-10 Sekunden pro Szene. Lass den Moment wirken.',
    animationSet: ['kenBurns', 'fadeIn', 'parallax'],
    textAnimationSet: ['fadeWords', 'typewriter'],
    characterUsage: 'Durchgehend sichtbar als Erzähler.',
    effectsProfile: 'NUR KenBurns und sanfte Parallax-Effekte.',
    transitionStyle: 'Nur "fade" und "dissolve". Langsam.',
    soundDesign: 'Wenig SFX. Musik trägt die Emotion.',
    contrastOverlay: 'cinematic',
  },
  'tutorial': {
    visualDirection: 'Clean, didaktisch, gut strukturiert. Helle Farben.',
    pacingGuide: 'Mittel: 5-8 Sekunden pro Szene.',
    animationSet: ['slideUp', 'fadeIn', 'flyIn'],
    textAnimationSet: ['typewriter', 'highlight', 'splitReveal'],
    characterUsage: 'Erklärer durchgehend sichtbar.',
    effectsProfile: 'SlideUp für Step-Reveals, Highlight für Schlüsselbegriffe.',
    transitionStyle: 'Nur "fade" und "slide". Clean.',
    soundDesign: 'Dezent: pop bei Step-Wechsel, success am Ende.',
    contrastOverlay: 'clean',
  },
  'product-video': {
    visualDirection: 'Premium, Showcase-Qualität. Produkt zentral.',
    pacingGuide: 'Mittel-schnell: 4-6 Sekunden pro Szene.',
    animationSet: ['parallax', 'morphIn', 'kenBurns', 'fadeIn'],
    textAnimationSet: ['splitReveal', 'glowPulse', 'fadeWords'],
    characterUsage: 'Minimal. Produkt ist der Star.',
    effectsProfile: 'Parallax für Tiefe, MorphIn für Produkt-Reveal.',
    transitionStyle: '"zoom" für Close-ups, "dissolve" zwischen Features.',
    soundDesign: 'Premium SFX: whoosh bei Reveals, pop bei Feature-Highlights.',
    contrastOverlay: 'dramatic',
  },
  'corporate': {
    visualDirection: 'Professionell, seriös, vertrauenswürdig.',
    pacingGuide: 'Mittel: 5-7 Sekunden pro Szene.',
    animationSet: ['fadeIn', 'slideUp'],
    textAnimationSet: ['fadeWords', 'highlight'],
    characterUsage: 'Sporadisch, formell.',
    effectsProfile: 'NUR FadeIn und SlideUp.',
    transitionStyle: 'Nur "fade". Langsam und professionell.',
    soundDesign: 'Minimal.',
    contrastOverlay: 'subtle',
  },
  'social-content': {
    visualDirection: 'Trendy, auffällig, Scroll-Stopping.',
    pacingGuide: 'Sehr schnell: 2-4 Sekunden pro Szene.',
    animationSet: ['popIn', 'bounce', 'flyIn'],
    textAnimationSet: ['bounceIn', 'glowPulse', 'waveIn'],
    characterUsage: 'Optional, casual.',
    effectsProfile: 'PopIn überall. GlowPulse auf Headlines.',
    transitionStyle: '"slide" und "push". Schnell.',
    soundDesign: 'Viele SFX: whoosh, pop, alert, success.',
    contrastOverlay: 'bold',
  },
  'testimonial': {
    visualDirection: 'Authentisch, vertrauensvoll, warm.',
    pacingGuide: 'Langsam-mittel: 5-8 Sekunden pro Szene.',
    animationSet: ['fadeIn', 'kenBurns'],
    textAnimationSet: ['fadeWords', 'highlight', 'typewriter'],
    characterUsage: 'Zitierende Person durchgehend sichtbar.',
    effectsProfile: 'NUR FadeIn.',
    transitionStyle: 'Nur "fade" und "dissolve".',
    soundDesign: 'Minimal.',
    contrastOverlay: 'cinematic',
  },
  'explainer': {
    visualDirection: 'Klar, strukturiert, informativ.',
    pacingGuide: 'Mittel: 5-7 Sekunden pro Szene.',
    animationSet: ['morphIn', 'slideUp', 'fadeIn', 'flyIn'],
    textAnimationSet: ['typewriter', 'splitReveal', 'highlight'],
    characterUsage: 'Durchgehend als Erklärer.',
    effectsProfile: 'MorphIn für Konzept-Transformationen.',
    transitionStyle: '"fade" und "morph".',
    soundDesign: 'Dezent: pop bei Konzept-Wechseln.',
    contrastOverlay: 'clean',
  },
  'event': {
    visualDirection: 'Energetisch, festlich, feierlich.',
    pacingGuide: 'Schnell: 3-5 Sekunden pro Szene.',
    animationSet: ['popIn', 'bounce', 'flyIn'],
    textAnimationSet: ['bounceIn', 'waveIn', 'glowPulse'],
    characterUsage: 'Sporadisch als Event-Host.',
    effectsProfile: 'PopIn für Datum/Location-Reveal.',
    transitionStyle: '"slide" und "zoom".',
    soundDesign: 'Energetisch.',
    contrastOverlay: 'bold',
  },
  'promo': {
    visualDirection: 'Spannend, teaserartig, mysteriös.',
    pacingGuide: 'Sehr schnell: 2-4 Sekunden pro Szene.',
    animationSet: ['morphIn', 'fadeIn', 'kenBurns', 'popIn'],
    textAnimationSet: ['glowPulse', 'splitReveal', 'typewriter'],
    characterUsage: 'Minimal.',
    effectsProfile: 'MorphIn für Mystery-Reveals.',
    transitionStyle: '"zoom" und "dissolve".',
    soundDesign: 'Dramatisch.',
    contrastOverlay: 'dramatic',
  },
  'presentation': {
    visualDirection: 'Clean, data-driven, professionell.',
    pacingGuide: 'Mittel: 5-8 Sekunden pro Szene.',
    animationSet: ['slideUp', 'fadeIn'],
    textAnimationSet: ['fadeWords', 'highlight', 'splitReveal'],
    characterUsage: 'Sporadisch als Moderator.',
    effectsProfile: 'SlideUp für Chart-Reveals.',
    transitionStyle: 'Nur "fade" und "slide".',
    soundDesign: 'Minimal.',
    contrastOverlay: 'clean',
  },
  'custom': {
    visualDirection: 'Flexibel — passe den Stil an die Briefing-Beschreibung an.',
    pacingGuide: 'Flexibel.',
    animationSet: ['fadeIn', 'slideUp', 'popIn', 'kenBurns', 'parallax', 'morphIn', 'flyIn', 'bounce'],
    textAnimationSet: ['fadeWords', 'typewriter', 'highlight', 'splitReveal', 'glowPulse', 'bounceIn', 'waveIn'],
    characterUsage: 'Nach Bedarf.',
    effectsProfile: 'Wähle passende Effekte.',
    transitionStyle: 'Mix.',
    soundDesign: 'Angemessen.',
    contrastOverlay: 'subtle',
  },
};

function getCategoryKey(category: string): string {
  const categoryMap: Record<string, string> = {
    'advertisement': 'advertisement', 'product-ad': 'advertisement',
    'storytelling': 'storytelling', 'brand-story': 'storytelling', 'behind-scenes': 'storytelling',
    'tutorial': 'tutorial', 'educational': 'tutorial',
    'product-video': 'product-video', 'showcase': 'product-video',
    'corporate': 'corporate',
    'social-content': 'social-content', 'social-reel': 'social-content',
    'testimonial': 'testimonial',
    'explainer': 'explainer',
    'event': 'event', 'event-promo': 'event',
    'promo': 'promo', 'announcement': 'promo',
    'presentation': 'presentation', 'comparison': 'presentation',
    'custom': 'custom',
  };
  return categoryMap[category] || 'custom';
}

function getDefaultAnimation(sceneType: string, category: string): string {
  const profile = CATEGORY_STYLE_PROFILES[category];
  if (!profile) return 'fadeIn';
  const categoryMaps: Record<string, Record<string, string>> = {
    'advertisement': { 'hook': 'popIn', 'intro': 'flyIn', 'problem': 'slideUp', 'solution': 'bounce', 'feature': 'popIn', 'benefit': 'flyIn', 'proof': 'slideUp', 'cta': 'bounce' },
    'storytelling': { 'hook': 'kenBurns', 'intro': 'fadeIn', 'problem': 'kenBurns', 'solution': 'fadeIn', 'feature': 'parallax', 'benefit': 'kenBurns', 'proof': 'fadeIn', 'cta': 'fadeIn' },
    'tutorial': { 'hook': 'slideUp', 'intro': 'fadeIn', 'problem': 'slideUp', 'solution': 'flyIn', 'feature': 'slideUp', 'benefit': 'slideUp', 'proof': 'fadeIn', 'cta': 'slideUp' },
    'product-video': { 'hook': 'morphIn', 'intro': 'fadeIn', 'problem': 'kenBurns', 'solution': 'parallax', 'feature': 'parallax', 'benefit': 'morphIn', 'proof': 'fadeIn', 'cta': 'morphIn' },
    'corporate': { 'hook': 'fadeIn', 'intro': 'fadeIn', 'problem': 'fadeIn', 'solution': 'slideUp', 'feature': 'slideUp', 'benefit': 'fadeIn', 'proof': 'fadeIn', 'cta': 'slideUp' },
    'social-content': { 'hook': 'popIn', 'intro': 'flyIn', 'problem': 'bounce', 'solution': 'popIn', 'feature': 'flyIn', 'benefit': 'popIn', 'proof': 'bounce', 'cta': 'bounce' },
    'testimonial': { 'hook': 'fadeIn', 'intro': 'fadeIn', 'problem': 'kenBurns', 'solution': 'fadeIn', 'feature': 'fadeIn', 'benefit': 'fadeIn', 'proof': 'fadeIn', 'cta': 'fadeIn' },
    'explainer': { 'hook': 'morphIn', 'intro': 'fadeIn', 'problem': 'slideUp', 'solution': 'morphIn', 'feature': 'flyIn', 'benefit': 'slideUp', 'proof': 'fadeIn', 'cta': 'slideUp' },
    'event': { 'hook': 'popIn', 'intro': 'flyIn', 'problem': 'bounce', 'solution': 'popIn', 'feature': 'flyIn', 'benefit': 'popIn', 'proof': 'bounce', 'cta': 'bounce' },
    'promo': { 'hook': 'morphIn', 'intro': 'fadeIn', 'problem': 'kenBurns', 'solution': 'morphIn', 'feature': 'fadeIn', 'benefit': 'popIn', 'proof': 'fadeIn', 'cta': 'popIn' },
    'presentation': { 'hook': 'slideUp', 'intro': 'fadeIn', 'problem': 'fadeIn', 'solution': 'slideUp', 'feature': 'slideUp', 'benefit': 'slideUp', 'proof': 'fadeIn', 'cta': 'slideUp' },
  };
  const map = categoryMaps[category];
  if (map && map[sceneType]) return map[sceneType];
  return profile.animationSet[0] || 'fadeIn';
}

function getDefaultTextAnimation(sceneType: string, category: string): string {
  const profile = CATEGORY_STYLE_PROFILES[category];
  if (!profile) return 'fadeWords';
  const categoryMaps: Record<string, Record<string, string>> = {
    'advertisement': { 'hook': 'bounceIn', 'problem': 'splitReveal', 'solution': 'glowPulse', 'feature': 'bounceIn', 'cta': 'glowPulse' },
    'storytelling': { 'hook': 'fadeWords', 'problem': 'typewriter', 'solution': 'fadeWords', 'feature': 'fadeWords', 'cta': 'fadeWords' },
    'tutorial': { 'hook': 'splitReveal', 'problem': 'typewriter', 'solution': 'highlight', 'feature': 'highlight', 'cta': 'splitReveal' },
    'product-video': { 'hook': 'splitReveal', 'problem': 'fadeWords', 'solution': 'glowPulse', 'feature': 'splitReveal', 'cta': 'glowPulse' },
    'corporate': { 'hook': 'fadeWords', 'problem': 'fadeWords', 'solution': 'highlight', 'feature': 'highlight', 'cta': 'fadeWords' },
    'social-content': { 'hook': 'bounceIn', 'problem': 'waveIn', 'solution': 'glowPulse', 'feature': 'bounceIn', 'cta': 'waveIn' },
    'testimonial': { 'hook': 'fadeWords', 'problem': 'typewriter', 'solution': 'highlight', 'feature': 'fadeWords', 'cta': 'highlight' },
    'explainer': { 'hook': 'splitReveal', 'problem': 'typewriter', 'solution': 'highlight', 'feature': 'splitReveal', 'cta': 'highlight' },
    'event': { 'hook': 'bounceIn', 'problem': 'waveIn', 'solution': 'glowPulse', 'feature': 'bounceIn', 'cta': 'waveIn' },
    'promo': { 'hook': 'glowPulse', 'problem': 'typewriter', 'solution': 'splitReveal', 'feature': 'glowPulse', 'cta': 'glowPulse' },
    'presentation': { 'hook': 'fadeWords', 'problem': 'fadeWords', 'solution': 'highlight', 'feature': 'splitReveal', 'cta': 'highlight' },
  };
  const map = categoryMaps[category];
  if (map && map[sceneType]) return map[sceneType];
  return profile.textAnimationSet[0] || 'fadeWords';
}

function getDefaultSoundEffect(sceneType: string, category: string): string {
  const quietCategories = ['storytelling', 'corporate', 'testimonial', 'presentation'];
  if (quietCategories.includes(category)) {
    if (sceneType === 'cta') return 'success';
    if (sceneType === 'hook' && category !== 'storytelling') return 'whoosh';
    return 'none';
  }
  const loudCategories = ['advertisement', 'social-content', 'event'];
  if (loudCategories.includes(category)) {
    const map: Record<string, string> = { 'hook': 'whoosh', 'intro': 'whoosh', 'problem': 'alert', 'solution': 'success', 'feature': 'pop', 'benefit': 'pop', 'proof': 'success', 'cta': 'success' };
    return map[sceneType] || 'pop';
  }
  const map: Record<string, string> = { 'hook': 'whoosh', 'problem': 'none', 'solution': 'success', 'feature': 'pop', 'cta': 'success' };
  return map[sceneType] || 'none';
}

function shouldShowCharacter(sceneType: string, category: string): boolean {
  if (['storytelling', 'tutorial', 'explainer'].includes(category)) return true;
  if (['product-video', 'promo', 'presentation'].includes(category)) return ['cta', 'intro'].includes(sceneType);
  if (category === 'corporate') return ['intro', 'cta'].includes(sceneType);
  return ['hook', 'problem', 'solution', 'cta', 'intro'].includes(sceneType);
}

function getDefaultCharacterPosition(sceneType: string): string {
  return sceneType === 'problem' ? 'left' : 'right';
}

function getDefaultCharacterGesture(sceneType: string, category: string): string {
  if (category === 'corporate') {
    const map: Record<string, string> = { 'hook': 'idle', 'intro': 'idle', 'problem': 'thinking', 'solution': 'explaining', 'cta': 'explaining' };
    return map[sceneType] || 'idle';
  }
  if (['social-content', 'event'].includes(category)) {
    const map: Record<string, string> = { 'hook': 'waving', 'intro': 'waving', 'problem': 'thinking', 'solution': 'celebrating', 'cta': 'pointing' };
    return map[sceneType] || 'celebrating';
  }
  const map: Record<string, string> = { 'hook': 'pointing', 'intro': 'waving', 'problem': 'thinking', 'solution': 'celebrating', 'feature': 'explaining', 'benefit': 'celebrating', 'proof': 'idle', 'testimonial': 'idle', 'cta': 'pointing' };
  return map[sceneType] || 'idle';
}

function getDefaultTransition(category: string): string {
  const transitionMap: Record<string, string> = {
    'advertisement': 'slide', 'storytelling': 'fade', 'tutorial': 'fade', 'product-video': 'dissolve',
    'corporate': 'fade', 'social-content': 'slide', 'testimonial': 'fade', 'explainer': 'fade',
    'event': 'slide', 'promo': 'zoom', 'presentation': 'slide', 'custom': 'fade',
  };
  return transitionMap[category] || 'fade';
}

/**
 * Generate a universal video script inline (no Edge-to-Edge fetch).
 * Returns the parsed script object or throws on failure.
 */
export async function generateScriptInline(
  briefing: any,
  apiKey: string,
  timeoutMs: number = 120000,
): Promise<any> {
  const categoryKey = getCategoryKey(briefing.category || 'custom');
  const styleProfile = CATEGORY_STYLE_PROFILES[categoryKey] || CATEGORY_STYLE_PROFILES['custom'];

  console.log(`[generate-script-inline] Category: ${briefing.category} → Profile: ${categoryKey}`);

  const structure = STORYTELLING_STRUCTURES[briefing.storytellingStructure] || STORYTELLING_STRUCTURES['problem-solution'];
  const scenesCount = structure.structure.length;
  const effectiveDuration = briefing.videoDuration || briefing.duration || 60;
  const sceneDuration = Math.floor(effectiveDuration / scenesCount);

  const categoryAnimationGuide = `
FORMAT-SPEZIFISCHES DESIGN-SYSTEM FÜR "${categoryKey.toUpperCase()}":
VISUELLER STIL: ${styleProfile.visualDirection}
TEMPO & PACING: ${styleProfile.pacingGuide}
ERLAUBTE ANIMATIONEN:
- animation: ${styleProfile.animationSet.map(a => `"${a}"`).join(' | ')}
- textAnimation: ${styleProfile.textAnimationSet.map(a => `"${a}"`).join(' | ')}
CHARACTER-EINSATZ: ${styleProfile.characterUsage}
EFFEKTE: ${styleProfile.effectsProfile}
ÜBERGÄNGE: ${styleProfile.transitionStyle}
SOUND-DESIGN: ${styleProfile.soundDesign}

ANIMATIONS PRO SZENEN-TYP:
hook: animation="${getDefaultAnimation('hook', categoryKey)}" textAnimation="${getDefaultTextAnimation('hook', categoryKey)}" soundEffect="${getDefaultSoundEffect('hook', categoryKey)}"
problem: animation="${getDefaultAnimation('problem', categoryKey)}" textAnimation="${getDefaultTextAnimation('problem', categoryKey)}" soundEffect="${getDefaultSoundEffect('problem', categoryKey)}"
solution: animation="${getDefaultAnimation('solution', categoryKey)}" textAnimation="${getDefaultTextAnimation('solution', categoryKey)}" soundEffect="${getDefaultSoundEffect('solution', categoryKey)}"
feature: animation="${getDefaultAnimation('feature', categoryKey)}" textAnimation="${getDefaultTextAnimation('feature', categoryKey)}" soundEffect="${getDefaultSoundEffect('feature', categoryKey)}"
cta: animation="${getDefaultAnimation('cta', categoryKey)}" textAnimation="${getDefaultTextAnimation('cta', categoryKey)}" soundEffect="${getDefaultSoundEffect('cta', categoryKey)}"
`;

  const systemPrompt = `Du bist ein erfahrener Drehbuchautor für professionelle, animierte Videos.

WICHTIG: Du erstellst ein "${categoryKey}"-Video. Halte dich STRIKT an das Design-System!

STORYTELLING-STRUKTUR: ${structure.name}
SZENEN: ${structure.structure.join(' → ')}

${categoryAnimationGuide}

REGELN:
1. Erstelle genau ${scenesCount} Szenen entsprechend der Struktur
2. Jede Szene hat ~${sceneDuration} Sekunden
3. Schreibe den Sprechertext (voiceover) für jede Szene
4. Die visualDescription MUSS auf ENGLISCH sein
5. Der Text muss natürlich klingen und zum Vorlesen geeignet sein
6. Verwende NUR Animationen aus dem erlaubten Set für "${categoryKey}"!
7. Jede visualDescription folgt: [OBJEKT/SZENE] + [ZUSTAND/DETAIL] + [UMGEBUNG] + [BELEUCHTUNG] — NIEMALS Menschen beschreiben!
   KRITISCH: Passe JEDE visualDescription an den visuellen Stil "${briefing.visualStyle || 'modern-3d'}" an!
   Style-spezifische Beschreibungsregeln:
   - comic/cartoon: "bold outlines, flat colors, cel-shaded, comic panel composition" — NIEMALS "volumetric lighting", "film grain", "shallow depth of field"
   - cinematic: "dramatic volumetric lighting, shallow depth of field, film grain, anamorphic" — NIEMALS "flat colors", "bold outlines"
   - watercolor: "soft watercolor washes, paper texture, gentle color bleeds, wet-on-wet" — NIEMALS "sharp edges", "neon", "3D render"
   - anime: "cel-shaded, vibrant anime colors, Studio Ghibli style background" — NIEMALS "photorealistic", "film grain"
   - neon-cyberpunk: "neon glow, dark background, electric colors, holographic" — NIEMALS "pastel", "watercolor", "hand-drawn"
   - vintage-retro: "muted 70s tones, halftone texture, nostalgic warm colors" — NIEMALS "neon", "cyberpunk", "modern 3D"
   - hand-drawn: "pencil sketch, crosshatching, charcoal texture, sketchbook" — NIEMALS "3D render", "neon", "photorealistic"
   - clay-3d: "claymation texture, plasticine, stop-motion, soft rounded shapes" — NIEMALS "flat 2D", "pencil sketch"
   - paper-cutout: "layered paper textures, cut paper edges, collage, craft paper" — NIEMALS "3D render", "photorealistic"
   - documentary: "naturalistic, muted earthy tones, observational composition" — OK mit "natural lighting"
   - minimalist: "vast negative space, single object, zen simplicity" — NIEMALS "busy", "cluttered", "many objects"
   - bold-colorful: "vivid saturated pop-art colors, Memphis design, high contrast" — NIEMALS "muted", "pastel", "minimal"
   - Für alle anderen Stile: passende Beschreibungen zum gewählten Stil verwenden!
   WICHTIG: Die visualDescription MUSS den gewählten Stil widerspiegeln, nicht den Standard-Cinematic-Look!
8. NICHT erlaubt in visualDescription: "A person", "A man", "A woman", "hand", "finger", "Digital world", "Abstract shapes"
9. Die CTA-Szene MUSS die Website-URL "${briefing.websiteUrl || ''}" im Voiceover enthalten
10. NIEMALS Objekte mit Text/Zahlen beschreiben (keine Dashboards, Charts, Monitore)

AUSGABEFORMAT (JSON):
{
  "title": "Videotitel",
  "totalDuration": ${effectiveDuration},
  "category": "${categoryKey}",
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneType": "hook|problem|solution|feature|proof|cta|intro|benefit",
      "title": "Szenen-Titel",
      "voiceover": "Der gesprochene Text...",
      "visualDescription": "ENGLISH image prompt...",
      "durationSeconds": ${sceneDuration},
      "animation": "aus erlaubtem Set",
      "kenBurnsDirection": "in|out|left|right",
      "textAnimation": "aus erlaubtem Set",
      "soundEffect": "whoosh|pop|success|alert|none",
      "showCharacter": true|false,
      "characterPosition": "left|right",
      "characterGesture": "pointing|thinking|celebrating|waving|idle|explaining",
      "statsOverlay": null,
      "beatAligned": false,
      "transitionIn": "fade|slide|zoom|morph|dissolve",
      "transitionOut": "fade|slide|zoom|morph|dissolve"
    }
  ],
  "summary": "Kurze Zusammenfassung"
}`;

  const moodConfig = briefing.moodConfig;
  const moodInstructions = moodConfig ? `
STIMMUNGS-PRESET: "${moodConfig.preset}"
- Text-Dichte: ${moodConfig.textDensity < 33 ? 'WENIG' : moodConfig.textDensity < 66 ? 'MITTEL' : 'VIEL'}
- Animations-Intensität: ${moodConfig.animationIntensity < 33 ? 'SUBTIL' : moodConfig.animationIntensity < 66 ? 'NORMAL' : 'DYNAMISCH'}
` : '';

  const userPrompt = `Erstelle ein ${briefing.category}-Video-Drehbuch im "${categoryKey}"-Stil:
${moodInstructions}
**Projekt:** ${briefing.projectName || 'Video-Projekt'}
**Unternehmen:** ${briefing.companyName || '-'}
**Produkt/Service:** ${briefing.productName || '-'}
**Beschreibung:** ${briefing.productDescription || '-'}
**Zielgruppe:** ${briefing.targetAudience || 'Allgemein'}
**Kernproblem:** ${briefing.coreProblem || '-'}
**Lösung:** ${briefing.solution || '-'}
**USPs:** ${Array.isArray(briefing.uniqueSellingPoints) ? briefing.uniqueSellingPoints.join(', ') : (briefing.uniqueSellingPoints || '-')}
**Kernbotschaft:** ${briefing.keyMessage || '-'}
**Gewünschte Aktion:** ${briefing.desiredAction || '-'}
**CTA-Text:** ${briefing.ctaText || '-'}
**Visueller Stil:** ${briefing.visualStyle || 'modern-3d'}
**Emotionaler Ton:** ${briefing.emotionalTone || 'professionell'}
**Markenfarben:** ${Array.isArray(briefing.brandColors) ? briefing.brandColors.join(', ') : (briefing.brandColors || 'Standard')}
**Videolänge:** ${effectiveDuration} Sekunden
**Format:** ${briefing.aspectRatio || '16:9'}
**Website/URL:** ${briefing.websiteUrl || '-'}
${briefing.hasCharacter ? `**Charakter:** ${briefing.characterName || 'Protagonist'} - ${briefing.characterDescription || 'Sympathische Figur'}` : ''}
**Zusätzliche Infos:** ${JSON.stringify(briefing.categorySpecific || {})}`;

  // Call AI with AbortController timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn('[generate-script-inline] First attempt timed out, retrying with faster model...');
      // Retry with faster model and shorter prompt
      const retryResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!retryResponse.ok) {
        throw new Error(`AI gateway retry error: ${retryResponse.status}`);
      }
      response = retryResponse;
    } else {
      throw err;
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response!.ok) {
    const errorText = await response!.text();
    console.error('[generate-script-inline] AI error:', response!.status, errorText);
    throw new Error(`AI gateway error: ${response!.status}`);
  }

  const data = await response!.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No script content generated');

  // Parse with multi-stage repair
  let script = tryRepairJson(content);
  if (!script) {
    console.warn('[generate-script-inline] Local JSON repairs failed, attempting AI retry...');
    script = await retryAiForValidJson(apiKey, content, systemPrompt);
  }
  if (!script) {
    throw new Error('Failed to parse script JSON after repair attempts');
  }

  // Add timing and enforce category constraints
  let currentTime = 0;
  script.scenes = script.scenes.map((scene: any) => {
    const sceneType = scene.sceneType || 'content';
    const validAnimation = styleProfile.animationSet.includes(scene.animation)
      ? scene.animation
      : getDefaultAnimation(sceneType, categoryKey);
    const validTextAnimation = styleProfile.textAnimationSet.includes(scene.textAnimation)
      ? scene.textAnimation
      : getDefaultTextAnimation(sceneType, categoryKey);

    const sceneWithTiming = {
      ...scene,
      startTime: currentTime,
      endTime: currentTime + scene.durationSeconds,
      animation: validAnimation,
      kenBurnsDirection: scene.kenBurnsDirection || 'in',
      textAnimation: validTextAnimation,
      soundEffect: scene.soundEffect || getDefaultSoundEffect(sceneType, categoryKey),
      showCharacter: scene.showCharacter ?? shouldShowCharacter(sceneType, categoryKey),
      characterPosition: scene.characterPosition || getDefaultCharacterPosition(sceneType),
      characterGesture: scene.characterGesture || getDefaultCharacterGesture(sceneType, categoryKey),
      statsOverlay: scene.statsOverlay || null,
      beatAligned: scene.beatAligned ?? (sceneType === 'cta'),
      transitionIn: scene.transitionIn || getDefaultTransition(categoryKey),
      transitionOut: scene.transitionOut || getDefaultTransition(categoryKey),
    };
    currentTime += scene.durationSeconds;
    return sceneWithTiming;
  });

  script.categoryProfile = categoryKey;
  script.contrastOverlay = styleProfile.contrastOverlay;

  console.log(`[generate-script-inline] Generated ${script.scenes.length} scenes, total ${currentTime}s`);
  return script;
}
