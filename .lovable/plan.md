## Ziel

Der `[Dialog]`-Marker im KI-Prompt soll künftig nicht nur Sprecher + Text enthalten, sondern auch die **konkreten Zeitstempel** (Start-Sekunde + Dauer) pro Zeile, basierend auf den real gemessenen TTS-Audiolängen. So weiß die KI exakt, wer wann von wann bis wann spricht — Voiceover, Lip-Sync und Schnitt sind komplett deterministisch geplant, nichts wird der KI mehr überlassen.

So macht es auch Artlist (Maxim AI Director): jede Szene bekommt einen "Audio Plan" mit Speaker, Start, End, der dann an die i2v / Lip-Sync-Engine weitergereicht wird.

## Format des neuen Markers

```text
[Dialog]
Audio plan (exact, do not deviate):
- 0.00s–3.42s  Matthew Dusatko speaks: "Welcome to DroneOcular"
- 3.57s–7.18s  Sarah Dusatko speaks: "Tired of wasting hours fighting weeds?"
Total spoken duration: 7.18s. Use this exact speaker order and timing for lip-sync.
Do NOT render any on-screen text, captions, subtitles, signs, watermarks, logos or written words.
[/Dialog]
```

Regeln:
- Zeitachse beginnt bei `0.00s` relativ zum Szenenstart.
- Standard-Pause zwischen Sprechern: `0.15s` (wie bereits in `cumulativeOffset` verwendet — eine einzige Quelle der Wahrheit).
- Idempotent: alter `[Dialog]…[/Dialog]` Block wird ersetzt, nicht dupliziert.
- Wenn (noch) keine Audiodauer vorliegt (User hat noch nicht "Voiceover generieren" geklickt), wird wie bisher der textbasierte Marker ohne Zeitstempel ausgegeben — Fallback bleibt erhalten.

## Umsetzung

### 1. `src/lib/talking-head/parseDialogScript.ts`
- `DialogBlock` um zwei optionale Felder erweitern:
  - `durationSec?: number` — reale TTS-Länge in Sekunden.
  - `startSec?: number` — kumulativer Start innerhalb der Szene.

### 2. `src/lib/motion-studio/applyDialogToPrompt.ts`
- `buildSpokenLinesBlock(blocks)` neu schreiben:
  - Wenn alle Blocks `durationSec` haben → `Audio plan (exact, do not deviate)` Variante mit `start–end` pro Zeile + `Total spoken duration`.
  - Sonst → bisheriger sprachlicher Fallback (unverändert).
- Konstante `INTER_SPEAKER_GAP_SEC = 0.15` exportieren, damit der Studio-Code dieselbe Pause nutzt.
- Negativ-Constraint (`Do NOT render captions…`) bleibt unverändert.

### 3. `src/components/video-composer/SceneDialogStudio.tsx`
- **`handleGenerateInline` (Multi-Speaker-Modus)**:
  - Nach jedem TTS-Call den Block direkt mit `startSec` (= bisheriges `cumulativeOffset` vor dem Increment) und `durationSec` anreichern.
  - Am Ende `applyDialogToPrompt(prompt, blocksMitTiming, language)` aufrufen und `aiPrompt` über `onUpdate` schreiben.
- **`handleGenerate` (SRS-Split-Modus)**:
  - Genauso: aus `subs[]` (enthält bereits `durationSec` pro Block) + `INTER_SPEAKER_GAP_SEC` die `startSec` pro Block berechnen, daraus den Master-Prompt für die Parent-Szene bauen und persistieren.
  - Pro Sub-Szene zusätzlich einen Mini-`[Dialog]` mit `0.00s–{durationSec}s` als `aiPrompt` setzen, damit auch isolierte Sub-Szenen exakte Zeitinfo tragen.
- Beim sofortigen Pre-Update vor dem TTS-Call (nur Sprecherzeilen, noch ohne Timing) bleibt es beim Text-Fallback.

### 4. Keine Backend-Änderungen
- `compose-video-clips`, HeyGen, generate-voiceover, generate-voiceover-hume bleiben unverändert. Der Marker ist reine Prompt-Anreicherung; die Timing-Wahrheit für die Render-Pipeline bleibt `dialogScript` + `audioUrl` + `durationSec` pro Sub-Szene (wie heute).

## Ergebnis

Im Prompt-Vorschau-Panel sieht der Nutzer nach Klick auf "Voiceover generieren" sofort:

```
[Dialog]
Audio plan (exact, do not deviate):
- 0.00s–2.10s  Matthew Dusatko speaks: "Welcome to DroneOcular"
- 2.25s–5.43s  Sarah Dusatko speaks: "Tired of wasting hours fighting weeds?"
Total spoken duration: 5.43s. Use this exact speaker order and timing for lip-sync.
Do NOT render any on-screen text, captions, subtitles, …
[/Dialog]
```

Damit ist die Audio-/Lip-Sync-Planung deckungsgleich mit dem, was Artlist intern macht — Sprecher, Reihenfolge und Sekunden sind hart im Prompt verankert.
