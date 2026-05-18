# Fix: Two-Shot Lipsync — Speaker 2 stumm & Audio-Echo

## Symptome (vom User bestätigt)

1. **Speaker 1 lipsynct perfekt** auf den richtigen Mund.
2. **Speaker 2 spricht gar nicht** — der Mund bewegt sich nicht, obwohl sein Voiceover existiert.
3. **Doppeltes Voiceover (Echo)** — der gesamte Dialog ist 2× zu hören, leicht versetzt.

## Root Causes

### A) Speaker 2 stumm — multi-pass kollabiert auf dasselbe Gesicht

`compose-twoshot-lipsync` fährt aktuell **2 sequentielle Sync.so-Passes** (`lipsync-2-pro`):
- Pass 1: original silent clip + Speaker-1-Audio (Rest stumm) → animiert Mund 1 ✅
- Pass 2: **Output von Pass 1** + Speaker-2-Audio (Rest stumm) → sollte Mund 2 animieren

Problem: Sync.so's `active_speaker: true` Auto-Detect wählt im Pass-2-Video das prominenteste / am nächsten zur Kamera stehende Gesicht — und das ist häufig **dasselbe Gesicht wie in Pass 1**, weil das Modell keine explizite Speaker-ID kennt. Resultat: Speaker 1 mouth-syncht stumm Speaker 2's Worte ohne sichtbaren Effekt (Mund war ja schon in Pass 1 aktiv), Speaker 2's Mund bleibt unbewegt.

`sync/lipsync-2-pro` unterstützt einen `face_position` / Crop-Hinweis (laut Replicate-Schema: optionaler `face_index` bzw. `bbox`), aber wir nutzen ihn nicht.

### B) Echo — die externe VO wird zusätzlich zum eingebetteten Audio gespielt

Der Preview-Pfad in `ComposerSequencePreview.tsx` **mutet bereits korrekt** das Video, wenn `audioPlan.twoshot.useExternalAudio === true`. ABER:

- `compose-twoshot-audio` schreibt eine `scene_audio_clips`-Row für die **merged VO** (mit `/twoshot-vo/` im URL-Pfad).
- `useSceneAudioClips` synthetisiert **zusätzlich** virtuelle Clips aus `audio_plan.speakers[]` (jeder Speaker mit `audioUrl` wird ein eigener virtueller voiceover-Clip).
- Bei Two-Shot enthält `audio_plan.speakers[]` die **per-speaker Tracks**, deren URLs **andere** sind als die merged VO → Dedup-by-URL greift nicht → **beide werden gleichzeitig im Preview abgespielt** = Echo.

Zusätzlich: `compose-twoshot-lipsync` setzt `audio_plan.twoshot.useExternalAudio = true`, vergisst aber, die `audio_plan.speakers[].audioUrl` zu löschen oder zu markieren ("schon in merged enthalten").

## Fix-Plan

### 1. Speaker 2 lipsyncen — `face_index` pro Pass (compose-twoshot-lipsync)

Im Multi-Pass-Loop pro Pass `face_index` an Sync.so mitgeben:
- Pass 0 → `face_index: 0` (linke Person, x-sortiert)
- Pass 1 → `face_index: 1` (rechte Person)

Mapping: `character_shots` ist bereits in render-Reihenfolge → wir geben `face_index = pass.shotIdx` an `replicate.run()`. Falls Sync.so das Feld nicht akzeptiert (silent ignore), Fallback auf eine **face-bbox**-Übergabe via `face_bbox: { x, y, w, h }` aus dem ersten Frame (via 2-Spalten-Annahme: links/rechts gleichmäßig geteilt für die initiale Implementierung — wir haben keinen Face-Detector im Edge-Runtime).

Damit hat jeder Pass ein deterministisches Ziel und kann den richtigen Mund animieren, auch wenn das Eingangsvideo aus dem vorherigen Pass kommt.

### 2. Echo eliminieren — virtuelle Per-Speaker-Clips ausblenden bei Two-Shot

Zwei Stellen:

**a) `src/hooks/useSceneAudioClips.ts` — `synthesizeAudioPlanClips`:**
- Wenn `scene.audioPlan?.twoshot?.useExternalAudio === true` ist, **keine** virtuellen Per-Speaker-Clips für diese Szene generieren. Die merged-VO-Row in der DB ist die Single-Source-of-Truth.

**b) `compose-twoshot-lipsync/index.ts` — beim finalen DB-Update:**
- Beim Setzen von `audio_plan.twoshot.useExternalAudio = true` zusätzlich `audio_plan.speakers` so umschreiben, dass `audioUrl` entfernt oder ein Flag `mergedInto: 'twoshot'` gesetzt wird, damit auch andere Konsumenten (Render, Director's-Cut-Export) nicht doppelt mischen.

**c) Defensive Render-Seite (`compose-clip-webhook` / Render-Payload-Builder):** prüfen ob die scene-audio-clips Sammlung für Render-Export ebenfalls die Per-Speaker-Tracks deduped/skipped, wenn der merged-Track existiert. Falls dort gleicher Bug → gleiche Guard-Bedingung.

### 3. Verifikation

- Eine bestehende Two-Shot-Szene neu rendern; in der Vorschau prüfen: nur **einmal** Dialog hörbar, beide Münder bewegen sich passend zu ihrem Text.
- DB-Check: `scene_audio_clips` enthält genau 1 voiceover-Row pro Two-Shot-Szene (die merged `/twoshot-vo/` URL).
- `audio_plan.twoshot.useExternalAudio === true` UND `audio_plan.speakers[*].audioUrl` ist `null` oder mit `mergedInto` markiert.

### 4. Memory-Update

Eintrag `mem://architecture/lipsync/sync-so-pro-model-policy` erweitern: "Multi-pass two-shot MUSS `face_index` pro Pass mitgeben, sonst kollabieren beide Passes auf dasselbe Gesicht. External merged VO ist Single-Source-of-Truth — virtuelle Per-Speaker-Clips dürfen nicht synthetisiert werden."

## Risiken / Out-of-Scope

- **`face_index` Support in Sync.so**: Falls Replicate's lipsync-2-pro das Feld nicht akzeptiert, fällt es silent zurück auf active-speaker-detect → wir haben dann immer noch das alte Verhalten für Pass 2. Mitigations-Stufe 2 wäre ein Face-Bbox-Parameter (oder serverside Crop-Pre-Processing) — würde ich nur angehen, falls Stufe 1 nicht reicht.
- **Bestehende Szenen** mit altem `audio_plan` werden vom Hook-Fix sofort korrigiert (kein DB-Backfill nötig — der Hook liest den Flag live).
- Wir ändern **nicht** den Single-Speaker-Pfad (`compose-lipsync-scene`) — dort gibt es kein Echo.

OK so umsetzen?
