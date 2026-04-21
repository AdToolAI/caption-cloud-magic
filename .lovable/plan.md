

# Lottie raus, Gemini-Power rein + Universal Video in Composer integrieren

## Strategische Idee
Du willst **drei Verbesserungen** in einem Schritt:

1. **Lottie komplett entfernen** — der dead-code, der eh nur Probleme macht und in Lambda nie sichtbar war
2. **Gemini-Glow-Effekte** — visuelle Aufwertung der Szenen ohne Lottie-Risiko
3. **Universal Video Wizard → Video Composer integrieren** — als kostenfreie „Image Mode"-Variante, statt eigener Wizard

Das **komprimiert die Codebase**, **erhöht die Render-Stabilität** und **gibt Usern echte Kontrolle** statt Interview-Logik.

## Was geändert wird

### Teil 1: Lottie komplett entfernen 🗑️

**Was raus geht:**
- `src/remotion/utils/premiumLottieLoader.ts` (380 Zeilen Dead-Code)
- `src/remotion/components/LottieIcons.tsx`
- `src/remotion/data/lottie-library.ts`
- `src/remotion/EmbeddedLottieAnimations.ts`
- `public/lottie/characters/` (leer, weg)
- `@remotion/lottie` aus dependencies
- Alle `enableLottie` / `LOTTIE_SCENE_TYPES` / `isLottieSceneType` Referenzen aus `UniversalVideo.tsx` und 9 anderen Files
- Lambda-Hardening-Regel r44 (Lottie-Skip) wird obsolet

**Effekt:** ~1.500 Zeilen Code weg, kleinerer Bundle, schnellere Lambda-Starts, keine Sanitizer-Edge-Cases mehr.

### Teil 2: Gemini-Powered Glow & Visual Effects ✨

Statt Lottie-Animationen bekommen Szenen jetzt **prozedurale, frame-basierte Glow-Effekte** direkt im Remotion-Template (kein Asset-Loading nötig, 100% Lambda-safe):

**Neue Effekt-Library** (`src/remotion/components/effects/`):
- **`GlowOrbs.tsx`** — pulsierende Lichtkugeln im Hintergrund (frame-basiert, CSS box-shadow + filter blur)
- **`LightRays.tsx`** — animierte Lichtstrahlen (CSS conic-gradient, rotierend)
- **`ParticleField.tsx`** — schwebende Partikel mit interpolate() (deterministisch)
- **`GradientPulse.tsx`** — atmender Farb-Gradient-Layer
- **`EdgeGlow.tsx`** — Bond-Style goldener Rahmen-Glow
- **`ChromaticAberration.tsx`** — RGB-Split für Hero-Momente

**Style-Mapping:**
- Bond-Style → `EdgeGlow` (gold) + `GlowOrbs`
- Cinematic → `LightRays` + `ParticleField`
- Tech/Product → `ChromaticAberration` + `GradientPulse`
- Minimal → nur `GradientPulse` (subtil)

**Gemini-Integration:** 
Beim Storyboard-Generate wählt Gemini pro Szene 1-2 passende Effekte aus dem Pool — basierend auf Szenen-Typ (hook/problem/cta) und Stil. Antwort als JSON-Tool-Call.

### Teil 3: Universal Video → Video Composer als „Image Mode" 🎯

**Neuer ClipSource im Video Composer:**
```ts
export type ClipSource = 'ai-hailuo' | 'ai-kling' | 'ai-sora' | 'ai-image' | 'stock' | 'upload';
//                                                              ^^^^^^^^^ NEU
```

**Was „ai-image" macht:**
- Pro Szene wird **1 Gemini-Bild** generiert (Nano Banana 2 = `google/gemini-3.1-flash-image-preview`)
- In Remotion bekommt das Bild **Ken-Burns-Animation** (Zoom + Pan via interpolate)
- Optional: Glow-Effekte aus Teil 2 darübergelegt
- **Kosten: ~5 Credits/Szene** statt 30+ Credits für AI-Video → **6x billiger**

**UI-Änderung im Composer:**
- Im **Briefing-Tab** (`BriefingTab.tsx`) neue Auswahl: **„Video-Modus"**
  - **„🎬 AI Video Clips"** (bestehend, Hailuo/Kling/Sora) — Premium
  - **„🖼️ AI Image Scenes"** (neu) — günstig, mehr Szenen möglich
  - **„🎨 Mixed"** (neu) — Hero-Szenen als Video, Rest als Bild

**Mehr Szenen möglich:** Da Image-Szenen ~6x billiger sind, kann der Briefing-Slider **bis zu 20 Szenen** statt aktuell 6-8 erlauben (bei Image-Mode).

### Teil 4: Universal Video Creator deprecaten

**Strategie:**
- `/universal-video-creator` Route bleibt vorerst erhalten (Backward-Compat)
- Im Hub bekommt die Card einen **„→ Wechselt zum Video Composer"** Hinweis
- Interview-Wizard wird **NICHT** sofort gelöscht (Migrationspfad), aber nicht mehr beworben
- **Nach 30 Tagen** (separater Cleanup-Task) → Komplett-Entfernung von:
  - `src/pages/UniversalVideoCreator/`
  - `src/components/universal-video-creator/` (12 Files)
  - `supabase/functions/universal-video-consultant/`
  - `supabase/functions/auto-generate-universal-video/`
  - `supabase/functions/generate-universal-script/`
  - Route + Hub-Card

**Datenbank:** Bestehende `universal_video_*` Tabellen bleiben erstmal (User-Daten). Cleanup-Migration später.

## Geänderte/Neue Dateien

### Neue Files (15)
| Datei | Zweck |
|-------|-------|
| `src/remotion/components/effects/GlowOrbs.tsx` | Pulsierende Glow-Kugeln |
| `src/remotion/components/effects/LightRays.tsx` | Animierte Lichtstrahlen |
| `src/remotion/components/effects/ParticleField.tsx` | Schwebende Partikel |
| `src/remotion/components/effects/GradientPulse.tsx` | Atmender Gradient |
| `src/remotion/components/effects/EdgeGlow.tsx` | Bond-Style Rahmen |
| `src/remotion/components/effects/ChromaticAberration.tsx` | RGB-Split Effekt |
| `src/remotion/components/effects/index.ts` | Effect Registry + Type-Map |
| `src/remotion/components/KenBurnsImage.tsx` | Image-Szenen-Animation |
| `supabase/functions/generate-composer-image-scene/index.ts` | Gemini-Image pro Szene |
| `supabase/functions/_shared/composer-effects.ts` | Effect-Auswahl-Logik (Gemini) |
| `src/components/video-composer/SceneEffectSelector.tsx` | UI für Effect-Override pro Szene |
| `src/components/video-composer/VideoModeSelector.tsx` | Briefing: Video/Image/Mixed Toggle |

### Geänderte Files (12)
| Datei | Änderung |
|-------|----------|
| `src/remotion/templates/UniversalVideo.tsx` | Lottie raus, Effects-Layer rein |
| `src/types/video-composer.ts` | `ClipSource` + `ai-image`, `videoMode`, `effects[]` pro Scene |
| `src/components/video-composer/BriefingTab.tsx` | VideoModeSelector einbinden |
| `src/components/video-composer/StoryboardTab.tsx` | Effects-Vorschau pro Szene |
| `src/components/video-composer/ClipsTab.tsx` | Image-Generation-Flow für `ai-image` |
| `src/components/video-composer/SceneCard.tsx` | Effect-Badges anzeigen |
| `supabase/functions/compose-video-storyboard/index.ts` | Effect-Auswahl per Gemini |
| `supabase/functions/compose-video-clips/index.ts` | Routing zu Image-Generator bei `ai-image` |
| `src/lib/featureCosts.ts` | `composer_image_scene: 5` neu |
| `src/remotion/Root.tsx` | Lottie-Refs raus |
| `package.json` | `@remotion/lottie` raus |
| `src/pages/Hub.tsx` (oder Hub-Komponente) | Universal Video Card mit Hinweis |

## Technische Details

### Glow-Effekt Beispiel (frame-basiert, kein Asset)
```tsx
// GlowOrbs.tsx — 100% Lambda-safe
export const GlowOrbs: React.FC<{color: string; count: number}> = ({color, count}) => {
  const frame = useCurrentFrame();
  return Array.from({length: count}).map((_, i) => {
    const offset = i * 73;
    const x = interpolate(frame + offset, [0, 200], [10, 90]) % 100;
    const y = 50 + Math.sin((frame + offset) / 30) * 20;
    const scale = 1 + Math.sin((frame + offset) / 40) * 0.3;
    return (
      <div style={{
        position: 'absolute', left: `${x}%`, top: `${y}%`,
        width: 200, height: 200, borderRadius: '50%',
        background: color, filter: 'blur(60px)',
        transform: `scale(${scale})`, opacity: 0.4,
      }} />
    );
  });
};
```

### Image-Mode Pipeline
```
User wählt "Image Mode"
  → Storyboard generiert Szenen mit clipSource: 'ai-image'
  → Pro Szene: generate-composer-image-scene Edge-Function
    → Gemini Nano Banana 2 (Bild-Gen, ~5 Credits)
    → Upload zu Supabase Storage (composer-clips bucket)
    → URL zurück → scene.clipUrl
  → Remotion rendert: <KenBurnsImage src={clipUrl} effects={scene.effects} />
```

### Credit-Mapping (Beispiel 10-Szenen-Video)
| Modus | Credits | Aufwand |
|-------|---------|---------|
| AI Video (alt) | 10 × 30 = **300** | ~10-15 Min |
| AI Image (neu) | 10 × 5 = **50** | ~2-3 Min |
| Mixed (3 Video + 7 Image) | 90 + 35 = **125** | ~5-7 Min |

## Was später noch passiert (separate Tasks)

1. **30-Tage-Cleanup** — Universal Video Creator komplett entfernen
2. **DB-Migration** — `universal_video_*` Tabellen archivieren
3. **Memory-Update** — `universal-video-creator/wizard-and-interview-logic` als deprecated markieren
4. **Hub-Redesign** — Composer als zentrale Video-Erstellung positionieren

## Risiko & Rollback

**Risiko: Mittel.**
- Lottie-Removal ist additiv-sicher (Code wurde eh nicht gerendert in Lambda)
- Glow-Effekte sind frame-basiert, kein Asset-Risk
- Image-Mode ist neuer Code-Path neben bestehenden — kein Bestandsbruch
- Universal Video bleibt funktional bis 30-Tage-Cleanup

**Rollback:**
- Lottie-Removal: Git-Revert (keine DB-Änderung)
- Effects: Feature-Flag `enableSceneEffects: false` in Composition-Props → alter Look
- Image-Mode: ClipSource ignorieren, kein Effekt für bestehende Projekte

## Was du als Nächstes tust

Approve den Plan → ich switche in Default-Mode und baue alles in 3 sequenziellen Phasen:
1. **Phase 1** (~30 Min): Lottie-Removal + Cleanup
2. **Phase 2** (~45 Min): Glow-Effects-Library + Remotion-Integration + Storyboard-AI-Auswahl
3. **Phase 3** (~60 Min): Image-Mode im Composer + Edge-Function + UI

Gesamt: ~2-2,5h für eine deutlich schlankere und mächtigere Codebase.

