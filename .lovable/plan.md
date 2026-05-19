## Diagnose

Der gehostete Backend-Status ist normal. Das Problem liegt in der Pipeline selbst, nicht an Lovable Cloud.

Was ich in Logs/DB gesehen habe:

- Sync.so wird wirklich direkt aufgerufen (`sync.so/v2 direct`).
- Die neueste Szene `40367ba2-...` ist nicht mehr „hängend“, sondern Sync.so hat Pass 1 nach kurzer Zeit mit `An error occurred in the generation pipeline` abgelehnt.
- Die ältere Szene `2f0f6807-...` wurde nach ca. 10 Minuten vom `qa-watchdog` automatisch als stuck markiert und refunded, obwohl ein echter `sync:` Job lief. Das killt lange laufende Sync.so-Jobs weiterhin.
- Der Anchor enthält sichtbar einen Klon: die zwei linken Männer sehen wie dieselbe Person aus. Unsere bisherige Prüfung zählt nur „2 Gesichter“, aber prüft nicht „Matthew und Samuel sind zwei unterschiedliche Identitäten“.
- Die Face-Koordinaten sind nicht vertrauenswürdig: Gemini meldet z.B. `1920x1080`, das echte Anchor-/Videoformat ist aber `1376x768`. Dadurch können Sync.so-Koordinaten neben dem eigentlichen Gesicht landen und die Generation scheitert.

## Plan

1. **Watchdog darf echte Sync.so-Jobs nicht mehr töten**
   - `qa-watchdog` ignoriert `lip_sync_status='running'` mit `replicate_prediction_id='sync:...'` für den alten 10-Minuten-Stale-Fail.
   - Stattdessen wird höchstens der Poller angestoßen oder ein viel längeres Provider-TTL-Fenster genutzt.
   - Refund nur noch bei echtem Sync.so-Fehler, nicht bei „läuft lange“.

2. **Sync.so-Koordinaten korrekt normalisieren**
   - Vor dem Start von Sync.so wird die echte Bild-/Video-Auflösung aus dem Anchor bzw. Clip gelesen.
   - Gemini soll normalisierte Face-Center zurückgeben (`x/y` von 0–1), nicht frei geschätzte Pixelmaße.
   - Die Koordinaten werden serverseitig auf die echte Frame-Größe umgerechnet.
   - Wenn ein Zielpunkt nicht plausibel auf einem Gesicht liegt, wird nicht gespendet, sondern sauber mit `face_target_invalid` abgebrochen.

3. **Identity-Audit statt Face-Count**
   - Der Anchor-Check vergleicht Referenzportrait A/B mit dem komponierten Anchor.
   - Akzeptiert wird nur:
     - beide erwarteten Personen sichtbar,
     - Person A und B eindeutig unterschiedlich,
     - keine geklonte/duplizierte Identität,
     - keine irrelevante dritte Person als Sprecherziel.
   - Bei Klon: Cache invalidieren, einmal neu rendern mit härterem Anti-Clone-Prompt.
   - Wenn erneut Klon: abbrechen mit `anchor_identity_clone_detected`, bevor Hailuo/Sync.so Credits verbrennen.

4. **Serverseitigen Anchor-Fallback reparieren**
   - `compose-video-clips` ruft `compose-scene-anchor` aktuell serverseitig mit Service-Auth auf, während `compose-scene-anchor` einen echten User erwartet.
   - Diese interne Funktion-zu-Funktion-Nutzung wird sauber unterstützt: User aus der Szene/Projekt-Zuordnung ermitteln, aber weiterhin keine öffentliche Umgehung erlauben.
   - Dadurch funktioniert auch der Button „Clip + Lip-Sync neu rendern“ zuverlässig ohne alten/kaputten Anchor.

5. **Sync.so-Fehler besser auswerten und nicht blind retryen**
   - Poller speichert Sync.so `status`, `error_code`, `message`, Job-ID und Input-Metadaten vollständig in `audio_plan.twoshot.syncJobs`.
   - Bei `generation_pipeline_failed` wird maximal einmal mit neu normalisierten Koordinaten neu versucht.
   - Danach klarer Fehler im UI statt Endlos-Retry.

6. **UI-Status präzisieren**
   - Preview zeigt nicht mehr pauschal „Lip-Sync wird vorbereitet…“.
   - Stattdessen:
     - `Sync.so Pass 1 läuft`
     - `Sync.so Pass 2 läuft`
     - `Sync.so wartet noch`
     - `Anchor-Klon erkannt`
     - `Sync.so Providerfehler: ...`

7. **Bestehende kaputte Szene sauber neu starten**
   - Für die aktuelle Szene werden der geklonte Anchor, `faceMap`, `syncJobs`, `replicate_prediction_id` und Lip-Sync-Status geleert.
   - Danach wird die Pipeline neu gestartet, damit sie mit Identity-Audit und korrekten Koordinaten läuft.

## Erwartetes Ergebnis

- Kein 10-Minuten-Stuck/Watchdog-Abbruch mehr für echte Sync.so-Jobs.
- Geklonte Charaktere werden vor dem Video-/Lip-Sync-Schritt erkannt.
- Sync.so erhält valide Face-Koordinaten passend zur echten Frame-Größe.
- Wenn Sync.so trotzdem ablehnt, sieht man den echten Providerfehler statt einer generischen Endlosschleife.