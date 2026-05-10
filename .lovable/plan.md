## Ziel
Two-Shot/Cinematic-Sync soll hörbares Voiceover haben und die ausgewählten Avatar-Referenzen deutlich zuverlässiger verwenden.

## Befund
- Die aktuelle Szene steht in der Datenbank auf `twoshot_stage = audio`, `clip_status = ready`, hat aber **kein** `character_audio_url`, **kein** `audio_plan`, **kein** `lip_sync_applied_at` und `lip_sync_status = null`.
- In den Logs steht: `compose-video-clips twoshot-audio prep failed ... HTTP 401 Unauthorized`.
- Deshalb wurde zwar der stumme Master-Clip gerendert, aber der Two-Shot-Voiceover-Track wurde nicht erzeugt und der Lip-Sync wurde nie gestartet.
- Zusätzlich ist `lip_sync_status` nicht auf `pending`; dadurch greift der Auto-Trigger in `ClipsTab` nicht.

## Umsetzung
1. **Server-seitige Two-Shot-Audio-Prep reparieren**
   - In `compose-video-clips` den internen Aufruf von `compose-twoshot-audio` so ändern, dass er mit einem gültigen User-JWT läuft statt mit dem Service-Key.
   - Alternativ/zusätzlich `compose-twoshot-audio` für vertrauenswürdige interne Service-Aufrufe absichern und projekt-/User-Kontext aus der Szene validieren.

2. **Two-Shot-Status korrekt setzen**
   - Beim Start von Cinematic-Sync konsequent setzen:
     - `lip_sync_status = 'pending'`
     - `lip_sync_with_voiceover = true`
     - `twoshot_stage = 'audio' | 'anchor' | 'master_clip'`
   - Nach erfolgreichem Audio-Prep sicherstellen, dass `character_audio_url`, `audio_plan.twoshot` und eine `scene_audio_clips`-Voiceover-Zeile vorhanden sind.

3. **Auto-Trigger für bestehende/halb fertige Szenen robuster machen**
   - `ClipsTab` so erweitern, dass Cinematic-Sync-Szenen mit `clip_url` und fehlendem `lip_sync_applied_at` auch dann den Lip-Sync starten, wenn `lip_sync_status` noch `null` ist, sofern `twoshot_stage`/`engine_override` klar Two-Shot signalisiert.
   - Falls `character_audio_url` fehlt, soll `compose-twoshot-lipsync` zuerst `compose-twoshot-audio` erzeugen und danach Sync.so starten.

4. **Aktuelle kaputte Szene selbstheilend machen**
   - Für Szenen wie die aktuelle (`twoshot_stage='audio'`, fertiger Clip, aber kein Audio/LipSync) wird beim nächsten Poll automatisch Audio + Lip-Sync neu angestoßen, ohne dass der User neu rendern muss.

5. **Face-Lock verbessern, ohne falsches 1:1 zu versprechen**
   - `compose-scene-anchor` Prompt noch stärker auf "reference image preservation" trimmen: keine Beauty-/Age-/Face-Changes, Image #1/#2 strikt an Namen binden, Gesicht frontal/erkennbar halten, keine generischen Lookalikes.
   - Cache-Key um eine `identityLockVersion` erweitern, damit alte schwächere Anchor-Bilder nicht wiederverwendet werden.
   - Wichtig: Bei generativer Multi-Person-Videoerzeugung ist echte pixelgenaue 1:1-Identität technisch nicht garantiert; die Änderung maximiert aber die Referenztreue und verhindert alte Cache-Treffer.

## Validierung
- Edge-Logs dürfen keinen `twoshot-audio ... 401 Unauthorized` mehr zeigen.
- Eine Two-Shot-Szene muss nach Master-Clip automatisch von `pending/running` zu `lip_sync_status='done'` wechseln.
- Die Preview muss dann das final lip-synced MP4 mit eingebettetem Audio abspielen.