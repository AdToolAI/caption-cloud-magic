

# Format-spezifische Design-Systeme für den Universal Video Creator

## Problem

Aktuell verwendet der `generate-universal-script` Edge Function **einen einzigen generischen Prompt** für alle 12 Video-Kategorien. Egal ob Werbevideo, Storytelling oder Tutorial — dieselben Animationen, Effekte, Character-Logik und Ton werden angewendet. Das führt dazu, dass alle Videos gleich wirken.

## Lösung: Category Style Profiles

Ein **Format-spezifisches Design-System** als Konfiguration in `generate-universal-script`, das pro Kategorie folgendes definiert:

### 1. Category Style Map (neue Datenstruktur in `generate-universal-script/index.ts`)

Für jede der 12 Kategorien ein eigenes Profil:

| Kategorie | Visueller Stil | Tempo | Character-Einsatz | Effekte | Farbstimmung |
|---|---|---|---|---|---|
| **advertisement** | Bold, hoher Kontrast | Schnell (3-5s Szenen) | Minimal, nur CTA | PopIn, Bounce, starke CTAs | Markenfarben dominant |
| **storytelling** | Cinematic, warme Töne | Langsam (6-10s) | Durchgehend, emotionale Gesten | KenBurns, sanfte Fades | Warme Palette |
| **tutorial** | Clean, didaktisch | Mittel (5-8s) | Erklärer durchgehend | SlideUp, Highlight, Step-Indicator | Klare, helle Farben |
| **product-video** | Premium, Showcase | Mittel-schnell | Minimal | Parallax, ZoomIn, 360-Feeling | Produkt-komplementär |
| **corporate** | Professionell, seriös | Mittel | Sporadisch, formell | FadeIn, SlideUp, keine Bounce | Gedämpft, Business |
| **social-content** | Trendy, auffällig | Sehr schnell (2-4s) | Optional, casual | PopIn, GlowPulse, Emojis | Neon, Trend-Farben |
| **testimonial** | Authentisch, vertrauensvoll | Langsam-mittel | Zitierende Person | FadeIn, Quote-Highlight | Warm, vertrauensvoll |
| **explainer** | Klar, strukturiert | Mittel | Durchgehend, didaktisch | MorphIn, DrawOn, Highlight | Markenkonform |
| **event** | Energetisch, festlich | Schnell | Sporadisch | PopIn, Confetti-artig, Bounce | Event-Branding |
| **promo** | Spannend, teaserartig | Sehr schnell | Minimal | ZoomIn, Blur-Reveal, GlowPulse | Dunkel + Akzent |
| **presentation** | Clean, data-driven | Mittel | Sporadisch | SlideUp, Highlight, StatsOverlay | Business-clean |
| **custom** | Flexibel | Flexibel | Nutzer-definiert | Mix | Nutzer-definiert |

### 2. Änderungen in `generate-universal-script/index.ts`

**Neue Konstante:** `CATEGORY_STYLE_PROFILES` — ein Record mit pro Kategorie:
- `visualDirection`: Textbeschreibung für den AI-Prompt (z.B. "Cinematic, warme Farbtöne, weiche Übergänge, emotionale Bildsprache")
- `pacingGuide`: Szenen-Timing-Vorgaben
- `animationSet`: Erlaubte/bevorzugte Animationen (Subset aus allen verfügbaren)
- `textAnimationSet`: Passende Text-Animationen
- `characterUsage`: Wann/wie Characters eingesetzt werden
- `effectsProfile`: Welche SceneTypeEffects passen
- `transitionStyle`: Welche Übergänge (z.B. Storytelling = nur Fade/Crossfade; Social = Push/Wipe)
- `soundDesign`: Sound-Effekt-Profil (Storytelling = wenig SFX; Ads = viel SFX)

**Prompt-Anpassung:** Der `systemPrompt` wird dynamisch mit dem Category Style Profile angereichert, sodass die AI formatspezifische Entscheidungen trifft.

**Helper-Funktionen anpassen:** `getDefaultAnimation()`, `getDefaultTextAnimation()`, `getDefaultSoundEffect()` etc. bekommen einen zweiten Parameter `category` und wählen Defaults aus dem passenden Profil.

### 3. Änderungen in `UniversalCreatorVideo.tsx`

**Minimal:** Die Remotion-Komponente braucht keine großen Änderungen, da sie bereits alle Animationstypen unterstützt. Die Differenzierung passiert primär im Script-Generator.

**Einzige Ergänzung:** `ContrastOverlay`-Verhalten pro Kategorie anpassen:
- Corporate/Presentation: Dezenter, formeller Overlay
- Social/Promo: Stärkerer Kontrast, auffälliger
- Storytelling: Cinematic Vignette statt hartem Gradient

### 4. Edge Function Deploy

`generate-universal-script` neu deployen mit den Category Style Profiles.

## Dateien die geändert werden

| Datei | Änderung |
|---|---|
| `supabase/functions/generate-universal-script/index.ts` | `CATEGORY_STYLE_PROFILES` hinzufügen, Prompt dynamisch anreichern, Helper-Funktionen erweitern |
| `src/remotion/templates/UniversalCreatorVideo.tsx` | Contrast-Overlay je nach `category` anpassen (minimal) |

## Erwartetes Ergebnis

- **Storytelling-Videos** wirken cinematic mit langsamen KenBurns und warmen Tönen
- **Social Content** ist schnell, bunt, mit Emojis und PopIn-Effekten
- **Corporate-Videos** sind seriös mit gedämpften Farben und formellen Übergängen
- **Tutorials** sind klar strukturiert mit Step-Indikatoren und Erklärer-Character
- Jedes Format hat eine **eigene visuelle Identität**, ohne dass neue Remotion-Komponenten nötig sind

