# Roadmap

## Erledigt
- Video-Hochskalierung Persistenz-Härtung (07.09.): kein Laden ganzer Dateien in den Speicher mehr (fortsetzbarer Chunk-Transfer mit Zeitbudget), Anbieter-Erfolg und Dateisicherung sind getrennte Zustände, genau ein schwerer Sicherungsvorgang je Durchlauf über atomaren Anspruch/Lease, erschöpfte Versuche gehen in Prüfung statt in stille Erstattung, Aufträge gehören dem Backend (Fortsetzen nach Neuladen über `open_run`), Hochskalierungen erscheinen im Verlauf, Statustexte in DE/EN/ES.
- Abnahme "Auftrag verschwindet beim Neuladen" (07.09., Vorfall geschlossen): echter Lauf `af25429b` (bytedance-vcube, 0,23 €) über 12 vollständige Neuladevorgänge beobachtet — "An die Engine übergeben" und "Datei wird gesichert" kamen jedes Mal zurück, nach Tab-Schließen/Neu-Login im Verlauf sichtbar, Ergebnis abspielbar/ladbar (HTTP 200, 14,9 MB), Eintrag in der Mediathek vorhanden, Statustexte in DE/EN/ES geprüft.
- Video-Enhance Full Production Release: Topaz + ByteDance global live, Kalibrierung vom Preis-Gate getrennt, unbefristete Nachkorrektur später eintreffender Kosten, Admin-Kostenabschluss mit Audit.
- Video-Enhance Härtung (06.09.): Upscale-Gate (kein Downscale/No-op, auch im Preis-Preview), Hochkant-4K nur über ByteDance, Scene nach Herkunft (aigc/ugc/common), beidseitige Output-Prüfung (0.98), Codec/Container/FPS/Dauer getrennt gespeichert, keine Rekodierung (Regressionstest), Reconciler alle 5 min mit terminalem Abschluss deterministischer Output-Verdikte + Horizon → manual_review, Anzeige vor/während/nach dem Lauf. Server-Codes lesen sich in EN/DE/ES als Sätze (gemeinsames Modul `engineErrors`), beide Oberflächen (AI Video Studio + Director's Cut) zeigen Quelle→Ziel, Engine-Routing, Status und gelieferte Messwerte; Materialart-Labels folgen der UI-Sprache.

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
- Video Enhance Freigabe-Run mit echten Provider-Läufen (Topaz vs. ByteDance vCube)
  - Account: bestofproducts4u@gmail.com (8948d3d9-2c5e-4405-9e9c-1624448e7189)
  - Quellen A/B/C im eigenen Speicher bestätigen
  - Topaz T1–T5 und ByteDance B1–B7 ausführen
  - Abnahmebericht nach den vier verbindlichen Regeln erstellen
  - VIDEO_ENHANCE_TEST_USER_IDS = 8948d3d9-2c5e-4405-9e9c-1624448e7189 (Secret erhalten, nicht löschen)
  - Serverseitige Allowlist-Verifikation (Testkonto erlaubt, andere blockiert, Parsing, Topaz + ByteDance)

- Abnahmeläufe (Topaz, ByteDance, Negativtest) ausschließlich mit bestofproducts4u@gmail.com fahren

- Nicht-Allowlist-Nachweis (offen)
  - VIDEO_ENHANCE_TEST_USER_IDS bleibt bestehen, Wert = genau 8948d3d9-2c5e-4405-9e9c-1624448e7189 (bestofproducts4u@gmail.com, internes QA-Konto, dokumentiert)
  - Allowlist NUR für kontrollierte Testfunktionen (Fail-once-Persistenz); regulärer Modellzugang haengt an den globalen Backend-Flags
  - yaxac88729@watchyio.com (ee1f91c5-b61d-4188-8e95-da419e376c59) darf NIE in der Allowlist stehen
  - Minimale Topaz- und ByteDance-Produktionsläufe mit yaxac88729@watchyio.com
