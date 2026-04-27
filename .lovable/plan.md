# Plan: Ad Director Mode — Professionelle Werbe-Pipeline für TVC/Long-Form

## Vision

Ein dedizierter Werbe-Pfad im Video Composer, der aus einem Briefing einen vollständigen 15–60 Sekunden TV-Werbespot generiert — mit professioneller Dramaturgie, 12 Tonality-Profilen (markenrechtlich sauber, basierend auf Werbe-Theorie), Story-Frameworks und 7 Ad-Scene-Templates. Compliance-Disclaimer im UI.

**Zielgruppe**: Marketing-Teams, Agenturen, Solo-Brands die TVC-Qualität ohne Agentur-Budget brauchen.

## Was bereits existiert (wird wiederverwendet)

- `ComposerCategory` mit `corporate-ad`, `product-ad` 
- `SceneType`: hook, problem, solution, demo, social-proof, cta, custom
- `EmotionalTone`: 8 Werte (professional, energetic, emotional, funny, luxury, minimal, dramatic, friendly)
- `generate-video-script` Edge Function mit `ad`/`story`/`reel`/`tutorial`/`testimonial` Strukturen
- Brand Kit, Brand Character Lock, Shot Director, Cinematic Style Presets
- 9 AI-Video-Provider, Director's Cut Editor

**Ergänzung**: Diese Bausteine werden NICHT ersetzt — wir legen einen "Ad Director"-Wizard und neue Configs darüber.

## 1. Tonality-Profile (12 abstrakte Werbeton-Profile)

**Datei**: `src/config/adTonalityProfiles.ts`

Jedes der 12 Profile enthält:
```ts
{
  id: 'minimal-premium',
  label: { de, en, es },
  shortDesc: { de, en, es },
  // System-Prompt-Regeln für Lovable AI:
  rules: {
    sentenceLength: 'short' | 'medium' | 'long',
    register: 'formal' | 'neutral' | 'casual',
    person: 'first' | 'second' | 'third' | 'we',
    tense: 'present' | 'future' | 'mixed',
    forbidden: string[], // z.B. 'superlatives', 'anglicisms'
  },
  hookPatterns: [3 Beispiel-Opener],
  ctaPatterns: [3 Beispiel-Endings],
  glyph: emoji,
  accentHsl: 'hsl(...)',
}
```

**Die 12 Profile**:
1. Minimal Premium ✦
2. Bold Challenger ⚡
3. Warm Storyteller 📖
4. Authentic Documentary 🎬
5. Playful Witty 🎭
6. Empathic Caring 💛
7. Visionary Inspiring 🌅
8. Practical Helpful 🛠️
9. Edgy Provocative 🔥
10. Energetic Hype 🚀
11. Trustworthy Expert 🔬
12. Joyful Optimistic 🌈

**Wichtig**: Profile beschreiben nur Sprach-Regeln — NIE konkrete Marken erwähnen.

## 2. Story-Frameworks (7 Werbe-Dramaturgien)

**Datei**: `src/config/adStoryFrameworks.ts`

Jedes Framework definiert die Scene-Sequenz mit erwarteten `SceneType`s und Pacing:

| Framework | Sequenz | Beste Dauer |
|---|---|---|
| **Problem-Solution** | hook → problem → solution → social-proof → cta | 15–30s |
| **Hero's Journey** | hook → problem → demo → solution → cta | 30–60s |
| **Testimonial** | hook → social-proof → demo → cta | 15–30s |
| **Demo / Feature Showcase** | hook → demo → demo → cta | 15–30s |
| **Lifestyle / Aspirational** | hook → solution → solution → cta | 30–60s |
| **Comparison / Switch** | hook → problem → solution → social-proof → cta | 30s |
| **Brand Manifesto** | hook → solution → solution → cta | 30–60s |

Jedes Framework liefert pro Scene:
- empfohlene Dauer
- Skript-Tipps (System-Prompt für AI)
- Default `cinematicPresetId` (verlinkt zu existierenden Looks)

## 3. Ad-Scene-Templates (7 vorgefertigte Szene-Bausteine)

**Datei**: `src/config/adSceneTemplates.ts`

Pro Template:
- `name`, `glyph`, `desc`, `recommendedDuration`
- `defaultPromptSlots` (subject/action/setting/timeWeather/style)
- `defaultShotDirector` (Framing/Angle/Movement/Lighting)
- `defaultCinematicPresetId` (One-Click-Look)
- `textOverlaySuggestion` (Position, Animation)

**Die 7 Templates**:
1. **Hero Product Shot** — Macro, Light Sweep, Hero Lighting, 3–5s
2. **Logo Reveal** — Brand-Color-Background, Animated Logo, 2–3s
3. **CTA End Card** — Logo + Tagline + URL + 2-3s Beat
4. **Testimonial Cut** — Person sprechend, soft studio, eye-level, 4–6s
5. **Problem Setup** — Konflikt-Szene, dunkler Look, Push-In, 3–5s
6. **Wow Moment** — Hero-Moment, Slow-Mo-Feel, Crane-Shot, 3–4s
7. **Lifestyle Beat** — Authentic Movement, Golden Hour, Handheld, 4–6s

## 4. Ad Director Wizard (neuer Composer-Modus)

**Neue Komponente**: `src/components/video-composer/AdDirectorWizard.tsx`

5-Step-Wizard, eingebettet als Tab/Mode in `VideoComposerDashboard`:

```text
Step 1: Format & Goal
  └─ Format-Picker: TVC 15s | TVC 30s | TVC 60s | Long-Form 45-90s
  └─ Goal-Picker: Awareness | Conversion | Brand-Build | Launch

Step 2: Story Framework
  └─ 7 Karten mit Beschreibung, empfohlener Sequenz-Vorschau
  └─ Recommendation-Badge basierend auf Format/Goal

Step 3: Tonality
  └─ 12 Profil-Karten mit Hook-Beispiel als Hover-Preview
  └─ Compliance-Disclaimer prominent: "KI-generiert, du bist verantwortlich..."

Step 4: Briefing (kompakt)
  └─ Wiederverwendung existierender Felder: productName, productDescription, usps, audience
  └─ Brand Kit auswählen (existiert)

Step 5: Generate
  └─ "Generate Ad" → ruft erweiterte Edge-Function (siehe §6)
  └─ Auto-Hook-Generator: 3 alternative Hooks zur Auswahl
  └─ Scenes werden direkt in Composer-Storyboard erstellt
```

## 5. Auto-Hook-Generator

**UI**: Inline im Wizard Step 5 nach erster Generation

**Logik**: Nach der Skript-Generierung wird Lovable AI parallel mit 3 verschiedenen Hook-Pattern-Vorschlägen gerufen (Pattern Interrupt, Question, Statement) — User wählt einen aus.

**Edge Function**: `supabase/functions/generate-ad-hooks/index.ts`
- Input: `{ briefing, tonality, framework, sceneCount }`
- Nutzt Lovable AI (`google/gemini-2.5-flash`)
- Returns: `{ hooks: [{ id, text, pattern, durationSec }, ...3] }`

## 6. Erweiterte Skript-Generierung

**Edge Function**: NEUE `supabase/functions/generate-ad-script/index.ts`
(NICHT die bestehende `generate-video-script` ändern — wir brauchen die für andere Flows)

**Input**:
```json
{
  "briefing": { productName, description, usps, audience },
  "format": { duration: 30, aspectRatio: "16:9" },
  "framework": "problem-solution",
  "tonality": "minimal-premium",
  "language": "de",
  "brandKitId": "uuid"
}
```

**Output**: Komplettes Composer-Scenes-Array mit:
- Scene-Sequence basierend auf Framework
- Per-Scene: `aiPrompt`, `sceneType`, `durationSeconds`, `shotDirector`, `cinematicPreset`, `textOverlay`
- VO-Skript pro Szene (für späteren ElevenLabs-Sync)

**System-Prompt** kombiniert Tonality-Rules + Framework-Sequenz + Briefing.
**Modell**: `google/gemini-2.5-pro` (Qualität wichtig hier).
**Timeout**: 120s in `config.toml`.

## 7. UI-Integration in bestehenden Composer

**Änderungen in `VideoComposerDashboard.tsx`**:
- Neuer "Ad Director"-Button im Header (premium gold, neben "Briefing")
- Klick öffnet `AdDirectorWizard` als Sheet/Modal
- Nach erfolgreicher Generation: Scenes werden in den bestehenden Storyboard-Tab geschrieben
- User kann danach normal weiter-editieren (Shot Director, Brand Character etc.)

**Änderungen in `BriefingTab.tsx`**:
- Neue Card "Ad Director Mode" oben mit "Launch Wizard"-Button
- Sichtbar nur wenn `category === 'product-ad' || 'corporate-ad'`

## 8. Compliance-Disclaimer (UI)

**Neue Komponente**: `src/components/video-composer/AdComplianceDisclaimer.tsx`

Permanent sichtbar in:
- AdDirectorWizard Step 5 (vor Generation)
- Export-Dialog vor Render-Start
- BriefingTab Top-Banner wenn Ad-Mode aktiv

**Inhalt** (DE/EN/ES):
> "Diese Werbung wird KI-generiert. Du bist verantwortlich für: Markenrechte, Wettbewerbsrecht (UWG), Urheberrechte und EU AI Act Art. 50 Offenlegungspflicht. Wir empfehlen einen Disclaimer 'KI-generierte Werbung' bei der Veröffentlichung. [Mehr erfahren →]"

Mit Icon `ShieldAlert` (gold), Link zur (zu erstellenden) Compliance-Page `/legal/ai-advertising`.

## 9. Datenbank-Erweiterungen

**Migration**: `add_ad_director_fields_to_composer_projects`

```sql
ALTER TABLE composer_projects
  ADD COLUMN IF NOT EXISTS ad_framework TEXT,           -- 'problem-solution' | ...
  ADD COLUMN IF NOT EXISTS ad_tonality TEXT,            -- 'minimal-premium' | ...
  ADD COLUMN IF NOT EXISTS ad_format TEXT,              -- 'tvc-15' | 'tvc-30' | 'tvc-60' | 'longform'
  ADD COLUMN IF NOT EXISTS ad_goal TEXT,                -- 'awareness' | 'conversion' | ...
  ADD COLUMN IF NOT EXISTS ad_compliance_acknowledged BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ad_compliance_acknowledged_at TIMESTAMPTZ;
```

Validierung via Trigger (kein CHECK-Constraint laut Memory-Regel).

## 10. Lokalisierung

Alle UI-Strings (Tonality-Labels, Framework-Beschreibungen, Wizard-Steps, Disclaimer) in DE/EN/ES.
**Visual prompts bleiben Englisch** (Memory-Core-Regel).

---

## Technical Details

### Files to Create
- `src/config/adTonalityProfiles.ts` (12 Profile)
- `src/config/adStoryFrameworks.ts` (7 Frameworks)
- `src/config/adSceneTemplates.ts` (7 Scene-Templates)
- `src/components/video-composer/AdDirectorWizard.tsx`
- `src/components/video-composer/AdComplianceDisclaimer.tsx`
- `src/components/video-composer/AdHookSelector.tsx` (3-Hook-Auswahl-UI)
- `src/lib/adDirector/buildAdScenes.ts` (Mapping Framework → Scene-Array)
- `supabase/functions/generate-ad-script/index.ts`
- `supabase/functions/generate-ad-hooks/index.ts`
- `src/pages/legal/AIAdvertisingCompliance.tsx` (statische Doku-Seite)

### Files to Modify
- `src/components/video-composer/VideoComposerDashboard.tsx` (Ad-Director-Button)
- `src/components/video-composer/BriefingTab.tsx` (Wizard-Launch-Card)
- `src/types/video-composer.ts` (neue Felder im `ComposerProject`)
- `src/integrations/supabase/types.ts` (auto-generiert nach Migration)
- `supabase/config.toml` (verify_jwt=false + 120s Timeout für neue Functions)
- App router (`/legal/ai-advertising` Route)

### Estimated Effort
~2.5 Stunden, davon:
- Configs (Tonality + Framework + Templates): 45 Min
- Wizard-UI + Compliance: 60 Min
- Edge Functions (Skript + Hooks): 40 Min
- DB-Migration + Type-Updates: 10 Min
- Lokalisierung: 15 Min

### What This Plan Does NOT Include
- End-Card-Builder mit animierten Templates (Stufe 2)
- Brand Sound Library (Stufe 2)
- A/B-Test-Variant-Generator (Stufe 3)
- Performance-Heatmap (Stufe 3)
- Aspect-Smart-Crop (Stufe 3)
- Vertical Social Ad Templates (separater Plan, weil 9:16 andere Konventionen hat)

Diese kommen in späteren Iterationen, basierend auf User-Feedback aus Stufe 1.
