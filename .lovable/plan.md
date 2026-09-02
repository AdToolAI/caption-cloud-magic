# Änderung 1 — Full-Plate für bewegte Multi-Speaker-Szenen reaktivieren

## Korrektur des aktuellen Zustands

Die gewünschte Änderung wurde **nicht** richtig umgesetzt:

- Aktueller HEAD ist `v544-v400-preclip-authority`.
- Er löscht `_v152BboxPrimary`, `_v153BboxPrimary` und `_v543PlateMeta` vor der Dispatch-Auswahl.
- Der Regressionstest verlangt ausdrücklich, dass `v153UnifiedBboxEligible` nicht existiert und Preclip für jede Sprecherzahl aktiv ist.
- Preclip-Fehler werden fail-closed behandelt; Full-Plate-Fallback ist ausdrücklich verboten.

Hinweis zur Benennung: Der persistierte v400-Golden-Run `c934a823…` verwendete selbst statische Preclips. Full-Plate ist deshalb eine gezielte Korrektur für bewegte Szenen gemäß Gate 0 und Sync.so-Spatial-Tracking — keine wortgetreue Wiederherstellung des gemessenen v400-Payloads.

## Genau ein Umsetzungsgate

1. **Full-Plate als primären Pfad für N≥2 reaktivieren**
   - Den vorhandenen plate-nativen Pfad wieder dispatch-fähig machen.
   - Sync.so erhält das vollständige Plate-Video, `model=sync-3`, `auto_detect=false` und eine plate-native `bounding_boxes_url` pro Sprecher.
   - Boxanzahl, FPS und Framezahl müssen exakt zur vollständigen Plate-Zeitbasis passen.

2. **Preclip nur als klarer Fallback**
   - Preclip bleibt verfügbar, wird aber für einen frischen, gültigen N≥2-Full-Plate-Dispatch nicht mehr vorgezogen.
   - Fallback nur, wenn die Full-Plate-Zeitbasis oder plate-native Sprecherbox vor dem Provider-Call nicht sicher hergestellt werden kann.
   - Kein stiller Wechsel nach einem technisch akzeptierten NOOP; genau ein Pfad pro Versuch.

3. **Unveränderte Sicherheitsverträge**
   - Identity-/Assignment-Lock, kanonische Turn-IDs, Run-/Generation-Fencing, FA-4, V537, Ledger und idempotente Refunds bleiben unverändert.
   - Keine Provider-, Modell-, Preis-, Schwellenwert- oder Mux-Änderung in diesem Gate.

4. **Regressionen an den neuen Vertrag anpassen**
   - N≥2 mit vollständiger Plate-Metadatenlage: `dispatch_video_kind=full_plate`, `input_space=plate`, plate-native Boxen, exakte Plate-FPS/Framezahl.
   - Ungültige Full-Plate-Metadaten: deterministischer Preclip-Fallback vor dem Provider-Call.
   - Keine mundzentrierte Crop-Autorität und kein Camera-Path beeinflussen den Full-Plate-Dispatch.
   - Sprecherzuordnung und Provider-Call-Zahl bleiben unverändert.

## Verifikation und STOP

- Fokustests für Full-Plate-Payload, Zeitbasis, Boxtransport, Identity-Lock, Fencing, Ledger und Fallback ausführen.
- Nur die unmittelbar betroffene Dispatch-Funktion deployen.
- Danach **genau einen kontrollierten 2-Sprecher-Lauf** ausführen und read-only prüfen: Full-Plate wurde versendet, Boxen liegen im plate-nativen Raum, alle Pässe zeigen messbare Mundbewegung und der richtige Sprecher bewegt sich im richtigen Turn.
- Danach STOP mit Befund. Kein 3- oder 4-Sprecher-Lauf und keine Änderung 2–4 ohne separate Freigabe.
