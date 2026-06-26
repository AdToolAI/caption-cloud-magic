# Wave B — Sub-Welle B2: Provider Wrapper (~52 generate-* Functions)

## Status
- Wave A (29) + B1 (25) = **54/473** grün, alle Kategorien einzeln getestet ✓
- B2-Scope: **52 `generate-*` Functions** ohne Mock-Guard (frisch gezählt).
- Ziel nach B2: **106/473** smoke-safe.

## Plan

### 1) Mock-Guard in alle 52 Functions
Bulk-Patcher-Script läuft pro File:
- Import: `import { isQaMockRequest, qaMockJson } from '../_shared/qaMock.ts'` falls fehlend.
- Guard direkt nach OPTIONS-Handler: `if (isQaMockRequest(req)) return qaMockJson(corsHeaders, MOCK_BODY)`.
- CORS `Access-Control-Allow-Headers` um `x-qa-mock` ergänzen falls fehlend.
- Realistische Mock-Bodies pro Function-Familie (siehe unten).

### 2) Mock-Body-Shapes (an Provider-Wrapper angelehnt)
- **Video** (`generate-ai-video`, `generate-fast-preview`, `generate-composer-image-scene`, `generate-scene-visual`, `generate-background-scenes`, `generate-video-thumbnail`, `generate-video-variants`, `generate-thumbnail`, `generate-premium-visual`, `generate-studio-image`, `generate-scene-still`, `generate-brand-asset`, `generate-character-sheet`, `generate-avatar-portrait`, `generate-avatar-poses`, `generate-avatar-wardrobe`, `generate-wardrobe-perspectives`, `generate-location-vibes`, `generate-location-props`, `generate-world-asset`, `generate-image-prompt`):
  ```ts
  { url: 'https://example.com/qa-mock-asset.mp4', asset_url: '…', job_id: 'qa_mock_job', status: 'succeeded' }
  ```
- **Audio / VO / TTS** (`generate-voiceover`, `generate-voiceover-hume`, `generate-voiceover-script`, `generate-video-voiceover`, `generate-multi-speaker-vo`, `generate-subtitles`, `generate-music-lyrics`):
  ```ts
  { audio_url: 'https://example.com/qa-mock.mp3', duration: 5.0, segments: [], status: 'succeeded' }
  ```
- **Script / Text / Campaign** (`generate-ad-script`, `generate-video-script`, `generate-universal-script`, `generate-subtitle-script`, `generate-long-form-script`, `generate-scene-dialog`, `generate-caption`, `generate-post-caption`, `generate-post`, `generate-post-v2`, `generate-bio`, `generate-carousel`, `generate-reply-suggestions`, `generate-followup-question`, `generate-first-video-prompts`, `generate-optimized-prompt`, `generate-campaign`, `generate-email-campaign`, `generate-week-strategy`, `generate-starter-plan`, `generate-posting-slots`, `generate-share-link`, `generate-brand-kit`, `generate-usage-report`)
  ```ts
  { text: 'QA mock content', script: 'QA mock script', variants: ['v1','v2'], status: 'succeeded' }
  ```

### 3) Registry-Erweiterung
`_shared/smokeRegistry.ts` bekommt 52 neue Einträge:
- 3 neue Kategorien zusätzlich zu bestehenden: `video-providers`, `audio-providers`, `script-providers`.
- `expect: 'any-2xx'` für alle (kein Schema-Match nötig — Mock liefert deterministisch `{ ok: true, mock: true, … }`).
- Defaults: `timeoutMs: 8000`, `body: {}`.

### 4) Aufteilung in 3 Batches (zur Sicherheit)
- **B2.1 — Video Provider Wrapper (21 Functions)**: alle Image/Video-Generators inkl. Avatar/Wardrobe/Location/World.
- **B2.2 — Audio/VO/TTS (7 Functions)**: alle Voiceover, Subtitles, Music-Lyrics.
- **B2.3 — Script/Text/Campaign (24 Functions)**: alle Text/Plan/Campaign-Generators.

Nach jedem Batch deployen → User testet die neue Kategorie im Cockpit einzeln (Kategorie-Modus, kein Rate-Limit-Risiko). Erst dann nächster Batch.

### 5) Bulk-Patcher Script
Python-Script `/tmp/patch_b2.py` (nicht ins Repo):
- Liest jede `index.ts` der Liste.
- Erkennt OPTIONS-Handler-Stil (block `{…}` vs inline `return`).
- Fügt Import + Guard idempotent ein (Re-Run safe).
- Patcht `Access-Control-Allow-Headers` wenn `x-qa-mock` fehlt.
- Verifiziert nach Patch: `isQaMockRequest`, `qaMockJson`, `x-qa-mock` müssen alle drei vorkommen.

## Done-Kriterien
- Pro Batch: alle neuen Tiles in der jeweiligen Kategorie grün im Kategorie-Sweep.
- Coverage nach B2 komplett: **106/473** (~22%).
- Kein Deployment scheitert am Patcher (Verifikations-Step bricht ab statt halbpatched zu deployen).

## Nicht im Scope
- Echte Provider-Calls (bleiben Deep-Sweep).
- `generate-*` Functions die schon einen Guard haben (~16) — Skip.
- UI-Änderungen am Cockpit (Kategorie-Modus reicht).

## Reihenfolge
B2.1 (Video) → User testet → B2.2 (Audio) → User testet → B2.3 (Script) → User testet → nächste Sub-Welle **B5** (Skip-Liste für Admin/Cron) damit Cockpit-Coverage realistisch wird.
