
## Befund

Live-DB für Szene `ec22e048…` (9.0 s plate, 4 Sprecher) zeigt zwei voneinander unabhängige Audio-Bugs:

**Sprecher 4 (Sarah) abgeschnitten:**
- `voicedRange` Sarah = 6.880 – 8.691 s, Scene-Plate = 9.000 s.
- In `compose-twoshot-audio/index.ts` (Z. 658–668) wird der gemerged Voice-Track per
  `mergedSamples.subarray(0, totalSamples)` **hart auf Scene-Länge getrimmt**, ohne Warnung,
  ohne Refund, ohne UI-Hinweis. Wenn die TTS-Summe `spokenSec` länger ist als `sceneDur`
  (z. B. Hailuo lieferte einen 8.7 s-Plate statt 10 s; Sarahs Wort endet bei 8.69 s + ElevenLabs-
  Trail), fällt das letzte Wort/der letzte Atemzug ins Trimm-Fenster und ist im finalen Mux weg.

**Charakter 2 (Matthew) „sagt etwas nach seinem Text":**
- Matthew Window = 2.479 – 3.501 s, `voicedSec = 1.022` (peak normalized auf -1 dBFS).
- Das ist verdächtig: `voicedSec === endSec - startSec` heißt **die VAD findet auf dem gesamten
  Segment Sprache** — also kein Stille-Tail. ElevenLabs hat den Tail also mit zusätzlichen
  Wörtern / Atem / „Mhm" befüllt, die im Skript nicht stehen. Bei Aggressiv-Normalisierung
  (-1 dBFS / -16 LUFS) wird dieses Hallucination-Tail laut hörbar und überlappt mit dem
  Anfang von Kailees Window (3.751 s).
- Es gibt aktuell **keinen Script-vs-Audio-Längencheck**: weder Wortzahl ↔ Dauer, noch
  ElevenLabs `character_end_times`-Cap. Jeder von Eleven gelieferte PCM wird 1:1 in die
  Cursor-Position übernommen (`cursorSamples += pcm.length`, Z. 596–629).

## Plan

### 1. Diagnose-Logs hinzufügen (kein neuer Spend)

`compose-twoshot-audio/index.ts`
- Pro Block loggen: `scriptCharCount`, `pcmDurSec`, `expectedDurSec = scriptCharCount / 14` (ca. 14 chars/s EN), `ratio = pcmDurSec / expectedDurSec`.
- Wenn `ratio > 1.35` → Flag `tts_overshoot` im Pass-Diagnostic-Block schreiben.
- Wenn `spokenSec > sceneDur` → `dialog_overflow_sec = spokenSec - sceneDur` im audio_plan persistieren.

### 2. Hallucination-Tail-Trimmer für ElevenLabs (Fix Matthew)

`compose-twoshot-audio/index.ts` (rund um Z. 530 elevenlabsPcm-Aufruf)
- ElevenLabs nicht über die rohe PCM-Route nutzen, sondern den `with-timestamps`-Endpunkt aufrufen — Response liefert `alignment.character_end_times_seconds`.
- `lastScriptCharEndSec = alignment.character_end_times_seconds[lastChar]`
- PCM hart auf `lastScriptCharEndSec + 0.12 s` zuschneiden (Konsonanten-Abklang).
- Wenn `pcm.length / SAMPLE_RATE > lastScriptCharEndSec + 0.40 s` → in Diagnostics als `eleven_hallucinated_tail_trimmed: <ms>` loggen.
- Fallback: wenn `with-timestamps` fehlschlägt → bisherige Route + nachgelagerter `trimSilenceTrailing(pcm, threshDb=-38, minSilenceMs=120)` per Energie-VAD.

### 3. Sarah-Cutoff: Overflow → Scene-Extend statt Hard-Trim

`compose-twoshot-audio/index.ts` (Z. 658–668)
- Statt blind `subarray(0, totalSamples)` zu schneiden:
  - Wenn `spokenSec ≤ sceneDur + 0.30` → nur trimmen, sonst NIE trimmen.
  - Wenn `spokenSec > sceneDur + 0.30` → `newSceneDur = ceil((spokenSec + 0.30) * 10) / 10` setzen, `composer_scenes.duration_seconds` upserten und ein Flag `dialog_overflow_extended: true` in `audio_plan` schreiben.
- Der Master-Plate (Hailuo-Video) ist meist exakt 8–10 s. Für den Extend-Fall wird das letzte Frame in `render-sync-segments-audio-mux/index.ts` per ffmpeg `tpad=stop_mode=clone:stop_duration=<diff>` über den Audio-Tail eingefroren (steht in Remotion-Bundle bereits zur Verfügung via `<Freeze>` — alternativ: serverseitig im Mux). Audio läuft komplett durch, Sarah wird nie mehr abgeschnitten.
- Hard-Cap bei 14 s plate: darüber Pass-Fail `dialog_too_long_for_plate`, refund, UI-Toast „Skript zu lang für die gewählte Szenendauer — bitte Szene auf X s verlängern oder Text kürzen".

### 4. UI-Sichtbarkeit

`SceneInlinePlayer.tsx` / `SceneDialogStudio.tsx`
- Neuer Warn-Pill unter dem Skript: bei `tts_overshoot` oder `dialog_overflow_extended` farbiges Banner (gelb / cyan) mit Sekunden-Info, ohne Render zu blockieren.
- Bei `dialog_too_long_for_plate`: rot, blockierend, mit Link „Szene verlängern".

### 5. Rescue für betroffene Szene `ec22e048…`

- `compose-twoshot-audio` erneut anstoßen (re-TTS aller 4 Sprecher mit dem neuen Trim).
- `compose-dialog-segments` per `reset-lipsync-scene` neu starten — die bestehenden Sync.so-Coords + Identity-Map bleiben gültig.
- Erwartung: Matthew-Window unverändert 2.479 – ~3.30 s (Trail weg), Sarah klingt vollständig aus.

### 6. Validierung

- Audio-Diagnostics-Tabelle muss zeigen: jeder Pass hat `eleven_hallucinated_tail_trimmed` ≤ 0 (idealerweise nicht gesetzt) oder dokumentierten Wert.
- Master-WAV (`audio_plan.twoshot.url`) ffprobe = `spokenSec`, kein Hard-Cut am Scene-Ende.
- Visuell: Matthew schweigt zwischen 3.30 und Kailees Onset; Sarah spricht ihren letzten Satz hörbar zu Ende.

## Technische Details

- ElevenLabs `with-timestamps`-Endpunkt: `POST /v1/text-to-speech/{voice_id}/with-timestamps`, Response enthält `audio_base64` + `alignment.{characters, character_start_times_seconds, character_end_times_seconds}`. Bereits an anderer Stelle im Projekt genutzt (`src/utils/phonemeMapping.ts`).
- `tpad=stop_mode=clone:stop_duration` ist eine Standard-ffmpeg-Operation; alternativ kann die Mux-Lambda via Remotion-Composition `Freeze` denselben Effekt erzielen.
- Keine Änderung an Sync.so-Payloads, an Face-Coords oder am Retry-Ladder — der Bug liegt ausschließlich in der TTS-Assembly und im Hard-Trim.

