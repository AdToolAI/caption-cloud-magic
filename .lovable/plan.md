## Diagnose
Die neue Meldung ist tatsächlich ein anderer Fehler:

`ffmpeg_wasm_unavailable: ffmpeg.wasm does not support nodejs`

Der alte Replicate-404 ist damit weg, aber der neue `@ffmpeg/ffmpeg` Wrapper blockiert in der Edge-Function-Runtime, weil er sie als Node-ähnliche Runtime erkennt. Ergebnis: Die Face-Probe kann weiterhin kein JPEG extrahieren und bleibt `WARN`.

## Plan
1. **ffmpeg.wasm aus der Edge Function entfernen**
   - `face-frame-extract.ts` nicht mehr über `@ffmpeg/ffmpeg` laden.
   - Keine weitere Abhängigkeit auf Replicate oder Node/WASM-Wrapper.

2. **Stabilen Browser-Canvas-Extractor für die Forensik nutzen**
   - Im Forensik-Sheet beim Reload/Preflight den Ziel-Frame clientseitig mit `<video>` + `<canvas>` extrahieren.
   - JPEG in den bestehenden `composer-frames` Bucket hochladen.
   - Den hochgeladenen Frame als `probe_frame_url` an `syncso-preflight` übergeben.

3. **Preflight akzeptiert optional bereits extrahierten Frame**
   - `syncso-preflight` nimmt optional `probe_frame_url` entgegen.
   - Wenn vorhanden, wird Gemini direkt mit diesem JPEG geprüft.
   - Wenn nicht vorhanden, bleibt der bestehende Server-Extractor als Fallback erhalten, aber der bekannte `ffmpeg_wasm_unavailable` wird klar als `probe_unavailable` markiert.

4. **Live-Dispatch sicher halten**
   - Für echte automatische Dispatches ohne Browser-Kontext bleibt der Face-Gate weiterhin non-blocking bei Extractor-Ausfall, damit keine Pipeline hart crasht.
   - Die Forensik bekommt aber endlich ein echtes PASS/BLOCKED-Ergebnis, weil dort der Browser den Frame zuverlässig extrahieren kann.

5. **UI-Version und Fehlertext aktualisieren**
   - Badge auf `v129.14` setzen.
   - Warntext für `ffmpeg_wasm_unavailable` erklären: Edge-Runtime kann ffmpeg.wasm nicht ausführen; Browser-Frame-Extractor wird verwendet.

## Erwartetes Ergebnis
Nach Reload im Sync.so-Forensik-Sheet sollte `Gesicht am ASD-Frame` nicht mehr wegen `ffmpeg_wasm_unavailable` auf `WARN` stehen, sondern entweder:

- `PASS` mit extrahiertem JPEG, oder
- `BLOCKED/FAIL` mit echtem Grund wie `no_face`, `multiple_faces` oder `not_at_coord`.