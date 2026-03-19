import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Multi-stage JSON repair for malformed AI output
function tryRepairJson(raw: string): object | null {
  // Stage 1: Direct parse
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.log('[JSON-Repair] Stage 1 (direct) failed:', (e as Error).message);
  }

  let cleaned = raw;

  // Stage 2: Clean common AI issues
  cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  cleaned = cleaned.replace(/\/\/[^\n]*/g, '');

  try {
    const result = JSON.parse(cleaned);
    console.log('[JSON-Repair] Stage 2 (clean) succeeded');
    return result;
  } catch (e) {
    console.log('[JSON-Repair] Stage 2 (clean) failed:', (e as Error).message);
  }

  // Stage 3: Extract JSON block via regex
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = cleaned.substring(firstBrace, lastBrace + 1);
    const extractedCleaned = extracted.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
    try {
      const result = JSON.parse(extractedCleaned);
      console.log('[JSON-Repair] Stage 3 (regex extract) succeeded');
      return result;
    } catch (e) {
      console.log('[JSON-Repair] Stage 3 (regex extract) failed:', (e as Error).message);
    }
  }

  return null;
}

async function retryAiForValidJson(
  apiKey: string,
  malformedContent: string,
  originalSystemPrompt: string
): Promise<object | null> {
  console.log('[JSON-Repair] Stage 4: Retrying AI for valid JSON...');
  const retryPrompt = `Dein letzter Output war kein valides JSON. Hier ist der fehlerhafte Output:

---
${malformedContent.substring(0, 3000)}
---

Bitte gib EXAKT denselben Inhalt als VALIDES JSON zurück. NUR das JSON-Objekt, keine Erklärungen, kein Markdown. Achte auf:
- Keine Trailing Commas
- Alle Strings korrekt escaped (Anführungszeichen mit \\")
- Keine Kommentare im JSON`;

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

    if (!response.ok) {
      console.error('[JSON-Repair] Retry AI call failed:', response.status);
      return null;
    }

    const data = await response.json();
    const retryContent = data.choices?.[0]?.message?.content;
    if (!retryContent) return null;

    const result = tryRepairJson(retryContent);
    if (result) {
      console.log('[JSON-Repair] Stage 4 (AI retry) succeeded');
    } else {
      console.error('[JSON-Repair] Stage 4 (AI retry) also produced invalid JSON');
    }
    return result;
  } catch (e) {
    console.error('[JSON-Repair] Retry error:', e);
    return null;
  }
}

// Storytelling structure templates
const STORYTELLING_STRUCTURES: Record<string, { name: string; structure: string[] }> = {
  '3-act': {
    name: '3-Akt-Struktur',
    structure: ['Einleitung/Setup', 'Hauptteil/Konflikt', 'Auflösung/Schluss']
  },
  'hero-journey': {
    name: 'Heldenreise',
    structure: ['Gewöhnliche Welt', 'Ruf zum Abenteuer', 'Weigerung', 'Mentor trifft Held', 'Überschreiten der Schwelle', 'Prüfungen', 'Tiefster Punkt', 'Belohnung', 'Rückkehr', 'Transformation']
  },
  'aida': {
    name: 'AIDA',
    structure: ['Attention (Aufmerksamkeit)', 'Interest (Interesse)', 'Desire (Verlangen)', 'Action (Handlung)']
  },
  'problem-solution': {
    name: 'Problem-Lösung',
    structure: ['Problem vorstellen', 'Schmerzpunkte vertiefen', 'Lösung präsentieren', 'Benefits zeigen', 'CTA']
  },
  'feature-showcase': {
    name: 'Feature-Showcase',
    structure: ['Einleitung', 'Feature 1', 'Feature 2', 'Feature 3', 'Zusammenfassung', 'CTA']
  },
  'testimonial-arc': {
    name: 'Testimonial-Arc',
    structure: ['Vorstellung der Person', 'Problem beschreiben', 'Entdeckung der Lösung', 'Transformation', 'Empfehlung']
  },
  'before-after': {
    name: 'Vorher-Nachher',
    structure: ['Situation vorher', 'Der Wendepunkt', 'Situation nachher', 'Wie es funktioniert', 'CTA']
  },
  'comparison': {
    name: 'Vergleich',
    structure: ['Einleitung', 'Option A vorstellen', 'Option B vorstellen', 'Direkter Vergleich', 'Gewinner/Empfehlung']
  },
  'list-format': {
    name: 'Listenformat',
    structure: ['Hook', 'Punkt 1', 'Punkt 2', 'Punkt 3', 'Punkt 4', 'Punkt 5', 'Zusammenfassung']
  },
  'hook-value-cta': {
    name: 'Hook-Value-CTA',
    structure: ['Starker Hook', 'Wert liefern', 'Mehr Wert', 'CTA']
  }
};

// ============================================================
// 🎬 CATEGORY STYLE PROFILES — Format-spezifisches Design-System
// ============================================================

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
    visualDirection: 'Bold, hoher Kontrast, schnelle Schnitte. Markenfarben dominant. Jedes Frame muss verkaufen. Produkt immer im Fokus. Cleane Backgrounds mit Farbflächen oder Gradient.',
    pacingGuide: 'Schnell: 3-5 Sekunden pro Szene. Hook maximal 2s. Kein Moment der Langeweile. Jede Szene hat EINE klare Botschaft.',
    animationSet: ['popIn', 'bounce', 'flyIn', 'slideUp'],
    textAnimationSet: ['bounceIn', 'glowPulse', 'splitReveal'],
    characterUsage: 'Minimal — nur in CTA-Szene als Presenter. Kein Character in Produktszenen. Character zeigt auf Produkt/CTA.',
    effectsProfile: 'PopIn für Produkt-Reveal, Bounce für CTA-Button, GlowPulse für Preise/Angebote. KEINE subtilen Effekte.',
    transitionStyle: 'Nur "slide" und "zoom" Transitions. Schnell und energetisch. Kein Fade (zu langsam für Ads).',
    soundDesign: 'Viele SFX: whoosh bei Transitions, pop bei Feature-Reveals, success bei CTA. Jede Szene hat einen Sound.',
    contrastOverlay: 'bold',
  },
  'storytelling': {
    visualDirection: 'Cinematic, warme Farbtöne, weiche Übergänge, emotionale Bildsprache. Wie ein Kurzfilm. Tiefe, atmosphärische Bilder mit Bokeh-Effekt. Goldene Stunde, Dämmerung, intime Settings.',
    pacingGuide: 'Langsam: 6-10 Sekunden pro Szene. Lass den Moment wirken. Pausen zwischen Sätzen. Der Zuschauer soll fühlen, nicht nur verstehen.',
    animationSet: ['kenBurns', 'fadeIn', 'parallax'],
    textAnimationSet: ['fadeWords', 'typewriter'],
    characterUsage: 'Durchgehend sichtbar als Erzähler. Emotionale Gesten: thinking bei Reflexion, pointing bei Wendepunkten, celebrating beim Happy End.',
    effectsProfile: 'NUR KenBurns und sanfte Parallax-Effekte. KEINE PopIns, KEINE Bounces. Subtile Vignette-Schatten für Tiefe.',
    transitionStyle: 'Nur "fade" und "dissolve". Langsam (1s+). Crossfade zwischen Szenen für filmisches Feeling.',
    soundDesign: 'Wenig SFX. Maximal 1-2 dezente Sounds im gesamten Video. Musik trägt die Emotion, nicht die Soundeffekte.',
    contrastOverlay: 'cinematic',
  },
  'tutorial': {
    visualDirection: 'Clean, didaktisch, gut strukturiert. Helle Farben, klare Typografie, Step-Indikatoren (1, 2, 3). Jede Szene hat eine nummerierte Überschrift. Whiteboard-Ästhetik oder Clean-UI.',
    pacingGuide: 'Mittel: 5-8 Sekunden pro Szene. Genug Zeit zum Verstehen, aber nicht langweilig. Jeder Schritt hat eine klare Nummer.',
    animationSet: ['slideUp', 'fadeIn', 'flyIn'],
    textAnimationSet: ['typewriter', 'highlight', 'splitReveal'],
    characterUsage: 'Erklärer durchgehend sichtbar. Position: right. Gesten: explaining (Standard), pointing (bei wichtigen Schritten), celebrating (am Ende).',
    effectsProfile: 'SlideUp für Step-Reveals, Highlight-Underline für Schlüsselbegriffe. Stats-Overlay für Zahlen/Fakten. DrawOnEffect: checkmark bei erledigten Steps.',
    transitionStyle: 'Nur "fade" und "slide". Clean, professionell. Keine dramatischen Transitions.',
    soundDesign: 'Dezent: pop bei Step-Wechsel, success am Ende. Keine whoosh-Sounds. Klar und fokussiert.',
    contrastOverlay: 'clean',
  },
  'product-video': {
    visualDirection: 'Premium, Showcase-Qualität. Produkt zentral im Bild. Dunkle Hintergründe mit Spot-Beleuchtung. Studio-Ästhetik. Glänzende Oberflächen, Reflexionen.',
    pacingGuide: 'Mittel-schnell: 4-6 Sekunden pro Szene. Produkt-Reveal langsamer (6-8s), Features schneller (3-4s).',
    animationSet: ['parallax', 'morphIn', 'kenBurns', 'fadeIn'],
    textAnimationSet: ['splitReveal', 'glowPulse', 'fadeWords'],
    characterUsage: 'Minimal. Nur in Intro und CTA. Produkt ist der Star, nicht der Character.',
    effectsProfile: 'Parallax für Tiefe, MorphIn für Produkt-Reveal, SpotlightEffect für Features. GlowPulse auf Preis/USP.',
    transitionStyle: '"zoom" für Produkt-Close-ups, "dissolve" zwischen Features, "fade" für Intro/Outro.',
    soundDesign: 'Premium SFX: whoosh bei Reveals, pop bei Feature-Highlights. Elegante, nicht aggressive Sounds.',
    contrastOverlay: 'dramatic',
  },
  'corporate': {
    visualDirection: 'Professionell, seriös, vertrauenswürdig. Gedämpfte Farben (Navy, Grau, Weiß). Klare Linien, Business-Ästhetik. Büro-Szenen, Meetings, Handshakes.',
    pacingGuide: 'Mittel: 5-7 Sekunden pro Szene. Ruhig und kompetent. Keine Hektik.',
    animationSet: ['fadeIn', 'slideUp'],
    textAnimationSet: ['fadeWords', 'highlight'],
    characterUsage: 'Sporadisch, formell. Character trägt "Anzug" (default presenter). Gesten: explaining und idle. KEIN celebrating oder pointing.',
    effectsProfile: 'NUR FadeIn und SlideUp. KEINE Bounce, PopIn oder GlowPulse. Dezente Highlight-Underlines für Key Facts.',
    transitionStyle: 'Nur "fade". Langsam und professionell. Keine Wipes oder Zooms.',
    soundDesign: 'Minimal: maximal 1-2 dezente Sounds. Kein whoosh, kein pop. Nur subtle success am Ende.',
    contrastOverlay: 'subtle',
  },
  'social-content': {
    visualDirection: 'Trendy, auffällig, Scroll-Stopping. Neon-Farben, Bold-Typografie, Emojis als Design-Elemente. TikTok/Reels-Ästhetik. Volle Sättigung.',
    pacingGuide: 'Sehr schnell: 2-4 Sekunden pro Szene. Erster Frame muss fesseln. Pattern Interrupt in den ersten 0.5s.',
    animationSet: ['popIn', 'bounce', 'flyIn'],
    textAnimationSet: ['bounceIn', 'glowPulse', 'waveIn'],
    characterUsage: 'Optional, casual. Character wirkt wie ein Creator/Influencer. Gesten: waving, pointing, celebrating. Energetisch.',
    effectsProfile: 'PopIn überall. FloatingIcons mit Emojis. GlowPulse auf Headlines. Confetti bei Reveals. Maximale visuelle Energie.',
    transitionStyle: '"slide" und "push". Schnell und dynamisch. Wipe-Effekte erlaubt.',
    soundDesign: 'Viele SFX: whoosh, pop, alert, success. Jede Szene hat Sound. Beat-Aligned wenn möglich.',
    contrastOverlay: 'bold',
  },
  'testimonial': {
    visualDirection: 'Authentisch, vertrauensvoll, warm. Weiche Farben, natürliches Licht. Persönlich und nahbar. Gesichter im Fokus.',
    pacingGuide: 'Langsam-mittel: 5-8 Sekunden pro Szene. Lass die Person sprechen. Emotionale Momente atmen lassen.',
    animationSet: ['fadeIn', 'kenBurns'],
    textAnimationSet: ['fadeWords', 'highlight', 'typewriter'],
    characterUsage: 'Zitierende Person durchgehend sichtbar. Position: center oder right. Gesten: idle (Standard), thinking (beim Problem), celebrating (beim Ergebnis).',
    effectsProfile: 'NUR FadeIn. Quote-Highlight für Zitate (Anführungszeichen-Grafik). Stats-Overlay für Ergebnisse/Zahlen.',
    transitionStyle: 'Nur "fade" und "dissolve". Sanft und respektvoll.',
    soundDesign: 'Minimal: keine SFX außer dezentes success am Ende. Die Stimme dominiert.',
    contrastOverlay: 'cinematic',
  },
  'explainer': {
    visualDirection: 'Klar, strukturiert, informativ. Isometrische oder Flat-Design-Ästhetik. Diagramme, Icons, Prozess-Visualisierungen. Markenfarben konsequent.',
    pacingGuide: 'Mittel: 5-7 Sekunden pro Szene. Genug Zeit für Verständnis. Logischer Aufbau.',
    animationSet: ['morphIn', 'slideUp', 'fadeIn', 'flyIn'],
    textAnimationSet: ['typewriter', 'splitReveal', 'highlight'],
    characterUsage: 'Durchgehend als Erklärer sichtbar. Position: right. Gesten: explaining (Standard), pointing (bei wichtigen Punkten).',
    effectsProfile: 'MorphIn für Konzept-Transformationen. DrawOnEffect für Prozess-Schritte. Highlight-Underlines. Icons zur Visualisierung.',
    transitionStyle: '"fade" und "morph". Konzeptuelle Übergänge, die inhaltlich Sinn machen.',
    soundDesign: 'Dezent: pop bei Konzept-Wechseln, success bei Schlussfolgerung. Unterstützend, nicht ablenkend.',
    contrastOverlay: 'clean',
  },
  'event': {
    visualDirection: 'Energetisch, festlich, feierlich. Helle Farben, Konfetti-Elemente, Party-Ästhetik. Countdown-Feeling, Vorfreude.',
    pacingGuide: 'Schnell: 3-5 Sekunden pro Szene. Build-up zur Event-Enthüllung. Energie steigert sich.',
    animationSet: ['popIn', 'bounce', 'flyIn'],
    textAnimationSet: ['bounceIn', 'waveIn', 'glowPulse'],
    characterUsage: 'Sporadisch. Character als Event-Host. Gesten: waving, celebrating, pointing auf Datum/Location.',
    effectsProfile: 'PopIn für Datum/Location-Reveal. Bounce für Countdown. Konfetti (MorphTransition sparkle) bei Highlights. FloatingIcons mit Party-Emojis.',
    transitionStyle: '"slide" und "zoom". Dynamisch und feierlich.',
    soundDesign: 'Energetisch: whoosh bei Reveals, pop bei Highlights, success bei CTA. Beat-Aligned für musikalisches Feeling.',
    contrastOverlay: 'bold',
  },
  'promo': {
    visualDirection: 'Spannend, teaserartig, mysteriös. Dunkle Hintergründe mit starken Akzentfarben. Blur-Reveals, Silhouetten. Kino-Trailer-Ästhetik.',
    pacingGuide: 'Sehr schnell: 2-4 Sekunden pro Szene. Schnelle Schnitte. Tease, nicht alles zeigen. Spannung aufbauen.',
    animationSet: ['morphIn', 'fadeIn', 'kenBurns', 'popIn'],
    textAnimationSet: ['glowPulse', 'splitReveal', 'typewriter'],
    characterUsage: 'Minimal. Character nur als Silhouette oder Mystery-Element. Kein freundliches Waving.',
    effectsProfile: 'MorphIn für Mystery-Reveals. GlowPulse für Teaser-Text. SpotlightEffect für dramatische Momente. Vignette-Schatten.',
    transitionStyle: '"zoom" und "dissolve". Dramatisch und spannungsreich.',
    soundDesign: 'Dramatisch: alert bei Spannungsmomenten, whoosh bei Reveals, success beim großen Reveal. Cinematic Sounds.',
    contrastOverlay: 'dramatic',
  },
  'presentation': {
    visualDirection: 'Clean, data-driven, professionell. Infografiken, Charts, Statistiken. Business-Blue und Grau. Slide-Deck-Ästhetik.',
    pacingGuide: 'Mittel: 5-8 Sekunden pro Szene. Daten brauchen Lesezeit. Strukturiert wie eine Keynote.',
    animationSet: ['slideUp', 'fadeIn'],
    textAnimationSet: ['fadeWords', 'highlight', 'splitReveal'],
    characterUsage: 'Sporadisch als Moderator. Gesten: explaining, pointing auf Daten. Formell.',
    effectsProfile: 'SlideUp für Chart-Reveals. Stats-Overlay für Zahlen. Highlight für Key Insights. KEINE Bounces oder PopIns.',
    transitionStyle: 'Nur "fade" und "slide". Clean und professionell. Slide-Deck-Feeling.',
    soundDesign: 'Minimal: pop bei Slide-Wechsel. Keine dramatischen Sounds. Professionell.',
    contrastOverlay: 'clean',
  },
  'custom': {
    visualDirection: 'Flexibel — passe den Stil an die Briefing-Beschreibung an. Sei kreativ, aber konsistent innerhalb des Videos.',
    pacingGuide: 'Flexibel — richte dich nach der Video-Länge und dem Thema. Verteile die Zeit gleichmäßig.',
    animationSet: ['fadeIn', 'slideUp', 'popIn', 'kenBurns', 'parallax', 'morphIn', 'flyIn', 'bounce'],
    textAnimationSet: ['fadeWords', 'typewriter', 'highlight', 'splitReveal', 'glowPulse', 'bounceIn', 'waveIn'],
    characterUsage: 'Nach Bedarf. Richte dich nach dem Briefing.',
    effectsProfile: 'Wähle passende Effekte basierend auf dem Szenen-Typ und der Stimmung.',
    transitionStyle: 'Mix aus allen verfügbaren Transitions. Passe zum Inhalt.',
    soundDesign: 'Angemessen zum Inhalt. Nicht zu viel, nicht zu wenig.',
    contrastOverlay: 'subtle',
  },
};

// Map category names from frontend to profile keys
function getCategoryKey(category: string): string {
  const categoryMap: Record<string, string> = {
    'advertisement': 'advertisement',
    'product-ad': 'advertisement',
    'storytelling': 'storytelling',
    'brand-story': 'storytelling',
    'tutorial': 'tutorial',
    'educational': 'tutorial',
    'product-video': 'product-video',
    'showcase': 'product-video',
    'corporate': 'corporate',
    'social-content': 'social-content',
    'social-reel': 'social-content',
    'testimonial': 'testimonial',
    'explainer': 'explainer',
    'event': 'event',
    'event-promo': 'event',
    'promo': 'promo',
    'announcement': 'promo',
    'presentation': 'presentation',
    'comparison': 'presentation',
    'behind-scenes': 'storytelling',
    'custom': 'custom',
  };
  return categoryMap[category] || 'custom';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { briefing } = await req.json();
    
    if (!briefing) {
      throw new Error('Briefing is required');
    }

    const categoryKey = getCategoryKey(briefing.category || 'custom');
    const styleProfile = CATEGORY_STYLE_PROFILES[categoryKey] || CATEGORY_STYLE_PROFILES['custom'];

    console.log(`[generate-universal-script] Category: ${briefing.category} → Profile: ${categoryKey}, Structure: ${briefing.storytellingStructure}`);

    const structure = STORYTELLING_STRUCTURES[briefing.storytellingStructure] || STORYTELLING_STRUCTURES['problem-solution'];
    const scenesCount = structure.structure.length;
    const effectiveDuration = briefing.videoDuration || briefing.duration || 60;
    const sceneDuration = Math.floor(effectiveDuration / scenesCount);

    // Build category-specific animation guide
    const categoryAnimationGuide = `
FORMAT-SPEZIFISCHES DESIGN-SYSTEM FÜR "${categoryKey.toUpperCase()}":

VISUELLER STIL:
${styleProfile.visualDirection}

TEMPO & PACING:
${styleProfile.pacingGuide}

ERLAUBTE ANIMATIONEN (NUR diese verwenden!):
- animation: ${styleProfile.animationSet.map(a => `"${a}"`).join(' | ')}
- textAnimation: ${styleProfile.textAnimationSet.map(a => `"${a}"`).join(' | ')}

CHARACTER-EINSATZ:
${styleProfile.characterUsage}

EFFEKTE:
${styleProfile.effectsProfile}

ÜBERGÄNGE:
${styleProfile.transitionStyle}

SOUND-DESIGN:
${styleProfile.soundDesign}

ANIMATIONS PRO SZENEN-TYP (angepasst an ${categoryKey}):

hook/intro Szene:
- animation: "${getDefaultAnimation('hook', categoryKey)}"
- textAnimation: "${getDefaultTextAnimation('hook', categoryKey)}"
- soundEffect: "${getDefaultSoundEffect('hook', categoryKey)}"
- showCharacter: ${shouldShowCharacter('hook', categoryKey)}, characterPosition: "right", characterGesture: "pointing"

problem Szene:
- animation: "${getDefaultAnimation('problem', categoryKey)}"
- textAnimation: "${getDefaultTextAnimation('problem', categoryKey)}"
- soundEffect: "${getDefaultSoundEffect('problem', categoryKey)}"
- showCharacter: ${shouldShowCharacter('problem', categoryKey)}, characterPosition: "left", characterGesture: "thinking"

solution Szene:
- animation: "${getDefaultAnimation('solution', categoryKey)}"
- textAnimation: "${getDefaultTextAnimation('solution', categoryKey)}"
- soundEffect: "${getDefaultSoundEffect('solution', categoryKey)}"
- showCharacter: ${shouldShowCharacter('solution', categoryKey)}, characterPosition: "right", characterGesture: "celebrating"

feature/benefit Szene:
- animation: "${getDefaultAnimation('feature', categoryKey)}"
- textAnimation: "${getDefaultTextAnimation('feature', categoryKey)}"
- soundEffect: "${getDefaultSoundEffect('feature', categoryKey)}"
- statsOverlay: Zahlen/Fakten als Array z.B. ["85% Erfolgsrate", "+200% ROI"]
- showCharacter: ${shouldShowCharacter('feature', categoryKey)}

proof/testimonial Szene:
- animation: "${getDefaultAnimation('proof', categoryKey)}"
- textAnimation: "${getDefaultTextAnimation('proof', categoryKey)}"
- soundEffect: "${getDefaultSoundEffect('proof', categoryKey)}"
- showCharacter: ${shouldShowCharacter('proof', categoryKey)}

cta Szene:
- animation: "${getDefaultAnimation('cta', categoryKey)}"
- textAnimation: "${getDefaultTextAnimation('cta', categoryKey)}"
- soundEffect: "${getDefaultSoundEffect('cta', categoryKey)}"
- showCharacter: ${shouldShowCharacter('cta', categoryKey)}, characterPosition: "right", characterGesture: "pointing"
- beatAligned: true
`;

    const systemPrompt = `Du bist ein erfahrener Drehbuchautor für professionelle, animierte Videos im Stil von Loft-Film.

WICHTIG: Du erstellst ein "${categoryKey}"-Video. Halte dich STRIKT an das Design-System für diese Kategorie!

STORYTELLING-STRUKTUR: ${structure.name}
SZENEN: ${structure.structure.join(' → ')}

${categoryAnimationGuide}

REGELN:
1. Erstelle genau ${scenesCount} Szenen entsprechend der Struktur
2. Jede Szene hat ~${sceneDuration} Sekunden
3. Schreibe den Sprechertext (voiceover) für jede Szene
4. Die visualDescription MUSS auf ENGLISCH sein (wird direkt als KI-Bildgenerator-Prompt verwendet)
5. Der Text muss natürlich klingen und zum Vorlesen geeignet sein
6. Keine Füllwörter wie "Also", "Ich habe", etc.
7. WICHTIG: Verwende NUR Animationen aus dem erlaubten Set für "${categoryKey}"!
8. WICHTIG: Halte dich an das Pacing-Guide für "${categoryKey}"!
9. Jede Szene braucht einen KONTRAST-OVERLAY-freundlichen Text (weiß auf dunklem Hintergrund)
10. Die visualDescription MUSS eine KONKRETE Szene beschreiben die zum Voiceover passt — nicht abstrakt, sondern wie ein Filmstill
11. Beziehe das Produkt/Unternehmen "${briefing.companyName || briefing.productName || ''}" in die Szenen ein — zeige realistische Nutzungssituationen der UMGEBUNG und OBJEKTE
12. Jede visualDescription folgt dem Schema: [OBJEKT/SZENE] + [ZUSTAND/DETAIL] + [UMGEBUNG] + [BELEUCHTUNG] — NIEMALS Menschen, Personen, Silhouetten, Hände, Finger oder Körperteile beschreiben! Die Szene zeigt NUR die Umgebung, Möbel, Geräte und Objekte. Animierte Charaktere werden separat hinzugefügt.
13. NICHT erlaubt in visualDescription: "Digital world", "Social media icons flying", "Abstract shapes", "City skyline", "A person", "A man", "A woman", "someone", "manager", "user", "customer", "employee", "hand", "finger" — stattdessen KONKRETE Umgebungen und Objekte OHNE Menschen (z.B. "A tidy desk with a closed laptop, potted plants, warm light")
14. Die CTA-Szene MUSS die vollständige Website-URL "${briefing.websiteUrl || ''}" im Voiceover enthalten (z.B. "Besuchen Sie www.example.com"). URL NICHT abkürzen oder weglassen!
15. NIEMALS Objekte beschreiben die inhärent Text oder Zahlen anzeigen: Keine Dashboards, Kalender, Charts, Diagramme, Bildschirme mit Daten, Monitore mit UI, Analytics-Interfaces, Spreadsheets, Whiteboards mit Notizen, Graphen, Tabellen. Stattdessen die PHYSISCHE Umgebung beschreiben: Möbel, Pflanzen, Lampen, Büromaterial, Architektur, Beleuchtung, Texturen.

AUSGABEFORMAT (JSON):
{
  "title": "Videotitel",
  "totalDuration": ${briefing.videoDuration},
  "category": "${categoryKey}",
  "scenes": [
    {
      "sceneNumber": 1,
      "sceneType": "hook|problem|solution|feature|proof|cta|intro|benefit|testimonial",
      "title": "Szenen-Titel (kurz, prägnant)",
      "voiceover": "Der gesprochene Text für diese Szene...",
      "visualDescription": "ENGLISH image prompt. Concrete scene WITHOUT people and WITHOUT text-bearing objects: [Object/Scene] + [State/Detail] + [Environment] + [Lighting]. NEVER describe humans, persons, silhouettes, hands, or body parts. NEVER describe dashboards, calendars, charts, monitors showing data, analytics interfaces, spreadsheets, or any object that inherently displays text/numbers. Example: 'A tidy desk with a closed laptop, potted plants, a warm desk lamp, bright office with glass walls, golden hour light, shallow depth of field'",
      "durationSeconds": ${sceneDuration},
      
      "animation": "NUR aus erlaubtem Set",
      "kenBurnsDirection": "in|out|left|right",
      "textAnimation": "NUR aus erlaubtem Set",
      "soundEffect": "whoosh|pop|success|alert|none",
      
      "showCharacter": true|false,
      "characterPosition": "left|right",
      "characterGesture": "pointing|thinking|celebrating|waving|idle|explaining",
      
      "statsOverlay": ["Statistik 1", "Statistik 2"] | null,
      "beatAligned": true|false,
      
      "transitionIn": "fade|slide|zoom|morph|dissolve",
      "transitionOut": "fade|slide|zoom|morph|dissolve"
    }
  ],
  "summary": "Kurze Zusammenfassung des Videos"
}

WICHTIG: Jede Szene MUSS die Animations-Parameter enthalten! Verwende NUR Animationen aus dem erlaubten Set für "${categoryKey}".`;

    // Build mood config instructions if provided
    const moodConfig = briefing.moodConfig;
    const moodInstructions = moodConfig ? `
STIMMUNGS-PRESET: "${moodConfig.preset}"
- Text-Dichte: ${moodConfig.textDensity < 33 ? 'WENIG Text — nur Headlines und Keywords, kurze Sätze' : moodConfig.textDensity < 66 ? 'MITTEL — ausgewogene Mischung aus Headlines und Erklärungen' : 'VIEL Text — ausführliche Erklärungen, Storytelling, längere Sätze'}
- Animations-Intensität: ${moodConfig.animationIntensity < 33 ? 'SUBTIL — sanfte, langsame Animationen. Bevorzuge fadeIn, kenBurns' : moodConfig.animationIntensity < 66 ? 'NORMAL — ausgewogene Animationen' : 'DYNAMISCH — energetische, schnelle Animationen. Bevorzuge popIn, bounce, flyIn'}
- Szenen-Badges: ${moodConfig.showSceneBadges ? 'JA — verwende prägnante Szenen-Titel' : 'NEIN — keine expliziten Szenen-Label'}
` : '';

    const userPrompt = `Erstelle ein ${briefing.category}-Video-Drehbuch im "${categoryKey}"-Stil mit VOLLSTÄNDIGEN ANIMATIONS-ANWEISUNGEN:
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

**Videolänge:** ${briefing.videoDuration} Sekunden
**Format:** ${briefing.aspectRatio || '16:9'}
**Website/URL:** ${briefing.websiteUrl || '-'}

${briefing.hasCharacter ? `**Charakter:** ${briefing.characterName || 'Protagonist'} - ${briefing.characterDescription || 'Sympathische Figur'}` : `**Charakter:** Aktiviere showCharacter gemäß "${categoryKey}"-Profil`}

**Zusätzliche Infos:** ${JSON.stringify(briefing.categorySpecific || {})}

ERINNERUNG: Verwende NUR Animationen/Effekte aus dem "${categoryKey}"-Design-System! Halte das Tempo/Pacing gemäß Profil ein!`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-universal-script] AI error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No script content generated');
    }

    // Parse JSON from response with multi-stage repair
    let script = tryRepairJson(content);
    
    // Stage 4: AI retry if all local repairs failed
    if (!script) {
      console.warn('[generate-universal-script] All local JSON repairs failed, attempting AI retry...');
      script = await retryAiForValidJson(LOVABLE_API_KEY, content, systemPrompt);
    }
    
    if (!script) {
      console.error('[generate-universal-script] JSON parse failed after all repair stages. Raw content length:', content.length);
      throw new Error('Failed to parse script JSON after repair attempts');
    }
    
    console.log('[generate-universal-script] Script JSON parsed successfully');

    // Add timing, enforce category constraints, and ensure animation defaults
    let currentTime = 0;
    script.scenes = script.scenes.map((scene: any, index: number) => {
      const sceneType = scene.sceneType || 'content';
      
      // Validate animation is in the allowed set for this category
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
        // Enforce category-valid animations
        animation: validAnimation,
        kenBurnsDirection: scene.kenBurnsDirection || 'in',
        textAnimation: validTextAnimation,
        soundEffect: scene.soundEffect || getDefaultSoundEffect(sceneType, categoryKey),
        showCharacter: scene.showCharacter ?? shouldShowCharacter(sceneType, categoryKey),
        characterPosition: scene.characterPosition || getDefaultCharacterPosition(sceneType, categoryKey),
        characterGesture: scene.characterGesture || getDefaultCharacterGesture(sceneType, categoryKey),
        statsOverlay: scene.statsOverlay || null,
        beatAligned: scene.beatAligned ?? (sceneType === 'cta'),
        transitionIn: scene.transitionIn || getDefaultTransition(categoryKey),
        transitionOut: scene.transitionOut || getDefaultTransition(categoryKey),
      };
      currentTime += scene.durationSeconds;
      return sceneWithTiming;
    });

    // Attach category metadata for downstream rendering
    script.categoryProfile = categoryKey;
    script.contrastOverlay = styleProfile.contrastOverlay;

    console.log(`[generate-universal-script] Generated ${script.scenes.length} scenes with ${categoryKey} design system, total ${currentTime}s`);

    return new Response(JSON.stringify({ script }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-universal-script] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============================================================
// Helper functions with category-aware defaults
// ============================================================

function getDefaultAnimation(sceneType: string, category: string): string {
  const profile = CATEGORY_STYLE_PROFILES[category];
  if (!profile) return 'fadeIn';

  // Category-specific scene-type mappings
  const categoryMaps: Record<string, Record<string, string>> = {
    'advertisement': {
      'hook': 'popIn', 'intro': 'flyIn', 'problem': 'slideUp', 'solution': 'bounce',
      'feature': 'popIn', 'benefit': 'flyIn', 'proof': 'slideUp', 'cta': 'bounce',
    },
    'storytelling': {
      'hook': 'kenBurns', 'intro': 'fadeIn', 'problem': 'kenBurns', 'solution': 'fadeIn',
      'feature': 'parallax', 'benefit': 'kenBurns', 'proof': 'fadeIn', 'cta': 'fadeIn',
    },
    'tutorial': {
      'hook': 'slideUp', 'intro': 'fadeIn', 'problem': 'slideUp', 'solution': 'flyIn',
      'feature': 'slideUp', 'benefit': 'slideUp', 'proof': 'fadeIn', 'cta': 'slideUp',
    },
    'product-video': {
      'hook': 'morphIn', 'intro': 'fadeIn', 'problem': 'kenBurns', 'solution': 'parallax',
      'feature': 'parallax', 'benefit': 'morphIn', 'proof': 'fadeIn', 'cta': 'morphIn',
    },
    'corporate': {
      'hook': 'fadeIn', 'intro': 'fadeIn', 'problem': 'fadeIn', 'solution': 'slideUp',
      'feature': 'slideUp', 'benefit': 'fadeIn', 'proof': 'fadeIn', 'cta': 'slideUp',
    },
    'social-content': {
      'hook': 'popIn', 'intro': 'flyIn', 'problem': 'bounce', 'solution': 'popIn',
      'feature': 'flyIn', 'benefit': 'popIn', 'proof': 'bounce', 'cta': 'bounce',
    },
    'testimonial': {
      'hook': 'fadeIn', 'intro': 'fadeIn', 'problem': 'kenBurns', 'solution': 'fadeIn',
      'feature': 'fadeIn', 'benefit': 'fadeIn', 'proof': 'fadeIn', 'cta': 'fadeIn',
    },
    'explainer': {
      'hook': 'morphIn', 'intro': 'fadeIn', 'problem': 'slideUp', 'solution': 'morphIn',
      'feature': 'flyIn', 'benefit': 'slideUp', 'proof': 'fadeIn', 'cta': 'slideUp',
    },
    'event': {
      'hook': 'popIn', 'intro': 'flyIn', 'problem': 'bounce', 'solution': 'popIn',
      'feature': 'flyIn', 'benefit': 'popIn', 'proof': 'bounce', 'cta': 'bounce',
    },
    'promo': {
      'hook': 'morphIn', 'intro': 'fadeIn', 'problem': 'kenBurns', 'solution': 'morphIn',
      'feature': 'fadeIn', 'benefit': 'popIn', 'proof': 'fadeIn', 'cta': 'popIn',
    },
    'presentation': {
      'hook': 'slideUp', 'intro': 'fadeIn', 'problem': 'fadeIn', 'solution': 'slideUp',
      'feature': 'slideUp', 'benefit': 'slideUp', 'proof': 'fadeIn', 'cta': 'slideUp',
    },
  };

  const map = categoryMaps[category];
  if (map && map[sceneType]) return map[sceneType];
  
  // Fallback: first animation in the allowed set
  return profile.animationSet[0] || 'fadeIn';
}

function getDefaultTextAnimation(sceneType: string, category: string): string {
  const profile = CATEGORY_STYLE_PROFILES[category];
  if (!profile) return 'fadeWords';

  const categoryMaps: Record<string, Record<string, string>> = {
    'advertisement': {
      'hook': 'bounceIn', 'problem': 'splitReveal', 'solution': 'glowPulse',
      'feature': 'bounceIn', 'cta': 'glowPulse',
    },
    'storytelling': {
      'hook': 'fadeWords', 'problem': 'typewriter', 'solution': 'fadeWords',
      'feature': 'fadeWords', 'cta': 'fadeWords',
    },
    'tutorial': {
      'hook': 'splitReveal', 'problem': 'typewriter', 'solution': 'highlight',
      'feature': 'highlight', 'cta': 'splitReveal',
    },
    'product-video': {
      'hook': 'splitReveal', 'problem': 'fadeWords', 'solution': 'glowPulse',
      'feature': 'splitReveal', 'cta': 'glowPulse',
    },
    'corporate': {
      'hook': 'fadeWords', 'problem': 'fadeWords', 'solution': 'highlight',
      'feature': 'highlight', 'cta': 'fadeWords',
    },
    'social-content': {
      'hook': 'bounceIn', 'problem': 'waveIn', 'solution': 'glowPulse',
      'feature': 'bounceIn', 'cta': 'waveIn',
    },
    'testimonial': {
      'hook': 'fadeWords', 'problem': 'typewriter', 'solution': 'highlight',
      'feature': 'fadeWords', 'cta': 'highlight',
    },
    'explainer': {
      'hook': 'splitReveal', 'problem': 'typewriter', 'solution': 'highlight',
      'feature': 'splitReveal', 'cta': 'highlight',
    },
    'event': {
      'hook': 'bounceIn', 'problem': 'waveIn', 'solution': 'glowPulse',
      'feature': 'bounceIn', 'cta': 'waveIn',
    },
    'promo': {
      'hook': 'glowPulse', 'problem': 'typewriter', 'solution': 'splitReveal',
      'feature': 'glowPulse', 'cta': 'glowPulse',
    },
    'presentation': {
      'hook': 'fadeWords', 'problem': 'fadeWords', 'solution': 'highlight',
      'feature': 'splitReveal', 'cta': 'highlight',
    },
  };

  const map = categoryMaps[category];
  if (map && map[sceneType]) return map[sceneType];
  return profile.textAnimationSet[0] || 'fadeWords';
}

function getDefaultSoundEffect(sceneType: string, category: string): string {
  // Categories with minimal sound
  const quietCategories = ['storytelling', 'corporate', 'testimonial', 'presentation'];
  if (quietCategories.includes(category)) {
    if (sceneType === 'cta') return 'success';
    if (sceneType === 'hook' && category !== 'storytelling') return 'whoosh';
    return 'none';
  }
  
  // Categories with lots of sound
  const loudCategories = ['advertisement', 'social-content', 'event'];
  if (loudCategories.includes(category)) {
    const map: Record<string, string> = {
      'hook': 'whoosh', 'intro': 'whoosh', 'problem': 'alert',
      'solution': 'success', 'feature': 'pop', 'benefit': 'pop',
      'proof': 'success', 'cta': 'success',
    };
    return map[sceneType] || 'pop';
  }
  
  // Default moderate sound
  const map: Record<string, string> = {
    'hook': 'whoosh', 'problem': 'none', 'solution': 'success',
    'feature': 'pop', 'cta': 'success',
  };
  return map[sceneType] || 'none';
}

function shouldShowCharacter(sceneType: string, category: string): boolean {
  // Categories where character is always visible
  const alwaysCharacter = ['storytelling', 'tutorial', 'explainer'];
  if (alwaysCharacter.includes(category)) return true;
  
  // Categories with minimal character
  const minimalCharacter = ['product-video', 'promo', 'presentation'];
  if (minimalCharacter.includes(category)) {
    return ['cta', 'intro'].includes(sceneType);
  }
  
  // Categories with no character preference
  if (category === 'corporate') {
    return ['intro', 'cta'].includes(sceneType);
  }
  
  // Default: show in key scenes
  return ['hook', 'problem', 'solution', 'cta', 'intro'].includes(sceneType);
}

function getDefaultCharacterPosition(sceneType: string, _category: string): string {
  return sceneType === 'problem' ? 'left' : 'right';
}

function getDefaultCharacterGesture(sceneType: string, category: string): string {
  // Corporate: more formal gestures
  if (category === 'corporate') {
    const map: Record<string, string> = {
      'hook': 'idle', 'intro': 'idle', 'problem': 'thinking',
      'solution': 'explaining', 'cta': 'explaining',
    };
    return map[sceneType] || 'idle';
  }
  
  // Social/Event: more energetic gestures
  if (['social-content', 'event'].includes(category)) {
    const map: Record<string, string> = {
      'hook': 'waving', 'intro': 'waving', 'problem': 'thinking',
      'solution': 'celebrating', 'cta': 'pointing',
    };
    return map[sceneType] || 'celebrating';
  }
  
  // Default
  const map: Record<string, string> = {
    'hook': 'pointing', 'intro': 'waving', 'problem': 'thinking',
    'solution': 'celebrating', 'feature': 'explaining', 'benefit': 'celebrating',
    'proof': 'idle', 'testimonial': 'idle', 'cta': 'pointing',
  };
  return map[sceneType] || 'idle';
}

function getDefaultTransition(category: string): string {
  const transitionMap: Record<string, string> = {
    'advertisement': 'slide',
    'storytelling': 'fade',
    'tutorial': 'fade',
    'product-video': 'dissolve',
    'corporate': 'fade',
    'social-content': 'slide',
    'testimonial': 'fade',
    'explainer': 'fade',
    'event': 'slide',
    'promo': 'zoom',
    'presentation': 'slide',
    'custom': 'fade',
  };
  return transitionMap[category] || 'fade';
}