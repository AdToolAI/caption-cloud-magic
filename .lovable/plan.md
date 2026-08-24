# Antwort + V502 — Coords-vs-Crop-Bruch (Pass 0)

## Kurzantwort auf die Frage

Face- und Mundtracking laufen — aber nicht nach dem v400-**Dokument**, sondern nach
dem v400-**Golden Run**. Das ist ein wichtiger Unterschied, und er ist belegt:

- **Face-Tracking: ja.** `trackAssignedFaceAcrossTurn` liefert pro Pass echte
  Face-Boxen; V477 leitet daraus einen autoritativen Mund-Anker ab
  (`v477-mouth-authority.ts`, Median über die Samples, `pose_estimate` nur noch
  als Fallback). Der Anker ist im Preclip-Crop verdrahtet.
- **Mund bei 62 % Höhe: nein — und das ist korrekt so.** V500-A hat den Golden Run
  `c934a823` nachgemessen: die Mundhöhe lag dort bei **0.571–0.612**, die Crops
  waren gesichtszentriert, ein 0.62-Framing gab es nie. `MOUTH_TARGET_Y = 0.62`
  existiert nur als tote Deklaration in `dynamic-camera-path.ts`. Die 62 % im
  Spezifikationstext sind eine nachträgliche Erzählung, kein gemessener Ist-Zustand.
- **Kamerapfad: „folgt dem Kopf" nur bei echter Bewegung.** Unterhalb
  `STATIC_TRAVEL_EPSILON = 0.01` fällt der Pfad bewusst auf einen Keyframe zurück.
  Der Golden Run war ebenfalls statisch. Kein Defekt.
- **Outcome-Gate: bewusst nicht v400.** V500-B2 terminalisiert einen NOOP nur noch
  bei nachgewiesenem Passthrough; unklare Fälle laufen als `motion_unverified`
  weiter. Der v400-Text („unknown blockiert") war genau die Regel, die den Golden
  Run selbst als Fehlschlag klassifiziert hätte.

Fazit: Geometrie und Tracking stehen auf Golden-Run-Parität. Offen ist genau ein
gemessener Widerspruch — der ist der Inhalt dieses Gates.

## Der offene Befund

Beim letzten S01-Lauf (`be60d106`) lagen die gespeicherten Dispatch-Coords von
**Pass 0** außerhalb des eigenen Preclip-Crops (x = 177 gegen Crop-Start 203).
Pässe 1–5 lagen sauber innerhalb. Das ist ein Geometrie-Widerspruch zwischen der
Coords-Persistenz und der Crop-Projektion aus V457/V464 — kein Mux- und kein
Provider-Problem. Solange er besteht, bekommt Pass 0 eine ASD-Box, die nicht zu
seinem Bild gehört, und ein NOOP dort ist erwartbar statt aussagekräftig.

## V502-A — Read-only Beweis (kein Codeeingriff)

Für alle 6 Pässe desselben Runs nebeneinanderlegen:

1. Crop-Transform pro Frame (`cropX/cropY/cropSize`, Keyframe-Anzahl, Travel)
2. gespeicherte Dispatch-Coords und die per-Frame-ASD-Boxen aus V464
3. den Face-Track, aus dem beides entstanden ist
4. Mundhöhe im finalen Preclip je Pass

Zielfrage, exakt eine: Entsteht die Abweichung bei Pass 0 dadurch, dass Coords im
Plate-Raum statt im Clip-Raum abgelegt wurden, dass ein anderer Crop-Stand
verwendet wurde, oder dass Track und Crop aus verschiedenen Zeitfenstern stammen.
Ergebnis als `docs/v502-a-coords-crop-differential.md`, mit Zahlen je Pass.

## V502-B — Enger Fix (erst nach A, eigenes GO)

Ein einziger Vertrag: die persistierten Coords eines Passes werden aus demselben
Crop-Transform abgeleitet, der auch den Preclip erzeugt hat, und vor dem Dispatch
gegen die Crop-Grenzen validiert. Verletzung → `preclip_coords_out_of_crop`
fail-closed vor dem Provider-Call, kein stiller Versand. Kein neues Gate, keine
neue Schwelle, keine Änderung an Face-Gate, Verdict oder Camera Path.

## Technische Details

- Lesend: `_shared/compute-mouth-centered-crop.ts`, `_shared/v464-asd-projection.ts`,
  `_shared/pass-face-preclip.ts`, `_shared/dynamic-camera-path.ts`,
  `_shared/v477-mouth-authority.ts`, `dialog_shots` von `be60d106`.
- V502-B berührt ausschließlich die Coords-Ableitung und die Vorab-Validierung
  in `compose-dialog-segments`; Safety Shell (Fencing, Ledger, Refund, Watchdog,
  V500-Gate) bleibt unangetastet.
- Absicherung über Deno-Tests gegen das Golden-Fixture aus `v500-golden-contract.ts`.

## Reihenfolge

V502-A (read-only, STOP mit Bericht) → Freigabe → V502-B → erst danach ein
kontrollierter S01-Canary.
