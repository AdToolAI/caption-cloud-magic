
# 🎯 Marktführer-Parität Roadmap — Blocks O → P → Q

Nach dem Audit habe ich **bestehende Infrastruktur identifiziert**, die wir wiederverwenden können — das spart ~40% Aufwand vs. Greenfield. Plan in 3 Sessions, jede deploybar & testbar.

---

## 📦 Session 1 — Block O: AI Auto-Director (1-Click Movie) (~3.5h)

**Ziel**: User gibt **eine Idee + Stimmung + Dauer** ein → System erstellt automatisch Storyboard, generiert alle Clips parallel, fügt Voiceover/Musik/Untertitel hinzu, rendert das fertige Video. Wettbewerb: Pika 2.0, Runway Gen-3 Auto.

### Bestehende Bausteine (wiederverwenden)
- ✅ `compose-video-clips` (parallele Clip-Generation)
- ✅ `generate-script-inline` (Skript-Erstellung mit Lovable AI)
- ✅ `compose-video-assemble` (Final-Render)
- ✅ Storyboard-Schema (`composer_scenes`)

### Neu zu bauen
- **`auto-director-compose`** (neue Edge Function): Orchestrator
  1. Gemini 2.5 Pro generiert Szenen-Plan (Anzahl, Dauer, Prompts pro Szene, Engine-Empfehlung)
  2. Insert aller Szenen mit `status='pending'` in `composer_scenes`
  3. Trigger `compose-video-clips` (parallel)
  4. Optional: trigger `synthesize-voiceover` + `select-background-music`
  5. Auto-Trigger `compose-video-assemble` wenn alle Clips ready
- **`AutoDirectorWizard.tsx`** (3-Step Modal in Composer):
  - Step 1: Idee + Stimmung (Cinematic/Hype/Calm/Corporate) + Ziel-Dauer (15s/30s/60s)
  - Step 2: KI generiert Plan-Preview (Szenen mit Prompts) → User kann anpassen/regenerieren
  - Step 3: Engine-Mix (Auto/Premium/Budget) + Voice + Musik → "Movie generieren"
- **DB**: Neue Spalte `composer_projects.auto_director_config` (JSONB für Reproduzierbarkeit)
- **UI-Integration**: Neuer prominenter "✨ Auto-Director" CTA in `VideoComposerDashboard.tsx` Header + Empty-State

### Engines & Cost-Estimate
- Standard: 4 Szenen à 5s mit Hailuo (~0.8€) + Voiceover (~0.05€) + Render = **~1€ pro Auto-Movie**
- Live-Cost-Preview im Wizard, Refund-Sicherheit über bestehendes `compose-video-clips`

---

## 📤 Session 2 — Block P: Multi-Format Smart Export (~2h)

**Ziel**: Ein Composer-Projekt → **simultanes Rendering in 16:9, 9:16, 1:1** (TikTok + YouTube + Instagram-Feed in einem Klick). Wettbewerb: HeyGen, Submagic.

### Bestehende Bausteine
- ✅ `ExportPresetPanel.tsx` (6 Presets, Single-Trigger)
- ✅ `compose-video-assemble` mit `aspectOverride` Support
- ✅ Composer-Export-Tabelle (`composer_exports`)

### Neu / Erweiterung
- **`ExportPresetPanel.tsx` Refactor**:
  - Multi-Select Checkboxen statt Single-Click
  - "Smart Crop"-Toggle: Center vs. AI-Subject-Tracking (Phase 2)
  - "Alle ausgewählten exportieren" Batch-Button mit Cost-Sum-Preview
  - Live-Status-Grid (jedes Format: Pending/Rendering/Ready mit Download)
- **`render-multi-format-batch`** (neue Edge Function — wrapper über bestehende `render-multi-format`):
  - Akzeptiert `presetKeys: string[]`
  - Triggert N parallele `compose-video-assemble` Jobs (max 3 concurrent — Lambda-Limit)
  - Schreibt N Rows in `composer_exports` mit `batch_id`
- **Smart-Reframe (Phase 1, deterministisch)**: Center-Crop mit konfigurierbarem `safeAreaTop/Bottom` per Preset (TikTok-UI berücksichtigen)
- **Smart-Reframe (Phase 2, optional spätere Session)**: AI-Subject-Detection via Gemini Vision für intelligentes Pan&Scan

### Erwartete Wirkung
Reduziert manuelles Re-Editing für Cross-Posting von 30min auf 30s. Killer-Feature für Social-Media-Manager.

---

## 🎤 Session 3 — Block Q: Talking-Head / Lip-Sync (~3h)

**Ziel**: User uploaded Foto eines Charakters + schreibt Skript → System generiert Lip-Sync-Video mit echter Stimme. Wettbewerb: HeyGen, D-ID, Synthesia.

### Provider-Wahl: **Hedra Character-3** (Replicate)
- Beste Qualität für Foto→Talking-Head (vs. Sync.so, das primär Lip-Sync auf existierenden Videos macht)
- Replicate-Integration, gleiche Patterns wie Kling/Luma → **kein neuer API-Provider nötig**
- Cost: ~0.15€/Sek bei 720p
- *(Alternative Sync.so für Lip-Sync auf bestehende Composer-Clips können wir in Phase 2 ergänzen)*

### Implementierung
- **`generate-talking-head`** (neue Edge Function):
  - Input: `imageUrl`, `audioUrl` (oder `text` + `voiceId` → ElevenLabs TTS first), `aspectRatio`
  - Replicate `hedra/character-3` Aufruf
  - Speichert Output in `library` Bucket, schreibt in `composer_scenes` als `talking-head` Szenen-Typ
  - Webhook-basiert (gleicher Pattern wie `compose-clip-webhook`)
- **DB-Migration**:
  - Neuer Wert in `composer_scenes.media_type` enum: `'talking-head'`
  - Neue Spalten: `character_image_url`, `character_audio_url`, `character_voice_id`
- **`TalkingHeadDialog.tsx`**:
  - Tab 1: Charakter-Foto upload (oder aus Charakter-Bibliothek wählen — `character_assets` Tabelle existiert bereits)
  - Tab 2: Skript-Editor + Voice-Picker (ElevenLabs presets + User-Cloned-Voices)
  - Live Cost-Preview, Generieren-Button
- **Integration**: Neuer "🎤 Talking-Head"-Button in `SceneCard.tsx` (für neue Szenen) + im Storyboard-Tab "Add Scene"-Menu

### Voice-Cloning Integration (Bonus, ~30min)
- Composer-Voice-Picker erweitern: zeigt User's gecloneten Stimmen aus bestehender `clone-voice` Function
- Neuer "+ Clone neue Stimme"-Button → öffnet existierenden Clone-Flow inline

---

## 📊 Roadmap Übersicht (für nach Q)

| Block | Feature | Aufwand | Priorität |
|-------|---------|---------|-----------|
| **O** ✨ | AI Auto-Director (1-Click) | 3.5h | 🔥 HOCH |
| **P** 📤 | Multi-Format Export | 2h | 🔥 HOCH |
| **Q** 🎤 | Talking-Head + Voice-Clone UI | 3h | 🔥 HOCH |
| R | Smart Reframe (AI Subject Tracking) | 2h | MID |
| S | Performance-Loop (Top-Performing Templates auto-suggest) | 3h | MID |
| T | Realtime Collaboration (presence, comments) | 5h | LOW |
| U | Brand Memory (Auto-Apply Brand Kit pro Projekt) | 1.5h | EASY-WIN |

---

## 🚀 Vorgeschlagene Reihenfolge

**Diese Session**: Block O (Auto-Director) — größter UX-Hebel, macht das Tool für Erstnutzer "magisch"

Danach: P → Q in separaten Genehmigungen, je ~2-3h.

### Geänderte / neue Dateien für Block O
- `supabase/migrations/..._auto_director_config.sql` (Neu)
- `supabase/functions/auto-director-compose/index.ts` (Neu)
- `src/components/video-composer/AutoDirectorWizard.tsx` (Neu)
- `src/hooks/useAutoDirector.ts` (Neu)
- `src/components/video-composer/VideoComposerDashboard.tsx` (Modified — CTA hinzufügen)
- `src/types/video-composer.ts` (Modified — `autoDirectorConfig` Type)
- i18n DE/EN/ES für Wizard-Strings

**Soll ich mit Block O starten?**
