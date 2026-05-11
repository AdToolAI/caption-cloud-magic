## Ziel
Die Two‑Shot/Cinematic‑Sync Pipeline soll wieder zuverlässig:
- beide Charakter-Stimmen hörbar machen,
- das Video nicht nach ca. 4s Voiceover gefühlt enden lassen, sondern die volle 10s-Szene nutzen,
- Gesichter stärker an die Avatar-Referenzen binden.

## Gefundene Ursachen
- `scene_audio_clips` wird nicht gespeichert, weil beim Insert `user_id` fehlt. Dadurch findet `compose-twoshot-lipsync` später oft keinen Voiceover-Clip und verlässt sich nur auf `audio_plan`/Nebenpfade.
- Die Voice-Zuordnung matcht Sprecher wie `Matthew Dusatko` nur über den ersten Namen (`matthew`), aber `dialog_voices` ist per Character-ID (`matthew-dusatko`) gespeichert. Dadurch fällt Matthew auf die Sarah-Stimme zurück. Deshalb hörst du nur die weibliche Stimme.
- Das Video ist zwar als 10s Szene gerendert, aber der erzeugte Audio-Track ist nur ca. 4s lang. Sync.so bekommt aktuell keinen sauberen Auftrag, die restlichen Sekunden als stille/ambient Szene weiterlaufen zu lassen.
- Für Avatar-Treue wird aktuell ein Nano-Banana-komponiertes First Frame an Hailuo gegeben. Das hilft der Komposition, aber Hailuo kann Gesichter danach weiter verändern. Für zwei echte Referenzcharaktere ist das nur begrenzt 1:1.

## Umsetzung
1. **Two‑Shot Audio zuverlässig speichern**
   - `compose-twoshot-audio` Insert in `scene_audio_clips` mit `user_id`, `project_id`, `source`, `volume`, `cost_credits`, `refunded`, `metadata` vervollständigen.
   - Dadurch kann `compose-twoshot-lipsync` den richtigen VO-Clip stabil finden.

2. **Voice-Mapping reparieren**
   - Speaker-Normalisierung erweitern: `Matthew Dusatko` → `matthew-dusatko`, zusätzlich First-Name und Full-Name Keys prüfen.
   - `dialog_voices` zuerst über Character-ID/Slug matchen, dann über Namen, erst danach Fallback.
   - So bekommt Matthew wieder `Dungeon Master` und Sarah `Female Meditation Guide`.

3. **10s Szene nach dem Skript erhalten**
   - Nach dem letzten Dialogsegment eine stille Tail-Zone bis zur Szenendauer im `audio_plan` abbilden.
   - `compose-twoshot-lipsync` soll bei Two‑Shot standardmäßig `sync_mode: "loop"` nur nutzen, wenn es sinnvoll ist, und die Scene-Duration/VO-Duration sauber loggen.
   - Falls Sync.so den Clip dennoch auf Audio-Länge kürzt, wird der LipSync-Output nicht als endgültige 4s-Szene behandelt; dann bleibt/greift die 10s Master-Clip-Quelle als Basis für die weitere Vorschau/Exportlogik.

4. **Avatar-Identität härter locken**
   - Anchor-Prompt auf „no face morphing / identity preservation over beauty / keep asymmetric details“ schärfen.
   - Cache-Key erneut bumpen, damit alte schwächere Anchors nicht wiederverwendet werden.
   - In `compose-video-clips` für Cinematic‑Sync den Hailuo-Prompt mit expliziten Character-Identity-Regeln ergänzen: beide Personen müssen aus den Referenzporträts stammen; keine generischen Lookalikes; Gesichter müssen im ersten Frame erkennbar bleiben.

5. **Aktuelle Szene self-healen**
   - Für die betroffene Szene den falschen Audio-Stand löschen/resetten: `scene_audio_clips` für diese Szene entfernen, `character_audio_url/audio_plan` leeren, `lip_sync_status='pending'`, `twoshot_stage=NULL`.
   - Danach generiert die Pipeline frischen Audio-Track mit beiden Stimmen.

6. **Validierung**
   - Edge Function Logs prüfen: Matthew muss mit `Dungeon Master`, Sarah mit `Female Meditation Guide` erzeugt werden.
   - Datenbank prüfen: ein `scene_audio_clips` Voiceover-Row mit `user_id`, `project_id`, ca. passender Dauer und `speakers` Metadata existiert.
   - Betroffene Functions deployen: `compose-twoshot-audio`, `compose-twoshot-lipsync`, `compose-scene-anchor`, ggf. `compose-video-clips`.