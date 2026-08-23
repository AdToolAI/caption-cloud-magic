# Warum die Szene erst bei 6/6 fehlschlägt

## Befund aus der Live-Datenbank (Szene `be60d106…`, Run `77aa11e4…`, Gen 6)

Die 6 „Clips" im Fortschrittsbalken sind **nicht** 6 Video-Clips, sondern die 6 Lip-Sync-Pässe (ein Pass pro Sprech-Turn). Die Platte selbst ist fertig (`clip_status = ready`). Erst die Lip-Sync-Stufe kippt:

- Alle 6 Pässe stehen auf `status=failed`, `error=sync_noop_unrecoverable`.
- Webhook-Logs: Pass 5 `delta_mean = -6.32`, Pass 4 `-1.02`, Pass 1 `-3.04` gegen `noop_threshold = 3.68` → Verdikt `noop`. Pass 0 lag mit `5.23` im Unentschieden-Band (`indeterminate`) und wurde trotzdem als `failed` (`reason=attempt_superseded`) geschrieben.
- Die Noop-Leiter bricht nach `step=1` ab („NOOP-LADDER-EXHAUSTED"), danach Szene = failed, Credits wurden refundiert (`refunded: true`).
- Auffällig in den Pass-Daten: `preclip_face_share = 0` bei allen betrachteten Pässen, obwohl Preclip, Geometrie-Bijektion (`fa4-geometry-bijection`) und Clip-Space-Bbox sauber gesetzt sind und der Dispatch korrekt als `input_space=clip`, `asd_mode=bounding_boxes_inline`, `preclip_used=true` läuft.

Der Fehlschlag ist also **kein** Platten-, Prompt- oder Grid-Problem mehr (die V453/V454-Themen sind hier nicht aufgetreten) — er liegt in der Lip-Sync-Bewertung bzw. in dem, was der Provider auf dem Preclip liefert.

Zwei Ursachen kommen infrage, **beide noch unbestätigt**:

1. **Echter Provider-Noop**: In dieser Testszene bewegen sich die Figuren und stehen im 3/4-Profil. Findet Sync-3 im Preclip kein sauber frontales Gesicht (dazu passt `preclip_face_share = 0`), gibt es das Eingangsvideo praktisch unverändert zurück → kein Lip-Sync.
2. **Messfehler**: Die Motion-Messung vergleicht Preclip vs. Provider-Ausgabe in einem festen Mund-Band. Bei laufenden Figuren enthält schon der Preclip viel Eigenbewegung, die Differenz wird klein oder negativ (die gemessenen `delta_mean` sind negativ) → die auf ruhigen Platten kalibrierten Schwellen (3.68 / 15.4) stufen echte Bewegung fälschlich als „noop" ein.

## Vorgeschlagenes Vorgehen

### Gate 1 — Read-only Diagnose (keine Codeänderung, kein Rerender)
Für 2–3 der 6 Pässe die eingefrorenen Artefakte (`_v434_preclip_pin`, Provider-Ausgabe) direkt auswerten:
- Frames aus Preclip und Provider-Ausgabe ziehen und visuell nebeneinanderlegen: bewegt sich der Mund in der Ausgabe oder nicht?
- Face-Detection auf dem Preclip nachfahren und klären, warum `preclip_face_share = 0` ist (Detektor findet nichts vs. Wert wird nur nicht persistiert).
- Preclip-Eigenbewegung außerhalb des Mund-Bands messen, um Ursache 1 von Ursache 2 zu trennen.

Ergebnis: eindeutige Zuordnung „Provider liefert nichts" vs. „Messung urteilt falsch".

### Gate 2 — Gezielter Fix (abhängig vom Diagnose-Ergebnis)
- **Fall Messfehler**: bewegungsnormalisierte Bewertung — Mund-Band gegen eine bewegungsfreie Referenzregion desselben Preclips normieren, statt gegen absolute Schwellen; `indeterminate` gemäß der v443-Regel als nicht-terminales `motion_unverified` weiterlaufen lassen statt sofort auf `failed` zu setzen.
- **Fall echter Noop**: Preclip-Wahl härten — Fenster mit tatsächlich detektiertem, ausreichend großem Gesicht wählen (`face_share`-Floor real durchsetzen statt mit 0 zu dispatchen), sonst den Pass sofort mit klarer, verständlicher Ursache abbrechen, statt zweimal blind an den Provider zu schicken.
- In beiden Fällen: Fehlermeldung im UI so formulieren, dass sie die tatsächliche Ursache nennt (aktuell steht dort pauschal „bitte Platte neu rendern", obwohl die Platte in Ordnung ist).

### Nicht Teil des Plans
Kein Frontend-Publish, kein Remotion-Deploy, kein neuer Provider-Dispatch und keine DB-Migration in Gate 1. Rerender der Szene erst nach dem Fix in Gate 2.

## Technische Details
- Betroffene Dateien (Gate 2, je nach Befund): `supabase/functions/_shared/measure-provider-motion-sync.ts`, `supabase/functions/_shared/motion-probe-classifier.ts`, `supabase/functions/sync-so-webhook/index.ts` (Verdikt-Anwendung / Noop-Leiter), `supabase/functions/compose-dialog-segments/index.ts` (Preclip-/Face-Share-Gate).
- Schwellen aktuell: `NOOP_THRESHOLD = 3.6827`, `MOTION_THRESHOLD = 15.4057` (Kalibrierung V434).
- Regressionstests kommen zu den bestehenden V434/V443-Suites hinzu; die eingefrorenen Artefakt-Pins bleiben unverändert und dienen als Testfixture.
