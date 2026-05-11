## Befund

Edge-Logs zeigen den echten Fehler:

```
[compose-twoshot-audio] error
ElevenLabs Female Meditation Guide failed (400):
"An invalid ID has been received: 'Female Meditation Guide'"
```

Die Szene hat in `dialog_voices`:
- `matthew-dusatko` → `engine: hume`, `voiceId: "Dungeon Master"`
- `sarah-dusatko`  → `engine: hume`, `voiceId: "Female Meditation Guide"`

Das sind **Hume-Stimmen**, aber `compose-twoshot-audio` ruft immer ElevenLabs auf und schickt den Hume-Namen als ElevenLabs-Voice-ID → 500. Danach läuft `compose-twoshot-lipsync` in 422 (kein `character_audio_url`), und im UI erscheint „Lip-Sync fehlgeschlagen – Edge Function returned a non-2xx status code".

## Umsetzung

1. **`compose-twoshot-audio` engine-aware machen**
   - `resolveVoiceId` so erweitern, dass es `{ voiceId, engine, provider }` zurückgibt statt nur eines Strings.
   - Pro Dialog-Block je nach `engine`:
     - `elevenlabs` (default) → bestehender ElevenLabs-Aufruf.
     - `hume` → neuer `humeMp3()`-Aufruf gegen `https://api.hume.ai/v0/tts/file` mit `voice: { name, provider }` und `format: { type: 'mp3' }` (analog zu `generate-voiceover-hume`).
   - Wenn `engine` fehlt aber `voiceId` nicht wie eine ElevenLabs-ID aussieht (nicht 20 Zeichen alphanumerisch), wird automatisch Hume probiert; schlägt das fehl, sauberes Fallback auf eine Default-ElevenLabs-Stimme statt 500.

2. **Audio-Pipeline auf MP3-Concat umstellen**
   - Bisher wird PCM 16-bit @ 44.1 kHz konkateniert und als WAV verpackt. Hume liefert MP3, kein PCM bei gleicher Rate.
   - ElevenLabs auf `output_format=mp3_44100_128` umstellen, Hume auf `format: { type: 'mp3' }` belassen.
   - Pro Block MP3-Bytes holen, mit kurzer Stille-MP3 (vorab generierter Buffer für `gapSec`) als Frames aneinanderhängen; Ergebnis als `audio/mpeg` in den `voiceover-audio` Bucket hochladen.
   - Sync.so akzeptiert MP3 als Audio-Input, also kein Format-Bruch für `compose-twoshot-lipsync`.

3. **Self-Healing der aktuellen Szene**
   - Stuck-Szene `ad491587-…` zurücksetzen (`character_audio_url=NULL`, `audio_plan=NULL`, `lip_sync_status='pending'`, `twoshot_stage=NULL`), damit der Auto-Trigger in `ClipsTab` einen sauberen Lauf startet, sobald die Edge-Funktion das Hume-Routing kann.

4. **Sichtbares Logging + saubere 4xx**
   - Wenn weder ElevenLabs- noch Hume-Aufruf klappt, mit `400` + sprechender Fehlermeldung (`"Voice 'X' (engine=hume) konnte nicht erzeugt werden"`) zurück, statt 500. So zeigt das UI den echten Grund.

## Out of Scope

- Keine Änderungen am Face-Lock / `compose-scene-anchor`.
- Keine Änderung am Sync.so-Aufruf selbst.
- Keine UI-Änderung am Voice-Picker (Hume bleibt eine gültige Wahl).

## Validierung

- Nach Deploy: erneuter Klick auf "Lip-Sync starten" für Szene 1.
- Edge-Logs zeigen `[compose-twoshot-audio] hume voice ok` statt ElevenLabs-400.
- DB: Szene bekommt `character_audio_url`, `lip_sync_status` läuft `pending → running → done`, Preview spielt Voiceover über Lip-Sync-MP4.
