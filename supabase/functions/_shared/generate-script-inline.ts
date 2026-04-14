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

// Storytelling structure templates — localized
type Lang = 'en' | 'de' | 'es';

const STORYTELLING_STRUCTURES: Record<string, Record<Lang, { name: string; structure: string[] }>> = {
  '3-act': {
    de: { name: '3-Akt-Struktur', structure: ['Einleitung/Setup', 'Hauptteil/Konflikt', 'Auflösung/Schluss'] },
    en: { name: '3-Act Structure', structure: ['Introduction/Setup', 'Main Part/Conflict', 'Resolution/Conclusion'] },
    es: { name: 'Estructura de 3 actos', structure: ['Introducción/Setup', 'Parte principal/Conflicto', 'Resolución/Conclusión'] },
  },
  'hero-journey': {
    de: { name: 'Heldenreise', structure: ['Gewöhnliche Welt', 'Ruf zum Abenteuer', 'Weigerung', 'Mentor trifft Held', 'Überschreiten der Schwelle', 'Prüfungen', 'Tiefster Punkt', 'Belohnung', 'Rückkehr', 'Transformation'] },
    en: { name: 'Hero\'s Journey', structure: ['Ordinary World', 'Call to Adventure', 'Refusal', 'Meeting the Mentor', 'Crossing the Threshold', 'Trials', 'Darkest Moment', 'Reward', 'Return', 'Transformation'] },
    es: { name: 'Viaje del héroe', structure: ['Mundo ordinario', 'Llamada a la aventura', 'Rechazo', 'Encuentro con el mentor', 'Cruce del umbral', 'Pruebas', 'Momento más oscuro', 'Recompensa', 'Regreso', 'Transformación'] },
  },
  'aida': {
    de: { name: 'AIDA', structure: ['Attention (Aufmerksamkeit)', 'Interest (Interesse)', 'Desire (Verlangen)', 'Action (Handlung)'] },
    en: { name: 'AIDA', structure: ['Attention', 'Interest', 'Desire', 'Action'] },
    es: { name: 'AIDA', structure: ['Atención', 'Interés', 'Deseo', 'Acción'] },
  },
  'problem-solution': {
    de: { name: 'Problem-Lösung', structure: ['Problem vorstellen', 'Schmerzpunkte vertiefen', 'Lösung präsentieren', 'Benefits zeigen', 'CTA'] },
    en: { name: 'Problem-Solution', structure: ['Present the problem', 'Deepen pain points', 'Present the solution', 'Show benefits', 'CTA'] },
    es: { name: 'Problema-Solución', structure: ['Presentar el problema', 'Profundizar puntos de dolor', 'Presentar la solución', 'Mostrar beneficios', 'CTA'] },
  },
  'feature-showcase': {
    de: { name: 'Feature-Showcase', structure: ['Einleitung', 'Feature 1', 'Feature 2', 'Feature 3', 'Zusammenfassung', 'CTA'] },
    en: { name: 'Feature Showcase', structure: ['Introduction', 'Feature 1', 'Feature 2', 'Feature 3', 'Summary', 'CTA'] },
    es: { name: 'Showcase de funciones', structure: ['Introducción', 'Función 1', 'Función 2', 'Función 3', 'Resumen', 'CTA'] },
  },
  'testimonial-arc': {
    de: { name: 'Testimonial-Arc', structure: ['Vorstellung der Person', 'Problem beschreiben', 'Entdeckung der Lösung', 'Transformation', 'Empfehlung'] },
    en: { name: 'Testimonial Arc', structure: ['Introduce the person', 'Describe the problem', 'Discover the solution', 'Transformation', 'Recommendation'] },
    es: { name: 'Arco testimonial', structure: ['Presentar a la persona', 'Describir el problema', 'Descubrir la solución', 'Transformación', 'Recomendación'] },
  },
  'before-after': {
    de: { name: 'Vorher-Nachher', structure: ['Situation vorher', 'Der Wendepunkt', 'Situation nachher', 'Wie es funktioniert', 'CTA'] },
    en: { name: 'Before-After', structure: ['Situation before', 'The turning point', 'Situation after', 'How it works', 'CTA'] },
    es: { name: 'Antes-Después', structure: ['Situación antes', 'El punto de inflexión', 'Situación después', 'Cómo funciona', 'CTA'] },
  },
  'comparison': {
    de: { name: 'Vergleich', structure: ['Einleitung', 'Option A vorstellen', 'Option B vorstellen', 'Direkter Vergleich', 'Gewinner/Empfehlung'] },
    en: { name: 'Comparison', structure: ['Introduction', 'Present Option A', 'Present Option B', 'Direct comparison', 'Winner/Recommendation'] },
    es: { name: 'Comparación', structure: ['Introducción', 'Presentar opción A', 'Presentar opción B', 'Comparación directa', 'Ganador/Recomendación'] },
  },
  'list-format': {
    de: { name: 'Listenformat', structure: ['Hook', 'Punkt 1', 'Punkt 2', 'Punkt 3', 'Punkt 4', 'Punkt 5', 'Zusammenfassung'] },
    en: { name: 'List Format', structure: ['Hook', 'Point 1', 'Point 2', 'Point 3', 'Point 4', 'Point 5', 'Summary'] },
    es: { name: 'Formato de lista', structure: ['Gancho', 'Punto 1', 'Punto 2', 'Punto 3', 'Punto 4', 'Punto 5', 'Resumen'] },
  },
  'hook-value-cta': {
    de: { name: 'Hook-Value-CTA', structure: ['Starker Hook', 'Wert liefern', 'Mehr Wert', 'CTA'] },
    en: { name: 'Hook-Value-CTA', structure: ['Strong Hook', 'Deliver value', 'More value', 'CTA'] },
    es: { name: 'Gancho-Valor-CTA', structure: ['Gancho fuerte', 'Entregar valor', 'Más valor', 'CTA'] },
  },
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
    'storytelling': { 'hook': 'kenBurns', 'intro': 'fadeIn', 'problem': 'kenBurns', 'solution': 'fadeIn', 'feature': 'parallax', 'benefit': 'kenBurns', 'proof': 'fadeIn', 'cta': 'fadeIn', 'opening': 'kenBurns', 'rising_action': 'kenBurns', 'climax': 'parallax', 'falling_action': 'fadeIn', 'resolution': 'kenBurns', 'epilogue': 'fadeIn' },
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
    'storytelling': { 'hook': 'fadeWords', 'problem': 'typewriter', 'solution': 'fadeWords', 'feature': 'fadeWords', 'cta': 'fadeWords', 'opening': 'fadeWords', 'rising_action': 'typewriter', 'climax': 'fadeWords', 'falling_action': 'fadeWords', 'resolution': 'typewriter', 'epilogue': 'fadeWords' },
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
    // Storytelling: almost no SFX — music carries emotion
    if (category === 'storytelling') return 'none';
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
  // Storytelling: narrator gestures only — no pointing, no celebrating
  if (category === 'storytelling') {
    const map: Record<string, string> = { 'opening': 'idle', 'rising_action': 'explaining', 'climax': 'thinking', 'falling_action': 'explaining', 'resolution': 'idle', 'epilogue': 'idle', 'hook': 'idle', 'intro': 'idle', 'problem': 'thinking', 'solution': 'explaining', 'cta': 'idle' };
    return map[sceneType] || 'idle';
  }
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
  language: string = 'de',
): Promise<any> {
  const lang: Lang = (language === 'en' || language === 'es') ? language : 'de';
  const categoryKey = getCategoryKey(briefing.category || 'custom');
  const styleProfile = CATEGORY_STYLE_PROFILES[categoryKey] || CATEGORY_STYLE_PROFILES['custom'];

  console.log(`[generate-script-inline] Category: ${briefing.category} → Profile: ${categoryKey}, lang: ${lang}`);

  const structureSet = STORYTELLING_STRUCTURES[briefing.storytellingStructure] || STORYTELLING_STRUCTURES['problem-solution'];
  const structure = structureSet[lang] || structureSet['de'];
  const scenesCount = structure.structure.length;
  const effectiveDuration = briefing.videoDuration || briefing.duration || 60;
  const sceneDuration = Math.floor(effectiveDuration / scenesCount);

  const animGuide = `
ALLOWED ANIMATIONS for "${categoryKey}":
- animation: ${styleProfile.animationSet.map(a => `"${a}"`).join(' | ')}
- textAnimation: ${styleProfile.textAnimationSet.map(a => `"${a}"`).join(' | ')}

ANIMATIONS PER SCENE TYPE:
hook: animation="${getDefaultAnimation('hook', categoryKey)}" textAnimation="${getDefaultTextAnimation('hook', categoryKey)}" soundEffect="${getDefaultSoundEffect('hook', categoryKey)}"
problem: animation="${getDefaultAnimation('problem', categoryKey)}" textAnimation="${getDefaultTextAnimation('problem', categoryKey)}" soundEffect="${getDefaultSoundEffect('problem', categoryKey)}"
solution: animation="${getDefaultAnimation('solution', categoryKey)}" textAnimation="${getDefaultTextAnimation('solution', categoryKey)}" soundEffect="${getDefaultSoundEffect('solution', categoryKey)}"
feature: animation="${getDefaultAnimation('feature', categoryKey)}" textAnimation="${getDefaultTextAnimation('feature', categoryKey)}" soundEffect="${getDefaultSoundEffect('feature', categoryKey)}"
cta: animation="${getDefaultAnimation('cta', categoryKey)}" textAnimation="${getDefaultTextAnimation('cta', categoryKey)}" soundEffect="${getDefaultSoundEffect('cta', categoryKey)}"
`;

  const voiceoverLangMap: Record<Lang, string> = { de: 'DEUTSCH', en: 'ENGLISH', es: 'ESPAÑOL' };

  // Storytelling-specific scene types and rules
  const isStorytelling = categoryKey === 'storytelling';
  
  const storytellingSceneTypes = 'opening|rising_action|climax|falling_action|resolution|epilogue';
  const adSceneTypes = 'hook|problem|solution|feature|proof|cta|intro|benefit';
  const activeSceneTypes = isStorytelling ? storytellingSceneTypes : adSceneTypes;

  const coreRules = isStorytelling
    ? `
- visualDescription MUST be in ENGLISH (image generation)
- NOT allowed in visualDescription: "A person", "A man", "A woman", "hand", "finger", "Digital world", "Abstract shapes"
- Adapt EVERY visualDescription to visual style "${briefing.visualStyle || 'cinematic'}"
- NEVER describe objects with text/numbers (no dashboards, charts, monitors)
- Use ONLY animations from the allowed set for "${categoryKey}"!
- This is a STORYTELLING video. NO marketing language, NO sales pitch, NO CTA, NO website URL.
- Each scene builds emotional tension. Focus on characters, conflict, setting, mood.
- visualDescriptions should be CINEMATIC: atmospheric lighting, symbolic imagery, emotional landscapes.
- Show the STORY environment, not products or business contexts.`
    : `
- visualDescription MUST be in ENGLISH (image generation)
- NOT allowed in visualDescription: "A person", "A man", "A woman", "hand", "finger", "Digital world", "Abstract shapes"
- Adapt EVERY visualDescription to visual style "${briefing.visualStyle || 'modern-3d'}"
- CTA scene MUST include website URL "${briefing.websiteUrl || ''}" in voiceover
- NEVER describe objects with text/numbers (no dashboards, charts, monitors)
- Use ONLY animations from the allowed set for "${categoryKey}"!`;

  const storytellingGestures = 'thinking|explaining|idle|waving';
  const adGestures = 'pointing|thinking|celebrating|waving|idle|explaining';

  const jsonSchema = `{
  "title": "...", "totalDuration": ${effectiveDuration}, "category": "${categoryKey}",
  "scenes": [{ "sceneNumber": 1, "sceneType": "${activeSceneTypes}",
    "title": "...", "voiceover": "spoken text in ${voiceoverLangMap[lang]}...",
    "visualDescription": "ENGLISH image prompt...", "durationSeconds": ${sceneDuration},
    "animation": "from set", "kenBurnsDirection": "in|out|left|right", "textAnimation": "from set",
    "soundEffect": "${isStorytelling ? 'none' : 'whoosh|pop|success|alert|none'}", "showCharacter": true|false,
    "characterPosition": "left|right", "characterGesture": "${isStorytelling ? storytellingGestures : adGestures}",
    "statsOverlay": null, "beatAligned": false,
    "transitionIn": "fade|slide|zoom|morph|dissolve", "transitionOut": "fade|slide|zoom|morph|dissolve" }],
  "summary": "..." }`;

  const systemPromptIntro: Record<Lang, string> = {
    de: `Du bist ein erfahrener Drehbuchautor für professionelle, animierte Videos.\n\nWICHTIG: Du erstellst ein "${categoryKey}"-Video. Halte dich STRIKT an das Design-System!\n\nSTORYTELLING-STRUKTUR: ${structure.name}\nSZENEN: ${structure.structure.join(' → ')}\n\n${animGuide}\n\nREGELN:\n1. Erstelle genau ${scenesCount} Szenen\n2. Jede Szene ~${sceneDuration} Sekunden\n3. Sprechertext AUF ${voiceoverLangMap[lang]}\n${coreRules}\n\nAUSGABEFORMAT (JSON):\n${jsonSchema}`,
    en: `You are an experienced scriptwriter for professional, animated videos.\n\nIMPORTANT: You are creating a "${categoryKey}" video. Follow the design system STRICTLY!\n\nSTORYTELLING STRUCTURE: ${structure.name}\nSCENES: ${structure.structure.join(' → ')}\n\n${animGuide}\n\nRULES:\n1. Create exactly ${scenesCount} scenes\n2. Each scene ~${sceneDuration} seconds\n3. Write voiceover IN ${voiceoverLangMap[lang]}\n${coreRules}\n\nOUTPUT FORMAT (JSON):\n${jsonSchema}`,
    es: `Eres un guionista experimentado para videos profesionales y animados.\n\nIMPORTANTE: Estás creando un video "${categoryKey}". ¡Sigue el sistema de diseño ESTRICTAMENTE!\n\nESTRUCTURA: ${structure.name}\nESCENAS: ${structure.structure.join(' → ')}\n\n${animGuide}\n\nREGLAS:\n1. Crea exactamente ${scenesCount} escenas\n2. Cada escena ~${sceneDuration} segundos\n3. Narración EN ${voiceoverLangMap[lang]}\n${coreRules}\n\nFORMATO DE SALIDA (JSON):\n${jsonSchema}`,
  };
  const systemPrompt = systemPromptIntro[lang];

  const moodConfig = briefing.moodConfig;
  const moodInstructions = moodConfig ? `MOOD: "${moodConfig.preset}" | textDensity=${moodConfig.textDensity} | animIntensity=${moodConfig.animationIntensity}` : '';

  // Build user prompt — storytelling gets story-specific fields, others get marketing fields
  const storyFields = briefing.categorySpecific || {};
  const userPrompt = isStorytelling
    ? `Create a STORYTELLING video script — a cinematic narrative, NOT an advertisement:
${moodInstructions}
Story Mode: ${storyFields.storyMode || storyFields.storytellingSubMode || 'invented'}
Protagonist: ${storyFields.protagonist || briefing.productName || 'a person facing a challenge'}
Conflict: ${storyFields.conflict || briefing.coreProblem || 'an inner struggle'}
Setting: ${storyFields.setting || 'modern everyday environment'}
Turning Point: ${storyFields.turningPoint || storyFields.wendepunkt || 'a moment of realization'}
Moral/Message: ${storyFields.moral || storyFields.botschaft || briefing.keyMessage || 'transformation through courage'}
Emotional Tone: ${briefing.emotionalTone || 'emotional, cinematic'}
Visual Aesthetic: ${briefing.visualStyle || 'cinematic'} | Narrative Perspective: ${storyFields.perspective || 'third person'}
Motifs/Symbols: ${storyFields.motifs || storyFields.motive || '-'}
Colors: ${Array.isArray(briefing.brandColors) ? briefing.brandColors.join(', ') : (briefing.brandColors || 'warm cinematic tones')}
Duration: ${effectiveDuration}s | Format: ${briefing.aspectRatio || '16:9'}
${briefing.hasCharacter ? `Narrator Character: ${briefing.characterName || 'Narrator'} - acts as storyteller, NOT salesperson` : ''}
IMPORTANT: This is a STORY. No CTA, no URL, no sales pitch. Tell a compelling narrative!
IMPORTANT: Write ALL voiceover text in ${voiceoverLangMap[lang]}!`
    : `Create a ${briefing.category} video script ("${categoryKey}" style):
${moodInstructions}
Project: ${briefing.projectName || '-'} | Company: ${briefing.companyName || '-'}
Product: ${briefing.productName || '-'} | Description: ${briefing.productDescription || '-'}
Audience: ${briefing.targetAudience || 'General'} | Problem: ${briefing.coreProblem || '-'}
Solution: ${briefing.solution || '-'} | USPs: ${Array.isArray(briefing.uniqueSellingPoints) ? briefing.uniqueSellingPoints.join(', ') : (briefing.uniqueSellingPoints || '-')}
Key message: ${briefing.keyMessage || '-'} | CTA: ${briefing.ctaText || '-'}
Visual style: ${briefing.visualStyle || 'modern-3d'} | Tone: ${briefing.emotionalTone || 'professional'}
Colors: ${Array.isArray(briefing.brandColors) ? briefing.brandColors.join(', ') : (briefing.brandColors || 'Default')}
Duration: ${effectiveDuration}s | Format: ${briefing.aspectRatio || '16:9'} | URL: ${briefing.websiteUrl || '-'}
${briefing.hasCharacter ? `Character: ${briefing.characterName || 'Protagonist'} - ${briefing.characterDescription || 'Likeable'}` : ''}
Extra: ${JSON.stringify(briefing.categorySpecific || {})}
IMPORTANT: Write ALL voiceover text in ${voiceoverLangMap[lang]}!`;

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
