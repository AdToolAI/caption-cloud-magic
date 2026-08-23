# Warum die Szene erst bei 6/6 fehlschlägt

## Befund aus der Live-Datenbank (Szene `be60d106…`, Run `77aa11e4…`, Gen 6)

Die 6 „Clips" im Fortschrittsbalken sind **nicht** 6 Video-Clips, sondern die 6 Lip-Sync-Pässe (ein Pass pro Sprech-Turn). Die Platte selbst ist fertig (`clip_status = ready`). Erst die Lip-Sync-Stufe kippt:

- Alle 6 Pässe stehen auf `status=failed`, `error=sync_noop_unrecoverable`.
- Webhook-Logs: Pass 5 `delta_mean = -6.32`, Pass 4 `-1.02`, Pass 1 `-3.04` gegen `noop_threshold = 3.68` → Verdikt `noop`. Pass 0 lag mit `5.23` im Unentschieden-Band (`indeterminate`) und wurde trotzdem als `failed` (`reason=attempt_superseded`) geschrieben.
- Die Noop-Leiter bricht nach `step=1` ab („NOOP-LADDER-EXHAUSTED"), danach Szene = failed, Credits wurden refundiert.
- `preclip_face_share = 0` bei allen betrachteten Pässen, obwohl Preclip, Geometrie-Bijektion (`fa4-geometry-bijection`) und Clip-Space-Bbox gesetzt sind und der Dispatch als `input_space=clip`, `asd_mode=bounding_boxes_inline`, `preclip_used=true` läuft.

Der Fehlschlag ist **kein** Platten-, Prompt- oder Grid-Problem (V453/V454-Themen traten hier nicht auf) — er liegt in der Lip-Sync-Bewertung bzw. in dem, was der Provider auf dem Preclip liefert.

## Drei Hypothesen — alle unbestätigt, keine wird vorab bevorzugt behandelt

1. **Echter Provider-Noop**: Sync-3 findet im Preclip kein verwertbar frontales Gesicht (3/4-Profil, laufende Figuren) und gibt das Eingangsvideo unverändert zurück.
2. **Falsch kalibrierte absolute Schwellen**: Die Werte 3.68 / 15.4 stammen aus ruhigen Platten und passen nicht auf bewegte Figuren.
3. **ROI-/Registrierungsfehler bei bewegter Person** (aktuell die plausibelste): Wandert oder dreht sich die Figur zwischen den Sample-Frames, misst das feste Mund-Band trotz nominell korrekter Clip-Space-Bbox nicht dieselbe physische Mundregion. Stark negative `delta_mean` (−6.32, −3.04) sprechen gegen einen echten Noop — bei identischem Input/Output wären Werte nahe null zu erwarten. Negativ heißt: der Preclip hatte in der gemessenen Region *mehr* Eigenbewegung als das Provider-Resultat.

Kombinationen sind ausdrücklich möglich (schwaches 3/4-Gesicht **und** bewegungsblinde Metrik).

## Gate 1 — Read-only Diagnose (keine Codeänderung, kein Dispatch, kein Rerender)

### Fixtures: drei Pässe aus den eingefrorenen Artefakten (`_v434_preclip_pin` + Provider-Output)
- **Pass 5** (`delta_mean = -6.32`) — stärkster negativer Kandidat, klar als noop klassifiziert.
- **Pass 1** (`-3.04`) — Boundary-Fall knapp außerhalb der Noop-Grenze.
- **Pass 0** (`5.23`) — `indeterminate`, prüft v443-Semantik und `attempt_superseded`.

### Vier identische Auswertungen pro Pass
| Prüfung | Beantwortet |
| --- | --- |
| Preclip/Provider Frame-Paare visuell nebeneinander | Hat sich der Mund sichtbar verändert? |
| Face-Detection frameweise auf dem Preclip | Bedeutet `face_share = 0` wirklich „kein Gesicht erkannt"? |
| Mund-ROI mit Face-/Landmark-Tracking statt fixem Band | Misst das feste Band überhaupt noch denselben Mund? |
| Kontrollregion + globale/Torso-Motion | Wie viel Differenz stammt allein aus Körper-/Kamerabewegung? |

Entscheidender Vergleich: **Mundänderung relativ zur lokalen Kopf-/Gesichtsbewegung**, nicht Output-Mundbewegung minus Input-Mundbewegung in fixer Bildregion.

### Separater Prüfpunkt A — `preclip_face_share = 0`
Vor allem anderen aufklären, welcher der beiden Fälle vorliegt:
- **A**: Detector lief und lieferte tatsächlich 0 → das Preclip-Eligibility-Gate ist zu schwach, weil trotzdem mit `preclip_used=true` an Sync-3 dispatcht wird.
- **B**: Gesicht wurde erkannt, der Wert wird nur nicht korrekt berechnet/persistiert → eine Telemetrie-Lücke; ein Fix an der Preclip-Auswahl auf Basis dieses DB-Werts wäre gefährlich.

Bis das geklärt ist, wird **keine** `face_share`-Grenze verändert.

### Separater Prüfpunkt B — `attempt_superseded` vs. Pass-Terminalisierung
Prüfen: Attempt-Status vs. terminaler Pass-Status vs. Szenen-Aggregation. Unproblematisch, wenn nur der einzelne Attempt als superseded archiviert wurde und ein Nachfolge-Attempt seine Stelle übernahm. Wird der Pass dadurch aber selbst terminal `failed` und geht dieses Failure in die 6/6-Aggregation ein, obwohl das Motion-Verdikt nur `indeterminate` war, ist das eine zweite, von der Motion-Messung unabhängige Logikverletzung gegen die v443-Regel.

### Gate-1-Exit
Gate 1 wird erst geschlossen, wenn für mindestens einen eindeutig als noop klassifizierten Pass wahrheitsgemäß einer dieser Sätze gilt:
- „Provider-Output zeigt visuell keine zusätzliche Lippenbewegung, Face-Tracking bestätigt stabile ROI-Zuordnung." — oder
- „Provider-Output zeigt echte Lippenbewegung; der V434-Classifier verwirft sie aufgrund von Preclip-/Kopf-Eigenbewegung bzw. ROI-Drift."

## Gate 2 — Gezielter Fix (erst nach Gate-1-Exit, Richtung abhängig vom Befund)

- **Kein** erster Griff zur Neukalibrierung von 3.6827 / 15.4057 — das wäre nur eine neue Kalibrierung für genau diese Bewegungsart.
- **Strukturell statt Schwellen**: `provider mouth motion` minus `expected motion from local head/face movement`, bzw. eine normalisierte Relation zwischen Mund-ROI und stabiler lokaler Referenzregion; ROI bewegungskompensiert mitführen. V434 bleibt damit für statische Fälle als Regression gültig, bewegte Figuren bekommen echte Motion-Kompensation.
- **`indeterminate` behält seine Semantik**: kein Beweis für Motion ≠ Beweis für Noop → nicht-terminales `motion_unverified` statt sofortigem `failed`.
- **Fall echter Noop** (nur wenn Gate 1 ihn beweist): Preclip-Eligibility härten — Fenster mit real detektiertem, ausreichend großem Gesicht wählen, sonst Pass sofort mit klarer Ursache abbrechen statt zweimal blind zu dispatchen.
- **UI-Text**: Fehlermeldung nennt die tatsächliche Ursache; aktuell steht dort pauschal „bitte Platte neu rendern", obwohl die Platte in Ordnung ist.

## Nicht Teil des Plans
Kein Frontend-Publish, kein Remotion-Deploy, kein neuer Provider-Dispatch, keine neue Szene, keine Schwellenänderung und keine DB-Migration in Gate 1. Rerender erst nach dem Fix in Gate 2.

## Technische Details
- Betroffene Dateien (Gate 2, je nach Befund): `supabase/functions/_shared/measure-provider-motion-sync.ts`, `supabase/functions/_shared/motion-probe-classifier.ts`, `supabase/functions/_shared/v434-motion-roi.ts`, `supabase/functions/sync-so-webhook/index.ts` (Verdikt-Anwendung / Noop-Leiter), `supabase/functions/compose-dialog-segments/index.ts` (Preclip-/Face-Share-Gate).
- Schwellen aktuell: `NOOP_THRESHOLD = 3.6827`, `MOTION_THRESHOLD = 15.4057` (Kalibrierung V434).
- Gate 1 nutzt ausschließlich die eingefrorenen Artefakt-Pins als Fixtures; sie bleiben unverändert und dienen später als Regressionsgrundlage neben den bestehenden V434/V443-Suites.
