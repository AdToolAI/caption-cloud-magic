## Befund

Szene 1 in deinem Composer-Projekt nutzt im Dialog die Hume-Stimme **„Dungeon Master"** (Provider `HUME_AI`, Engine `hume`). Die HeyGen-Render-Pipeline (`compose-video-clips` → `generate-talking-head`) hat aber nur einen einzigen TTS-Pfad: **ElevenLabs**. Sie übergibt den Voice-Namen 1:1 als ElevenLabs-Voice-ID, was logischerweise fehlschlägt:

```
[compose-video-clips] HeyGen scene … failed: 500
ElevenLabs TTS failed: An invalid ID has been received: 'Groovy Guy'.
status: invalid_uid
```

Genau derselbe Fehlertyp tritt für „Dungeon Master" auf → deshalb fällt Szene 1 reproduzierbar aus, während Szene 2 in seltenen Fällen durchläuft (z. B. wenn dort eine echte ElevenLabs-Stimme oder eine kompatible Voice-ID vergeben ist — aktuell hat Szene 2 ebenfalls Hume `Geraldine Wallace` und würde beim nächsten Retry genauso scheitern; sie steht nur deshalb auf `ready`, weil ihr alter Hailuo-Clip noch im Storage liegt).

Die UI rollt nach dem Fehler den optimistischen `generating`-Status zurück und zeigt deshalb dauerhaft „Fehlgeschlagen" für Szene 1.

## Fix (nur Backend, keine UI-Änderungen)

### 1. `supabase/functions/compose-video-clips/index.ts` — HeyGen-Branch (~Zeile 490–567)

Vor dem Aufruf von `generate-talking-head` prüfen, ob die gewählte Stimme aus einem nicht-ElevenLabs-Provider stammt:

- Wenn `voiceCfg.provider === 'HUME_AI'` oder `voiceCfg.engine === 'hume'` (case-insensitive):
  1. `generate-voiceover-hume` aufrufen mit `text = cleanText` und `voiceName = voiceCfg.voiceId || voiceCfg.voiceName`.
  2. Aus der Antwort die `audioUrl` lesen.
  3. `generate-talking-head` mit **`audioUrl`** statt `text + voiceId` aufrufen (der Endpoint unterstützt das bereits, siehe Zeile 595–599 dort).
- Fällt die Hume-Synthese aus, klare Fehlermeldung in `clip_error` schreiben („Hume-Stimme '…' konnte nicht synthetisiert werden — bitte im Voiceover-Tab eine ElevenLabs-Stimme wählen.") statt stiller 500.
- Wenn gar keine Voice-Config gesetzt ist, weiter wie bisher mit ElevenLabs-Default-Voice.

### 2. Defensive Validierung

Falls `provider`/`engine` unbekannt ist und `voiceId` länger als ~32 Zeichen alphanumerisch ist → als ElevenLabs-ID akzeptieren. Sonst: gleiche Fehlermeldung wie oben (statt blinden ElevenLabs-Call), damit der User sofort sieht, was zu tun ist.

### 3. Keine Datenbank-Migration nötig

`character_audio_url`, `lip_sync_status`, `clip_error` sind alle vorhanden; wir schreiben in dieselben Felder.

### 4. Optional, separat: Cleanup der bereits fehlgeschlagenen Szene

Das Datenfeld `clip_status` von Szene 1 (`632c7ee3…`) steht aktuell auf `ready` mit altem Hailuo-Clip; nach dem Fix einmalig "Erneut versuchen" klicken → produziert frischen HeyGen-Talking-Head mit Hume-Voice.

## Technische Details

```text
compose-video-clips (HeyGen branch)
 ├─ voiceCfg.provider === 'HUME_AI'?
 │   ├─ yes → invoke('generate-voiceover-hume', { text, voiceName })
 │   │        → audioUrl
 │   │        → invoke('generate-talking-head', { imageUrl, audioUrl, … })
 │   └─ no  → invoke('generate-talking-head', { imageUrl, text, voiceId, … })
 └─ Fehler → clip_error mit konkretem Hinweis (statt 500)
```

Edge Functions zum Re-Deploy: `compose-video-clips`.

## Was nicht angefasst wird

- Voice-Picker/UI bleibt wie sie ist (Hume-Stimmen weiter wählbar).
- `generate-talking-head` selbst bleibt unverändert (audioUrl-Pfad existiert schon).
- Szene-2-Pipeline und Cinematic-Sync werden nicht berührt.
