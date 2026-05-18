# Lip-Sync Drift Fix — Artlist-grade Audio Pipeline

## Diagnose

Sync.so/lipsync-2-pro selbst arbeitet sauber. Der Versatz kommt aus unserer Audio-Vorbereitung. Drei harte Drift-Quellen in `compose-twoshot-audio`:

1. **ID3-Bias in der Dauer-Schätzung**  
   `mp3DurationSec = bytes*8/128000` zählt den ID3v2-Header und Xing-Frames von ElevenLabs als Audio. Pro Utterance ~30–80 ms zu viel. Damit landet `segments[i].startSec` für spätere Sprecher zu spät → die Per-Speaker-Spur sagt Sync.so "Mund auf bei t=4.20s", die Merged-Spur spielt die Stimme aber bei t=4.12s.

2. **Stille-Quantisierung auf 26 ms-Frames**  
   `silenceMp3()` rundet jede Pause auf ganze MPEG-Frames (1152/44100 ≈ 26.122 ms). Per Lücke bis zu ±13 ms, bei ABAB-Dialog kumuliert das auf 50–100 ms Versatz.

3. **`sync_mode: loop`** bei zwei Pässen  
   In `compose-twoshot-lipsync` läuft Pass 1 mit `loop`. Wenn die Per-Speaker-Spur durch (1)+(2) nicht exakt scene-lang ist, loopt Sync.so das Tail einer Stille kurz an → minimaler aber sichtbarer Versatz im zweiten Pass.

So macht Artlist es smooth: sample-genaues PCM-Audio (kein MP3-Byte-Stitching), eine **einzige** Audiospur, die identisch in Lipsync und Playback verwendet wird, und harte Begrenzung der Spur auf die Szenendauer.

## Plan

### 1. PCM-Pipeline in `compose-twoshot-audio`
- TTS-Calls auf `output_format=pcm_44100` (ElevenLabs) und `format.type=pcm` (Hume) umstellen. Liefert reines Int16-LE-PCM ohne Header/ID3.
- Konkatenation und Stille als **Sample-genau**: `silenceSamples(n) = Int16Array(n*channels)`. Damit Versatz = 0 ms.
- Spur am Ende auf `totalSamples = round(sceneDur * 44100)` **hart trimmen oder padden**, niemals länger.
- Ein einziges Encoding zu MP3 nur fürs Storage (LAME via wasm) — alternativ als WAV uploaden (`audio/wav`), Sync.so akzeptiert WAV. WAV ist robuster und vermeidet den LAME-WASM-Cold-Start.
- Reale `spokenDuration` aus den Samples ableiten (nicht aus Bytes), `cursor`/`segments[]` damit füttern.

### 2. Einheitliche Spur für Merged + Per-Speaker
- Die per-Speaker-Spuren werden aus **derselben** Sample-Timeline gebaut: nur die Samples des jeweiligen Sprechers bleiben, Rest = Null. Dadurch ist die Sprecher-Position byte-/sample-identisch zur Merged-Spur. Kein Versatz mehr zwischen Lipsync-Output und Playback.

### 3. `sync_mode` in beiden Lipsync-Funktionen fix auf `cut_off`
- In `compose-lipsync-scene` und `compose-twoshot-lipsync` `sync_mode: 'cut_off'` setzen, sobald die Spur exakt scene-lang ist (was nach Schritt 1 immer der Fall ist). `loop` entfernen — es war nur Workaround für die alte zu-kurze MP3-Spur.

### 4. ElevenLabs `with-timestamps` als Sanity-Check (optional, gleich mit ausliefern)
- Pro Utterance zusätzlich `text-to-speech/{voiceId}/with-timestamps` aufrufen oder die alignment-Variante nutzen, um `character_end_times_seconds.at(-1)` zu loggen. Wenn das ≠ unsere Sample-Dauer ist, warnen — hilft beim Debuggen künftiger Provider-Drift, ändert das Audio aber nicht.

### 5. Cache-Invalidation
- Da `scene_audio_clips` jetzt PCM/WAV-basiert ist, alte MP3-Spuren der betroffenen Szenen einmalig invalidieren (`force_regenerate: true` bei nächstem Lipsync-Lauf). Kein DB-Migrationsschritt nötig, der Idempotenz-Check sieht `/twoshot-vo/` und greift weiter; nur Dateiname-Suffix `.wav` triggert Neuerstellung.

### 6. Validierung
- Eine Single-Speaker- und eine ABAB-Two-Shot-Szene neu generieren, im Composer-Preview auf Lippen↔Stimme prüfen.
- In Logs verifizieren: `spokenSec` ≈ `samples/44100` ±1 ms, `totalSec === sceneDur` exakt, Sync.so input mit `sync_mode=cut_off`.

## Technische Details

- Betroffene Dateien:
  - `supabase/functions/compose-twoshot-audio/index.ts` — PCM-Pfad, neue Helfer `pcmFromEleven`, `pcmFromHume`, `samplesToWav`, `silenceSamples`, Entfernen von `silenceMp3` / `mp3DurationSec` / `MP3_BITRATE`-Frame-Math.
  - `supabase/functions/compose-twoshot-lipsync/index.ts` — `sync_mode: 'cut_off'`, Loop-Branch entfernen.
  - `supabase/functions/compose-lipsync-scene/index.ts` — `sync_mode: 'cut_off'` einheitlich.
  - `mem/architecture/lipsync/sync-so-pro-model-policy` — neuen Eintrag "PCM-First Audio Pipeline" + "sync_mode = cut_off always".

- Keine Änderungen am Frontend, an Replicate-Quoten oder am Credit-Modell.
- Kein neuer Secret nötig. ElevenLabs PCM ist im selben Endpoint, Hume PCM ebenso.
- Rollback ist trivial (Edge Function alte Revision), kein DB-Schema-Touch.

Wenn du grün gibst, baue ich genau diese Pipeline.
