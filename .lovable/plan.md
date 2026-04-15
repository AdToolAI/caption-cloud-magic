

# AI Video Composer — Vollständiger Implementierungsplan

## Vision

Ein Scene-Based Video Assembly System, das kurze KI-Clips (3-10s), Stock-Footage und User-Uploads zu professionellen Werbevideos (15-90s) zusammensetzt. Vier Modi: **Produktvideo**, **Unternehmenswerbung**, **Storytelling**, **Allgemeiner Editor**.

## Was bereits existiert und direkt nutzbar ist

| Baustein | Status |
|---|---|
| `search-stock-videos` (Pexels + Pixabay) | ✅ deployed |
| `generate-hailuo-video` (6-10s Clips via Replicate) | ✅ deployed |
| `generate-kling-video` (3-15s Clips) | ✅ deployed |
| `generate-sora-chain` + `sora-chain-webhook` | ✅ deployed |
| `generate-seedance-video`, `generate-wan-video`, `generate-luma-video` | ✅ deployed |
| ElevenLabs Voiceover (`generate-voiceover`) | ✅ deployed |
| `analyze-music-beats` (BPM + Beat-Positionen) | ✅ deployed |
| `search-stock-music` | ✅ deployed |
| `LongFormVideo.tsx` Remotion Template (Video-Stitching) | ✅ existiert |
| Lambda Rendering Pipeline | ✅ deployed |
| AI Video Wallet + Credits System | ✅ deployed |
| `UniversalConsultationResult` Type + Interview Pipeline | ✅ existiert |
| `replicate-webhook` für async Clip-Status | ✅ deployed |

## Architektur-Übersicht

```text
┌─────────────────────────────────────────────────────┐
│                  VIDEO COMPOSER UI                   │
│  Tab 1: Briefing → Tab 2: Storyboard → Tab 3: Clips │
│  Tab 4: Audio → Tab 5: Assembly & Export             │
├─────────────────────────────────────────────────────┤
│              ORCHESTRATION LAYER (DB State Machine)  │
│  composer_projects → composer_scenes → clip_jobs     │
├─────────────────────────────────────────────────────┤
│              GENERATION LAYER                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Hailuo   │  │ Kling    │  │ Stock    │          │
│  │ 6-10s    │  │ 3-15s    │  │ Pexels   │          │
│  └──────────┘  └──────────┘  └──────────┘          │
├─────────────────────────────────────────────────────┤
│              ASSEMBLY LAYER (Remotion Lambda)        │
│  ComposedAdVideo.tsx → KineticText + ColorGrading    │
└─────────────────────────────────────────────────────┘
```

## Phase 1: Datenmodell + Dashboard Shell

### 1a. Datenbank-Migration

Neue Tabellen:

**`composer_projects`** — Hauptprojekt-Tabelle
- `id`, `user_id`, `title`, `category` (product-ad, corporate-ad, storytelling, custom)
- `briefing` (JSONB: Produkt, Zielgruppe, Ton, Dauer, Aspect Ratio, Brand-Farben, Logo)
- `status` (draft, storyboard, generating, assembling, preview, completed, failed)
- `storyboard` (JSONB: Array von Szenen-Definitionen)
- `assembly_config` (JSONB: Color Grading, Transition-Style, Musik, VO)
- `output_url`, `thumbnail_url`
- `total_cost_euros`, `language`
- RLS: User can only access own projects

**`composer_scenes`** — Einzelne Szenen eines Projekts
- `id`, `project_id` (FK), `order_index`
- `scene_type` (hook, problem, solution, demo, social-proof, cta, custom)
- `duration_seconds` (3-15)
- `clip_source` (ai-hailuo, ai-kling, ai-sora, stock, upload)
- `ai_prompt` (EN), `stock_keywords`, `upload_url`
- `clip_url` (generierte/gefundene URL)
- `clip_status` (pending, generating, ready, failed)
- `text_overlay` (JSONB: text, position, animation, font_size, color)
- `transition_type`, `transition_duration`
- RLS: via project_id → user_id

### 1b. TypeScript Types

**`src/types/video-composer.ts`**
- `ComposerProject`, `ComposerScene`, `ComposerBriefing`
- `ClipSource`, `SceneType`, `TextOverlayConfig`
- `ColorGradingPreset`, `TransitionStyle`

### 1c. Dashboard UI Shell

**`src/pages/VideoComposer/index.tsx`** — Neue Route `/video-composer`

**`src/components/video-composer/VideoComposerDashboard.tsx`** — 5-Tab Container
- Tab-Navigation mit Fortschrittsindikator
- State: `ComposerProject` via React state + localStorage Persistence
- James Bond 2028 Design (Deep Black, Gold Accents, Glassmorphism)

## Phase 2: Briefing + Storyboard Tabs

### Tab 1: Briefing (`BriefingTab.tsx`)
- **Modus-Auswahl**: KI-gestützt (Lovable AI generiert Storyboard) vs. Manuell (User baut selbst)
- Projekt-Basics: Name, Kategorie, Dauer (15-90s Slider), Aspect Ratio (visuelle Kacheln)
- Produkt/Service: Name, Beschreibung, USPs, Zielgruppe
- Stil: Emotionaler Ton Dropdown, Brand-Farben (Color Picker), Logo Upload
- Sprache: DE / EN / ES
- **"Storyboard generieren" Button** (nur bei KI-Modus) → Edge Function

### Tab 2: Storyboard (`StoryboardTab.tsx`)
- **KI-generiert oder manuell erstellt**
- Draggable Szenen-Cards (`SceneCard.tsx`):
  - Szenen-Typ Badge (Hook, Problem, Solution, etc.)
  - Dauer-Slider (3-15s)
  - AI-Prompt Editor (Textarea, EN)
  - Clip-Source Toggle: KI / Stock / Upload
  - Text-Overlay Editor (Text, Position, Animation)
  - Vorschau-Thumbnail (wenn Clip generiert)
- "Szene hinzufügen" / "Szene löschen" Buttons
- Drag & Drop Reihenfolge (dnd-kit oder eigene Implementierung)
- Gesamtdauer-Anzeige + Kostenvorschau

### Edge Function: `compose-video-storyboard/index.ts`
- Input: Briefing (Kategorie, Produkt, Zielgruppe, Ton, Dauer)
- Lovable AI (gemini-3-flash-preview) generiert strukturiertes Storyboard:
  - 6-10 Szenen mit Typ, Dauer, KI-Prompt (EN), Stock-Keywords, Text-Overlay
  - Storytelling-Struktur basierend auf Kategorie (AIDA für Werbung, Hero's Journey für Storytelling)
- Output: Array von `ComposerScene`-Objekten
- Tool-Calling für strukturierten Output (kein JSON-Parsing)

## Phase 3: Clip-Generierung + Monitor

### Tab 3: Clips (`ClipsTab.tsx`)
- **"Alle Clips generieren" Button** → startet parallele Generierung
- Pro Szene: Status-Card mit Fortschrittsanzeige
  - Pending → Generating (Spinner) → Ready (Thumbnail) → Failed (Retry)
- **Clip-Preview**: Inline Video-Player pro Szene
- **"Regenerieren" Button** pro Szene (neuer Prompt oder anderes Modell)
- **"Stock-Alternative laden"** Button → `search-stock-videos` aufrufen
- **Upload-Option**: User kann eigenen Clip hochladen
- Kosten-Tracker: Laufende Kosten pro Clip + Gesamtsumme

### Edge Function: `compose-video-clips/index.ts`
- Input: Array von Szenen mit `clip_source` und `ai_prompt`/`stock_keywords`
- Pro Szene parallel:
  - **AI**: `generate-hailuo-video` oder `generate-kling-video` aufrufen (via Replicate Webhook)
  - **Stock**: `search-stock-videos` aufrufen, besten Match wählen
  - **Upload**: URL direkt verwenden
- Szenen-Status in `composer_scenes` Tabelle updaten
- Webhook-basiert (existierender `replicate-webhook` Pattern)

### Edge Function: `compose-clip-webhook/index.ts`
- Empfängt Replicate Webhooks für fertige KI-Clips
- Aktualisiert `composer_scenes.clip_url` und `clip_status`
- Prüft ob alle Clips fertig → setzt `composer_projects.status = 'assembling'`

## Phase 4: Audio-Konfiguration

### Tab 4: Audio (`AudioTab.tsx`)
- **Voiceover Toggle**: Ja/Nein
  - Stimme: Geschlecht + Ton (existierende ElevenLabs Voice-Auswahl, Voice ID Dropdown)
  - Script: Auto-generiert aus Szenen-Text oder manuelle Eingabe
  - "Vorschau anhören" Button
- **Hintergrundmusik**:
  - Genre + Stimmung Selector
  - `search-stock-music` Integration
  - Musik-Vorschau Player
  - Lautstärke Slider (0-100)
  - Eigene Musik Upload (optional)
- **Beat-Sync Toggle**: Schnitte auf Beats ausrichten
  - Nutzt `analyze-music-beats` für BPM + Beat-Positionen
  - Adjustiert Szenen-Dauern automatisch auf nächsten Beat

## Phase 5: Assembly + Export (Remotion)

### Tab 5: Assembly & Export (`AssemblyTab.tsx`)
- **Color Grading Preset** Auswahl (visuelle Kacheln mit Vorschau):
  - Cinematic Warm, Cool Blue, Vintage Film, High Contrast, Moody Dark, None
- **Transition Style** Auswahl: Fade, Crossfade, Wipe, Slide, Zoom
- **Kinetic Text Toggle**: Standard Text vs. Spring-animierte Typografie
- **Kosten-Zusammenfassung**: KI-Clips + VO + Rendering = X Credits
- **"Video rendern" Button** → triggert Assembly Pipeline

### Remotion Template: `ComposedAdVideo.tsx`
- Erweitert `LongFormVideo.tsx` um:
  - `<Video>` Komponenten statt `<Img>` (existiert bereits in LongFormVideo)
  - **KineticText Component** (`KineticText.tsx`):
    - Scale-In mit Bounce (`spring({ damping: 8 })`)
    - Slide-Explosion von links/rechts
    - Word-by-Word mit Stagger
    - Glow-Pulse Animation
  - **ColorGrading Wrapper** (`ColorGrading.tsx`):
    - CSS `filter` Presets als Container-Wrapper
  - **SFX-Layer**: Whoosh/Impact Audio bei Transitions
  - Beat-synchronisierte Szenen-Dauern
- Props: Array von Szenen (Video-URLs, Text-Overlays, Transitions, Color Grading)
- Registrierung in `Root.tsx`

### Edge Function: `compose-video-assemble/index.ts`
- Input: `project_id`
- Liest alle `composer_scenes` + `assembly_config`
- Baut Remotion-Payload (ComposedAdVideo Props)
- Triggert Lambda Render (existierende `invoke-remotion-render` Infrastruktur)
- Speichert Output in `universal-videos` Bucket
- Credit-Deduction via `deduct_ai_video_credits`

## Phase 6: Integration + Polish

### Navigation
- Route `/video-composer` in `App.tsx` hinzufügen
- Link im AI Video Studio Hub und/oder Sidebar
- Bestehender Universal Video Creator bleibt als Alternative erhalten

### Translations
- Neue Keys in `translations.ts` für alle Dashboard-Labels (DE/EN/ES)

### Kosten-Transparenz
- Pro-Szene Kosten-Anzeige:
  - Hailuo Standard: ~€0.90-1.50/Clip
  - Kling: ~€0.75-3.00/Clip
  - Stock: €0.00
  - Upload: €0.00
- Voiceover: ~€0.05
- Rendering: ~€0.10
- Gesamtkosten prominent in Tab 5

### Error Handling + Reliability
- Automatische Credit-Refunds bei fehlgeschlagenen Clips (existierendes `refund_ai_video_credits`)
- Retry-Logik pro Szene (max 3 Versuche)
- Fallback: Stock wenn KI-Clip nach 5 Min nicht fertig
- localStorage Persistence des Dashboard-States

## Datei-Übersicht

### Neue Dateien (17)

| Datei | Beschreibung |
|---|---|
| `src/pages/VideoComposer/index.tsx` | Seite + Helmet |
| `src/types/video-composer.ts` | TypeScript Interfaces |
| `src/components/video-composer/VideoComposerDashboard.tsx` | 5-Tab Container |
| `src/components/video-composer/BriefingTab.tsx` | Tab 1 |
| `src/components/video-composer/StoryboardTab.tsx` | Tab 2 |
| `src/components/video-composer/SceneCard.tsx` | Draggable Szenen-Karte |
| `src/components/video-composer/ClipsTab.tsx` | Tab 3: Clip-Monitor |
| `src/components/video-composer/AudioTab.tsx` | Tab 4 |
| `src/components/video-composer/AssemblyTab.tsx` | Tab 5 |
| `src/components/video-composer/ColorGradingSelector.tsx` | Visueller Preset-Picker |
| `src/remotion/templates/ComposedAdVideo.tsx` | Neues Remotion Template |
| `src/remotion/components/KineticText.tsx` | Spring-animierte Texte |
| `src/remotion/components/ColorGrading.tsx` | CSS-Filter Wrapper |
| `supabase/functions/compose-video-storyboard/index.ts` | KI-Storyboard |
| `supabase/functions/compose-video-clips/index.ts` | Clip-Orchestrierung |
| `supabase/functions/compose-clip-webhook/index.ts` | Webhook Handler |
| `supabase/functions/compose-video-assemble/index.ts` | Remotion Assembly |

### Geänderte Dateien (4)

| Datei | Änderung |
|---|---|
| `src/App.tsx` | Route `/video-composer` |
| `src/remotion/Root.tsx` | `ComposedAdVideo` Composition |
| `src/lib/translations.ts` | ~80 neue Keys |
| `src/lib/featureCosts.ts` | `COMPOSER_*` Kosten-Einträge |

### DB Migration (1)
- `composer_projects` + `composer_scenes` Tabellen mit RLS

## Implementierungsreihenfolge

| Schritt | Inhalt | Geschätzter Aufwand |
|---|---|---|
| 1 | DB Migration + Types + Dashboard Shell + Route | 1 Tag |
| 2 | Briefing Tab + Storyboard Generation Edge Function | 1.5 Tage |
| 3 | Storyboard Tab mit SceneCards + Drag & Drop | 1 Tag |
| 4 | Clips Tab + `compose-video-clips` + Webhook | 2 Tage |
| 5 | Audio Tab (VO + Musik + Beat-Sync) | 1 Tag |
| 6 | `ComposedAdVideo.tsx` + KineticText + ColorGrading | 1.5 Tage |
| 7 | Assembly Edge Function + Lambda Integration | 1 Tag |
| 8 | Polish: Translations, Kosten, Error Handling | 1 Tag |
| **Total** | | **~10 Tage** |

## Risiken & Mitigationen

| Risiko | Mitigation |
|---|---|
| KI-Clips visuell inkonsistent | ColorGrading normalisiert Look; User kann per-Szene Modell wählen |
| Replicate Timeouts (>5min) | Webhook-basiert, kein Polling; Stock-Fallback-Button |
| Lambda kann keine externen Videos laden | Videos vorher in Storage cachen (`compose-video-assemble` lädt herunter) |
| Kosten pro Video zu hoch für User | Stock-Only Modus für ~€0.15; KI optional pro Szene |
| Edge Function Timeout bei Orchestrierung | 4 separate Edge Functions statt einer Mega-Function |

