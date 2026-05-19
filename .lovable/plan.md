## Diagnose

Du hast recht: 10–15 Minuten sind kein normaler kurzer Sync.so-Wartezustand. Die Logs zeigen, dass die Szene nicht mehr beim Voiceover oder Anchor scheitert, sondern in einer Retry-/Polling-Schleife rund um Sync.so hängt.

Aktuelle Szene:

- `lip_sync_status = running`
- `twoshot_stage = lipsync_1`
- Sync.so Direct API wird wirklich genutzt: `sync.so/v2 (direct)`
- Face-Audit findet Gesichter: `faceMap { faces: 3, source: "cache" }`
- Pass 1 wird gestartet, aber mehrfach nach 180 Sekunden als Timeout behandelt und erneut gestartet.

Das erklärt die UI: Sie bleibt auf „Lip-Sync wird vorbereitet…“, weil die Szene immer wieder im ersten Sync.so-Pass landet, statt sauber in `failed` oder `done` zu wechseln.

Das zweite Problem — ein Charakter wird geklont — passt zur aktuellen Anchor-Logik: `compose-scene-anchor` sendet mehrere Portraits gleichzeitig an das Bildmodell und zählt danach nur, ob genug Gesichter sichtbar sind. Es prüft aber nicht sicher, ob es wirklich zwei unterschiedliche Personen sind. Dadurch kann das Modell eine Person doppeln, und unser Face-Audit akzeptiert das trotzdem, solange 2+ Gesichter erkannt werden.

## Root Cause

1. **Sync.so ist asynchron, unsere Funktion behandelt es noch zu synchron**
   - `compose-twoshot-lipsync` pollt Sync.so innerhalb derselben Edge Function.
   - Der Pass hat ein hartes 180s-Limit.
   - Sync.so-Jobs können real länger als 3 Minuten dauern.
   - Danach wird refunded und der Auto-Trigger startet neu: Endlos-Schleife.

2. **Face-Targeting ist noch nicht identitätsbasiert**
   - Der Code nimmt Pass 1 = linkes Gesicht, Pass 2 = rechtes Gesicht.
   - Wenn das generierte Bild 3 Gesichter enthält oder eine Person geklont wurde, kann Sync.so auf das falsche Gesicht zielen.
   - Die Prüfung `faces >= 2` reicht für Artlist-Parität nicht aus; wir brauchen `2 unterschiedliche Sprecheridentitäten`.

3. **Anchor-Generation kann mehrere Portraits vermischen**
   - Das Bildmodell bekommt mehrere Referenzen, aber kein harter maschineller Identity-Audit folgt.
   - Ein geklonter/vermischter Charakter wird aktuell nicht zuverlässig verworfen.

## Plan

1. **Sync.so-Job dauerhaft statt zeitlich kurz pollbar machen**
   - `compose-twoshot-lipsync` startet Sync.so Pass 1 und speichert:
     - Sync.so Job-ID
     - aktueller Pass
     - Zielsprecher
     - Zielkoordinate
     - Ausgangsvideo
     - Audio-Track
   - Die Funktion gibt sofort `202 accepted` zurück und bleibt nicht minutenlang im Polling hängen.

2. **Poller für laufende Sync.so-Jobs ergänzen**
   - Neue Edge Function `poll-twoshot-lipsync`.
   - Sie ruft Sync.so über `GET /v2/generate/{id}` ab.
   - Wenn Pass 1 fertig ist:
     - Output von Pass 1 wird als Input für Pass 2 verwendet.
     - Pass 2 wird gestartet und gespeichert.
   - Wenn Pass 2 fertig ist:
     - finales MP4 wird in `composer-clips` rehosted.
     - `lip_sync_status = done`, `twoshot_stage = done`.
     - externe gemischte Dialogspur bleibt aktiv, damit beide Stimmen hörbar sind.
   - Bei echtem Sync.so-Fehler:
     - idempotenter Refund.
     - klare Fehlermeldung in `clip_error`.

3. **Auto-Trigger gegen Endlos-Retry härten**
   - `useTwoShotAutoTrigger` darf Szenen mit laufender Sync.so Job-ID nicht alle paar Minuten zurücksetzen.
   - Wenn `lip_sync_status = running` und `replicate_prediction_id` mit `sync:` beginnt, wird nicht neu gestartet, sondern der Poller angestoßen.
   - Stale-Recovery bleibt erhalten, aber nur für Jobs ohne echte Sync.so Job-ID oder mit eindeutig totem Status.

4. **Charakter-Klonen blockieren**
   - Nach `compose-scene-anchor` wird nicht mehr nur die Anzahl der Gesichter geprüft.
   - Es kommt ein Identity-Audit dazu:
     - Referenzportrait A muss zu Gesicht A passen.
     - Referenzportrait B muss zu Gesicht B passen.
     - A und B müssen klar unterschiedliche Personen bleiben.
   - Wenn das Modell eine Person klont oder Gesichter vermischt:
     - Cache invalidieren.
     - Anchor einmal mit strengerem Prompt neu generieren.
     - Wenn es wieder klont: Szene laut mit `anchor_identity_clone_detected` abbrechen, bevor Hailuo/Sync.so Credits verbrannt werden.

5. **Face-Targeting von links/rechts auf Identität umstellen**
   - Die Zielkoordinaten für Sync.so werden anhand des Identity-Audits gespeichert:
     - Sprecher Matthew → konkretes Gesichtszentrum
     - Sprecher 2 → konkretes Gesichtszentrum
   - Zusatzgesichter oder Nicht-Sprecher im Bild werden ignoriert.
   - Falls 3 Gesichter sichtbar sind, werden nicht blind links/rechts gewählt, sondern die zwei Gesichter, die zu den zwei Sprecher-Referenzen passen.

6. **Aktuelle hängende Szene retten**
   - Bestehende Sync.so Job-ID übernehmen statt neu zu rendern.
   - Poller einmal manuell anstoßen.
   - Wenn der bestehende Sync.so Job fertig ist, wird mit Pass 2 fortgesetzt.
   - Wenn er bei Sync.so wirklich fehlgeschlagen ist, wird der echte Providerfehler sichtbar gemacht und nicht erneut endlos gestartet.

7. **UI-Status klarer machen**
   - Statt dauerhaft „Lip-Sync wird vorbereitet…“ zeigen:
     - `Sync.so Pass 1 läuft`
     - `Sync.so Pass 2 läuft`
     - `Warte auf Sync.so`
     - `Identitätsprüfung fehlgeschlagen: Charakter wurde geklont`
   - So ist sichtbar, ob der Job arbeitet, pollt oder sauber gestoppt wurde.

## Erwartetes Ergebnis

- Kein 10–15-Minuten-Endloszustand mehr.
- Sync.so kann so lange laufen, wie der externe Job real braucht, ohne dass unsere Edge Function abbricht.
- Zwei Sprecher werden über echte Identität und Koordinaten gemappt, nicht mehr nur über links/rechts.
- Geklonte Charaktere werden vor dem teuren Video-/Lip-Sync-Schritt erkannt und automatisch neu versucht oder klar abgebrochen.