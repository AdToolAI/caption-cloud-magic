# V542 — 2-Sprecher Golden-Core Preclip Recovery

## Bestätigter Befund dieses Laufs

Szene `7aa7fc93…`, Run `ffcb59ed…`, Plate-Generation 6 hatte **4 Dialog-Turns von 2 Sprechern**. Anker und Identitätszuordnung waren vollständig (`2/2`, Assignment-Lock vorhanden).

- Turn/Clip 1 erreichte Sync.so und wurde dort erfolgreich verarbeitet.
- Ein späterer Sarah-Turn wurde **vor** Sync.so durch `v536_mouth_crop_infeasible` gestoppt. Der berechnete Konflikt betrug nur rund **2,24 px** (`288,74 > 286,50`), bei als nicht bewegt klassifiziertem Kamerapfad.
- Der zweite Sarah-Turn wurde **vor** Sync.so gestoppt, weil alle sechs Track-Samples als `scale_incoherent` verworfen wurden (`no_coherent_track_samples`).
- Danach terminalisierte die Szene über `v187_preclip_required_no_fullplate_fallback`; die 3,00 € wurden idempotent erstattet.
- Das UI zeigte deshalb korrekt nur `1/4`: Es gab genau einen real gestarteten Provider-Pass. V541 war nicht der Auslöser; der Lauf starb vor dessen Motion-Wahrheitsprüfung.

## Ein Gate

Für die **2-Sprecher-Kohorte** wird der gemessene Golden-Core als begrenzter Recovery-Pfad wiederhergestellt:

1. Der dynamische Track bleibt der erste Versuch und seine Diagnostik bleibt vollständig erhalten.
2. Wenn ausschließlich
   - `dynamic_mouth_crop_infeasible` oder `no_coherent_track_samples` vorliegt,
   - der Anker-Assignment-Lock für beide Sprecher vollständig ist,
   - der bestehende statische Face-Center-Crop den unveränderten V461-Face-/Containment-Vertrag besteht,
   - und genau zwei Sprecher vorliegen,
   dann wird derselbe Turn mit diesem statischen, assignment-locked Golden-Core-Crop gerendert.
3. Kein Full-Plate-Fallback: Sync.so erhält weiterhin ausschließlich einen isolierten Sprecher-Preclip.
4. Scheitert auch der statische Crop an V461/Containment, bleibt der bestehende Fail-Closed- und Refund-Pfad unverändert.
5. 1-Sprecher- und 3+-Sprecher-Pfade bleiben byte-/verhaltensgleich. V541, V537/FA-4, Provider, Retries, Preise, Refunds, Locks, Webhook und Watchdog werden nicht verändert.

## Technische Umsetzung

- Recovery-Entscheidung als kleine pure Helper-Funktion unter `_shared/`, damit die Zulässigkeit separat und exhaustiv testbar ist.
- Integration ausschließlich im Preclip-Aufbau von `compose-dialog-segments`, unmittelbar nach den beiden bestätigten dynamischen Fehlerklassen und vor `v187`.
- Additive, sanitisierte Observation mit einem eindeutigen Verdict wie `v542_static_golden_core_recovery`; keine Bilder, URLs oder biometrischen Payloads.
- Persistierte Pass-Geometrie kennzeichnet die statische Recovery-Quelle, damit Mux/Reprojektion exakt denselben Crop verwenden und kein dynamischer Pfad vorgetäuscht wird.

## Regressionen

- Reproduktion des aktuellen Runs:
  - 2 Sprecher / 4 Turns,
  - vollständiger Assignment-Lock,
  - V536-Konflikt von ca. 2,24 px → statischer Golden-Core-Crop wird verwendet,
  - sechs `scale_incoherent` Samples → statischer Golden-Core-Crop wird verwendet.
- Keine Recovery bei unvollständigem/mehrdeutigem Identity-Lock.
- Keine Recovery, wenn der statische V461-/Containment-Check scheitert.
- Keine Recovery für 3+ Sprecher.
- Kein Full-Plate-Dispatch.
- Vier kanonische Turn-IDs bleiben vier Pass-IDs; FA-4 bleibt unverändert.
- Refund bleibt genau einmal, wenn auch die Recovery scheitert.
- V541-Tests und eingefrorene Lip-Sync-Vertragstests bleiben grün.

## Verifikation und Freigabe

1. Fokus- und Frozen-Suites sowie Deno-Check ausführen; bestehende Baseline-Fehler getrennt ausweisen.
2. Nur `compose-dialog-segments` deployen; keine Frontend-Veröffentlichung und keine Datenänderung.
3. Genau einen neuen kontrollierten 2-Sprecher-/4-Turn-Lauf manuell starten.
4. Read-only prüfen: vier `sync_segment`-Jobs, keine Preflight-Terminalisierung, V542-Observation nur bei tatsächlicher Recovery, V541-Wahrheitsstatus je abgeschlossenem Pass.
5. Finalen Clip visuell pro Turn prüfen: ausschließlich der aktive Sprecher bewegt den Mund, Stimmen und Gesichter bleiben korrekt.
6. Danach STOP mit PASS/FAIL-Bericht; keine automatische Ausweitung auf 3+ Sprecher.
