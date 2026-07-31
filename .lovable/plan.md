# Plan v337 — Lip-Sync Quality Gate vor dem finalen Mux

## Ziel
Kein Provider-Job darf mehr nur wegen Status „completed“ als erfolgreich gelten. Jeder einzelne Sprecher-Pass muss vor dem finalen Composite nachweislich sichtbare Bewegung im Mundbereich enthalten.

## Umsetzung

1. **Bestehende Bewegungsprüfung auf alle Lip-Sync-Engines erweitern**
   - `useMouthYavgProbe` derzeit nicht nur für `cinematic-sync`, sondern auch für den tatsächlich genutzten `sync-segments`-Pfad aktivieren.
   - Weiterhin direkt die isolierten 720×720-Provider-Ausgaben prüfen, nicht erst das fertige Gruppen-Video.
   - Die Messung pro Provider-Job statt nur pro Sitzungsschlüssel absichern, damit ein Retry erneut geprüft wird.

2. **Finalen Mux bis zum Qualitätsnachweis sperren**
   - Ein Pass erhält nach Provider-Abschluss zunächst den Zustand „Qualitätsprüfung ausstehend“ statt sofort vollständig freigegeben zu werden.
   - `render-sync-segments-audio-mux` darf erst starten, wenn alle Passes einen erfolgreichen Motion-Probe-Nachweis besitzen.
   - Fehlende oder noch laufende Prüfungen bleiben wartend und erzeugen kein scheinbar fertiges Video.

3. **Statische Provider-Ausgaben automatisch behandeln**
   - Unterhalb des bestehenden Bewegungs-Schwellenwerts wird der vorhandene NOOP-Retry ausgelöst.
   - Erster Fehlversuch: erneuter Dispatch mit der alternativen, bereits vorhandenen ASD-Strategie.
   - Bei kleinem Gesicht zuerst der vorhandene mouth-anchored Re-Zoom, danach Bounding-Box-Retry.
   - Erneut statisches Ergebnis: sauber abbrechen, Szene als fehlgeschlagen markieren und Credits idempotent erstatten; niemals einen statischen Pass in den Mux übernehmen.

4. **Race Conditions und doppelte Kosten verhindern**
   - Motion-Probe, Retry und Mux mit vorhandenen Pass-/Attempt-IDs idempotent machen.
   - Veraltete Probe-Ergebnisse eines früheren Jobs dürfen einen neuen Retry nicht freigeben.
   - Parallel eintreffende Webhooks oder Browser-Probes dürfen weder doppelt dispatchen noch doppelt erstatten.

5. **Diagnose vereinheitlichen**
   - Eindeutige Telemetrie für `MOTION_PROBE_PENDING`, `MOTION_PROBE_PASSED`, `MOTION_NOOP_DETECTED`, `NOOP_ESCALATING` und `NOOP_LADDER_EXHAUSTED` schreiben.
   - Sprecher, Pass, Job-ID, Messwert, Schwellenwert und Retry-Variante protokollieren.
   - Die UI zeigt bei endgültigem Fehlschlag eine verständliche Meldung statt eines technisch „erfolgreichen“ Videos ohne Lip-Sync.

6. **Regressionstests und Live-Verifikation**
   - Animierter Pass → freigegeben und gemuxt.
   - Statischer Pass → kein Mux, automatischer Retry.
   - Statischer Retry → Fehler + genau eine Erstattung.
   - Vier Sprecher, davon einer statisch → gesamter Mux bleibt blockiert.
   - Veraltetes Probe-Ergebnis → ignoriert.
   - Doppelte Webhooks/Probe-Requests → kein doppelter Retry oder Refund.
   - Danach Functions deployen und einen 4-Sprecher-Testlauf anhand der Pass-Metriken und des finalen Videos prüfen.

## Bewusste Entscheidung
Kein 1:1-Rollback auf den 27.07.: Der damalige Stand verwendete bereits denselben Sync-3/Preclip-Grundpfad und hätte statische Provider-Ausgaben ebenfalls nicht zuverlässig erkannt. Der gezielte Quality Gate behebt die nachgewiesene Fehlerklasse, ohne Autopilot, aktuelle Geometrie- und Identitätsdaten oder den Mux-Schutz zurückzubauen.