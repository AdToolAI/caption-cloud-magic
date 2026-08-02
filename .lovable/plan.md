## Ziel

Die Lip-Sync-Kette bleibt auf dem Stand vom **27.07.2026 (v283)**. Es wird kein weiterer Code zurückgebaut. Diese Umsetzung fixiert und dokumentiert diesen Zustand und verifiziert ihn an einem echten Lauf.

## Ausgangslage (verifiziert)

- Der Rollback hat die Lip-Sync-Kette auf Commit `58060cffe` (27.07.2026) gesetzt. Die Versionskonstante dort lautet `v283-face-gate-partial-identity-soft-pass`.
- Der v169-Rebuild-Guide beschreibt einen älteren Stand (Codekonstante `v169` zuletzt am 05.07.2026). Er ist damit **nicht** die Beschreibung des aktuellen Zustands.
- Übereinstimmend mit dem Guide: Retry-Ladder (7 Varianten), `sync_mode: cut_off`, `auto_detect` bei N≥2 blockiert, Per-Pass-Lock, Preclip-Prefanout, Webhook + Watchdog.
- Abweichend vom Guide: `SYNCSO_DEFAULT_MAX_PARALLEL = 3` (statt 5), Slot-RPC heißt `update_dialog_pass_slot`, Anchor-Bridge ist die v183-Variante, zusätzlich aktiv sind Face-Gate (v283), Rekognition-Anchor-Lock (v277), Hungarian-Plate-Router (v278), Preclip-Pflicht (v204), Identity-Trust-Gate (v189), Motion-Gate (v231), Mouth-Anchor (v247/v280).

## Umsetzung

1. **Versions-Marker eindeutig machen**
   `COMPOSE_DIALOG_SEGMENTS_VERSION` auf `v283-baseline-27-07-rollback` setzen, damit in den Logs sofort erkennbar ist, dass der Rollback-Stand läuft und nicht ein späterer Patch. Reine Log-Kennzeichnung, keine Verhaltensänderung.

2. **Projektgedächtnis korrigieren**
   Der Rollback-Eintrag hält aktuell nur „Stand 27.07." fest. Ergänzt wird: Baseline = **v283**, ausdrücklich **nicht** v169; der v169-Guide ist historisch und darf nicht als Soll-Zustand herangezogen werden. Dazu die Liste der im Baseline aktiven Gates, damit künftige Fehlersuche direkt weiß, welche Abbruchgründe systembedingt möglich sind.

3. **Referenz-Dokument im Repo**
   `docs/lipsync-baseline-v283.md` mit der oben verifizierten Abweichungstabelle v169-Guide ↔ v283-Baseline, den aktiven Gates und ihren typischen Fehlercodes (`preclip_required`, `face_gate_*`, `passthrough`). Dient als Nachschlagewerk beim nächsten Fehlerbild statt erneuter Code-Archäologie.

4. **Verifikation am echten Lauf**
   Nach einer von dir gestarteten Dialogszene: Auswertung der Edge-Function-Logs von `compose-dialog-segments`, `sync-so-webhook` und `lipsync-watchdog` sowie der Tabellen `syncso_dispatch_log`, `syncso_inflight_jobs` und `composer_state_guard_violations`. Ergebnis ist ein Befund, an welchem T-Schritt der Baseline-Stand steht — ohne Code-Änderung.

## Was bewusst nicht passiert

- Kein weiterer Rückbau auf v169.
- Keine Entschärfung von Face-Gate, Preclip-Pflicht oder Face-Size-Floors — die bleiben so, wie sie am 27.07. waren.
- Keine Änderung an Voice Library, Autopilot, Music Studio, Landing Page, Stripe, Cast & World.

## Technische Details

- Betroffene Dateien: `supabase/functions/compose-dialog-segments/index.ts` (eine Zeile: Versionskonstante), neu `docs/lipsync-baseline-v283.md`, Aktualisierung von `mem://architecture/lipsync/v398-surgical-rollback-27-07`.
- Deployment: erneutes Deployment von `compose-dialog-segments` wegen der Versionskonstante.
- Keine Datenbank-Migration. Die v398-Anpassung an Bridge und Guard bleibt unverändert bestehen, da die Baseline-Kette über die Legacy-Spalten steuert.
