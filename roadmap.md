# Roadmap

## Erledigt
- Topaz Apollo-4K Nachkalibrierung (08.09., Schätzer `2026-09-09-calibrated-v3`): Apollo-4K-Rate von 0,040 auf 0,0156 Credits/Frame korrigiert (gepoolt aus 3 echten Abrechnungen, 1196 Frames). Vier Bestätigungsläufe (5 / 9,9 / 14,7 / 17,1 s, 4K/60): Abweichung 0 % / 0 % / -3,45 % / 0 %, alle profitabel, Listen-Multiplikator 1,42-1,62. Nur diese eine Rate geändert; Chronos, ohne Interpolation, Wallet, Erstattung, Routing, Orchestrierung, Persistenz unverändert. Der historische 51-Credit-Lauf bleibt dokumentierter, unerklaerter Ausreisser (Drift-Warnung aktiv).
- Video-Enhance Orchestration v2 (08.09.): Self-scheduling Persist-/Poll-Worker, sofortige Persistenz-Trigger nach Provider-Completion, konfigurierbare Claim-Limits (3 global / 1 pro User), getrennte provider/persistence/financial/UI-Zustände, monotoniegeschützte Terminalzustände, interne Worker mit JWT/Service-Role-Guards, Multi-Job-Frontend + Job-Center + History-Integration, Reload/Tab-Schließen/Neu-Login zeigt laufende Aufträge weiterhin, Abbruch pro Auftrag ohne andere zu stoppen. Abnahme mit 2 echten parallelen 4K-vCube-Läufen bestanden.
- Topaz-Kostenschätzer v2 (08.09.): gegen echte Abrechnung kalibriert (Upscale flach ~0,017 Credits/Frame, Chronos ~0, Apollo auflösungsabhängig), Rundung statt Aufrunden, abgerechnete Credits + Drift werden in Poll/Reconcile gespeichert. Sechs echte Kalibrierläufe: v1 lag 29-37 % daneben, v2 trifft exakt (0 % Drift).
- Video-Hochskalierung Persistenz-Härtung (07.09.): kein Laden ganzer Dateien in den Speicher mehr (fortsetzbarer Chunk-Transfer mit Zeitbudget), Anbieter-Erfolg und Dateisicherung sind getrennte Zustände, genau ein schwerer Sicherungsvorgang je Durchlauf über atomaren Anspruch/Lease, erschöpfte Versuche gehen in Prüfung statt in stille Erstattung, Aufträge gehören dem Backend (Fortsetzen nach Neuladen über `open_run`), Hochskalierungen erscheinen im Verlauf, Statustexte in DE/EN/ES.
- Abnahme "Auftrag verschwindet beim Neuladen" (07.09., Vorfall geschlossen): echter Lauf `af25429b` (bytedance-vcube, 0,23 €) über 12 vollständige Neuladevorgänge beobachtet — "An die Engine übergeben" und "Datei wird gesichert" kamen jedes Mal zurück, nach Tab-Schließen/Neu-Login im Verlauf sichtbar, Ergebnis abspielbar/ladbar (HTTP 200, 14,9 MB), Eintrag in der Mediathek vorhanden, Statustexte in DE/EN/ES geprüft.
- Video-Enhance Full Production Release: Topaz + ByteDance global live, Kalibrierung vom Preis-Gate getrennt, unbefristete Nachkorrektur später eintreffender Kosten, Admin-Kostenabschluss mit Audit.
- Video-Enhance Härtung (06.09.): Upscale-Gate (kein Downscale/No-op, auch im Preis-Preview), Hochkant-4K nur über ByteDance, Scene nach Herkunft (aigc/ugc/common), beidseitige Output-Prüfung (0.98), Codec/Container/FPS/Dauer getrennt gespeichert, keine Rekodierung (Regressionstest), Reconciler alle 5 min mit terminalem Abschluss deterministischer Output-Verdikte + Horizon → manual_review, Anzeige vor/während/nach dem Lauf. Server-Codes lesen sich in EN/DE/ES als Sätze (gemeinsames Modul `engineErrors`), beide Oberflächen (AI Video Studio + Director's Cut) zeigen Quelle→Ziel, Engine-Routing, Status und gelieferte Messwerte; Materialart-Labels folgen der UI-Sprache.

## Follow-ups
- Watchdog-Intervall prüfen: aktuell 1-Minuten-Cron als Recovery; auf 2–5 Minuten anheben, sobald der Self-scheduling-Poller in Produktion stabil läuft.
- Observability erweitern/erhalten: Provider-Zeit, Persistenz-Verzögerung, Persistenz-Dauer, Retries, Queue-Wartezeit, Manual-Review-Rate.
- Concurrency-Limits: "10–15 parallele Provider-Jobs" ist eine operative Schätzung, kein vollständig load-getestetes hartes Limit. Vor breiterem Launch validieren und anheben.
- Topaz-Validierungsphase (abgeschlossen fuer Apollo 4K via v3; Restpunkt: 2K/30 ohne Interpolation, rundungsbedingt) (v1/v2-Historie, nur Testkonten): 9 echte Läufe erfasst. Auswertung über `video_enhance_topaz_drift_samples` / `video_enhance_topaz_drift_groups`. Offen: Apollo 4K überschätzt systematisch (~-41 % / -44 % / -41 %, auch mit Master-Encoder) — vor Vollfreigabe gezielt korrigieren; Kleinstjobs (<= 3 Credits) zeigen rundungsbedingte Ausreißer. Keine Vollfreigabe, bis Apollo-4K-Gruppe innerhalb ±15 % liegt.

## Bereit
- Video Enhance: Live-Nachweis der Härtung mit dem QA-Konto (1 Estimate-Ablehnung 1080p→1080p, 1 Hochkant-4K-Routing-Estimate; keine Provider-Läufe nötig)

## Stripe-Umzug auf AdTool AI
- [x] Alle Preis-IDs im Code auf das AdTool-AI-Konto umgestellt (Abo + 4 Credit-Pakete), GBP als dritte Zahlungswährung im Katalog ergänzt, Abopreis 14,95
- [x] Geheimer Live-Schlüssel des AdTool-AI-Kontos hinterlegt (Konto acct_1SLqO0DRu4kfSFxj bestätigt)
- [x] Webhook-Schlüssel hinterlegt, Ziel `stripe-webhook` im AdTool-AI-Konto aktiv
- [x] Webhook liefert bei ungültiger Signatur 400 (live geprüft)
- [x] Totes Ziel `billing-update` im AdTool-AI-Konto abgeschaltet
- [ ] Altes Konto caption-cloud-magic: Webhook-Ziel abschalten, Probe-Abos beenden
- [ ] GBP in der Preisanzeige/Währungswahl sichtbar machen (aktuell nur im Zahlungskatalog hinterlegt)
- [ ] Testkauf je Währung nach Freigabe

## In Progress
- Stripe-Umzug auf AdTool AI abschließen (siehe offene Punkte oben).
