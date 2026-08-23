# V458 — Mouth-ROI-Vektor persistieren + `mouth_roi_unresolved` nicht mehr terminalisieren

## Belegter Befund (Szene `be60d106…`, Run `c03ef959…`, 16:14–16:23 UTC)

Der Lauf ist technisch bis 6/6 durchgelaufen. Alle sechs Pässe wurden danach mit
demselben Grund verworfen:

```text
server_motion_measure  status=unmeasurable  verdict=indeterminate
reason = mouth_roi_unresolved:mouth_offset_direction_unknown
v403/g322 … INDETERMINATE → ssw:failed
```

V457 hat sauber gearbeitet: `v457_contains_target = true`, `contain_reason = projected`,
Shift −6…−8 px, keine Vergrößerung, Face-Share 0.24–0.30. Der Abbruch liegt also
**nach** dem Provider, in der Messung.

Zwei bestätigte Ursachen:

1. **Der Richtungsvektor des Mundes wird nie gespeichert.** Der V456-Vertrag liest
   `preclip_mouth_offset_xy`. Diese Eigenschaft wird an keiner Stelle im Code
   geschrieben — persistiert wird ausschließlich der vorzeichenlose Skalar
   `preclip_mouth_offset_px`. Damit ist der Vertrag für **jede** Szene
   strukturell unerfüllbar, nicht nur für diese.
2. **Der Nicht-Terminalisierungs-Pfad greift nicht.** Der Webhook berechnet zwar
   `v443MotionUnverified = true` für `mouth_roi_unresolved`, verlangt für den
   Durchlass zusätzlich aber `classifyMeasurementFailure(...) === "probe_infra_error"`.
   `mouth_roi_unresolved` steht bewusst in der Nicht-Infra-Liste und liefert
   `measured_ambiguous` — die beiden Regeln widersprechen sich, der Pass fällt in
   den Fail-Closed-Zweig. Der bestehende Test prüft nur `isMouthRoiUnresolved`,
   nicht diesen Zweig, deshalb blieb es unentdeckt.

## Umsetzung (Scope: Shared-Producer + Node-Spiegel, `pass-face-preclip`, Composer-Persistenz, Webhook, Watchdog, Tests)

### 1. Signierten Mundversatz aus der FINALEN V457-Geometrie ableiten

- `compute-mouth-centered-crop.ts` liefert zusätzlich `mouthOffsetXy: { x, y }`.
  Berechnet wird der Vektor **erst nach** `projectCropToContain`, nach der
  Integer-Rundung und nach dem finalen Clamp:

  ```text
  finalCropCenter = { x: crop.x + crop.size/2, y: crop.y + crop.size/2 }
  mouthOffsetXy   = { x: mouth.x - finalCropCenter.x, y: mouth.y - finalCropCenter.y }
  ```

- Der Skalar `mouthOffsetPx` wird auf dieselbe finale Geometrie umgestellt, damit
  `mouthOffsetPx === round(hypot(mouthOffsetXy.x, mouthOffsetXy.y))` gilt. Feld und
  Semantik bleiben, nur die Bezugsgeometrie wird kohärent (bisher vor der
  V457-Projektion berechnet — genau die −6…−8 px Differenz).
- Anchor-Provenienz entscheidet: echter **oder** pose-geschätzter Mund-Anker ⇒
  signierter Vektor; `face_center`-Fallback ⇒ `mouthOffsetXy = null`, damit
  `mouth_offset_direction_unknown` ein ehrlicher Vertragsfehler bleibt.
- Node-Zwilling `src/lib/composer/computeMouthCenteredCrop.ts` 1:1 mitziehen.
- `pass-face-preclip.ts` reicht den Wert durch; `compose-dialog-segments` schreibt
  ihn als `preclip_mouth_offset_xy` in das **JSONB-Feld** `dialog_shots.passes[i]` —
  dieselbe Ablage, aus der der V456-Vertrag heute schon liest. Keine Migration.

### 2. `mouth_roi_unresolved` bleibt nicht-terminal — eng begrenzt

- Durchlass nur im Pfad `measurement_status = unmeasurable` **und**
  `verdict = indeterminate`, dann:
  `v443MotionUnverified && (failureClass === "probe_infra_error" || isMouthRoiUnresolved(reason))`.
- Priorität unverändert: echtes `noop`/`static` terminalisiert **immer** zuerst.
  Ein `noop`-Verdict, dessen Reason zufällig `mouth_roi_unresolved` enthält, darf
  nie zu `motion_unverified` werden — die NOOP-Ladder wird nicht aufgeweicht.
- Gewöhnliches `measured_ambiguous` (Grauzone, unbrauchbare Metrik) bleibt
  fail-closed wie heute.
- Telemetrie trennt weiterhin `failure_class = mouth_roi_unresolved` vs.
  `probe_infra_error`.

### 3. Watchdog

`lipsync-watchdog` misst `motion_unverified` bei echten `probe_infra_error`-Fällen
weiterhin genau einmal nach. Für `mouth_roi_unresolved` wird die Nachmessung
übersprungen — dieselbe Geometrie liefert kein neues Ergebnis. Status bleibt
`motion_unverified`, kein Retry, keine Blockade.


## Tests

- `v456-roi-contract.test.ts`: neuer Fall — vollständige Geometrie **inklusive**
  `mouthOffsetXy` ⇒ Status `resolved`; fehlender Vektor ⇒ `mouth_offset_direction_unknown`.
- Neuer Webhook-Vertragstest: `indeterminate` + `mouth_roi_unresolved` führt
  **nicht** zu `ssw:noop_fail`; `indeterminate` + `measured_ambiguous` (Grauzone)
  führt weiterhin zu `ssw:noop_fail`.
- Crop-Test: `mouthOffsetXy` entspricht exakt Mundpunkt − Crop-Mittelpunkt, bei
  `face_center`-Anker `null`. Bestehende V457-Tests bleiben unverändert grün.

## Nicht Teil dieses Gates

- Keine Änderung an Thresholds, Sync.so-Payload, NOOP-Ladder, V457-Geometrie.
- Keine Migration, kein automatischer Rerender.
- Deploy-Scope: `compose-dialog-segments`, `sync-so-webhook`, `lipsync-watchdog`.
  Danach STOP — erst Health prüfen, dann auf Ansage genau ein S01-Testlauf.

## Zur Bildwirkung („man sieht nicht viel")

Das ist eine getrennte Frage von Framing und Prompt (Totale, Nebentätigkeiten,
Kameradistanz) und kein Pipeline-Fehler. Ich fasse sie bewusst nicht in dieses
Gate; sag Bescheid, wenn ich sie als eigenen Schritt aufsetzen soll.
