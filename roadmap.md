# Roadmap

## Erledigt
- Video-Enhance Full Production Release: Topaz + ByteDance global live, Kalibrierung vom Preis-Gate getrennt, unbefristete Nachkorrektur später eintreffender Kosten, Admin-Kostenabschluss mit Audit.
- Video-Enhance Härtung (06.09.): Upscale-Gate (kein Downscale/No-op, auch im Preis-Preview), Hochkant-4K nur über ByteDance, Scene nach Herkunft (aigc/ugc/common), beidseitige Output-Prüfung (0.98), Codec/Container/FPS/Dauer getrennt gespeichert, keine Rekodierung (Regressionstest), Reconciler alle 5 min mit terminalem Abschluss deterministischer Output-Verdikte + Horizon → manual_review, Anzeige vor/während/nach dem Lauf.

## Bereit
- Video Enhance: Live-Nachweis der Härtung mit dem QA-Konto (1 Estimate-Ablehnung 1080p→1080p, 1 Hochkant-4K-Routing-Estimate; keine Provider-Läufe nötig)
- Video Enhance: einheitliche Fehlertexte EN/DE/ES für Server-Codes `VIDEO_ENHANCE_NOT_AN_UPSCALE` / `TARGET_FRAME_UNREACHABLE` im Panel (derzeit englische Server-Nachricht)

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
