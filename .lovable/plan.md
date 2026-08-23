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

## Umsetzung (eng begrenzt, zwei Dateien plus Tests)

### 1. Signierten Mundversatz persistieren

- `compute-mouth-centered-crop.ts` gibt zusätzlich `mouthOffsetXy: { x, y }` zurück
  (Mundpunkt minus Crop-Mittelpunkt, in Plate-Pixeln, mit Vorzeichen). Der
  bestehende Skalar `mouthOffsetPx` bleibt unverändert. Node-Zwilling
  `src/lib/composer/computeMouthCenteredCrop.ts` wird 1:1 mitgezogen.
- Fällt der Anker auf `face_center` zurück (kein Mund-Landmark), wird
  `mouthOffsetXy = null` gesetzt — kein geratener Vektor.
- `pass-face-preclip.ts` reicht den Wert durch; `compose-dialog-segments`
  schreibt ihn als `preclip_mouth_offset_xy` neben `preclip_mouth_offset_px` in den Pass.

### 2. `mouth_roi_unresolved` bleibt nicht-terminal

- Im Webhook wird die Durchlassbedingung um den ROI-Fall erweitert:
  Durchlass, wenn `v443MotionUnverified` **und**
  (`probe_infra_error` **oder** `isMouthRoiUnresolved(reason)`).
- Die Telemetrie unterscheidet weiterhin sauber:
  `failure_class = mouth_roi_unresolved` vs. `probe_infra_error`.
- Bedeutung: Ein Pass mit unauflösbarer ROI wird als `motion_unverified`
  durchgereicht — kein Fail, keine Rückerstattung, kein neuer Provider-Job. Der
  Clip wird gemuxt, die Kachel bleibt grün.
- **Keine Aufweichung echter Verdikte:** `noop` und `static` terminalisieren
  unverändert; nur das Nicht-Verdikt „nicht messbar" verliert seine tödliche Wirkung.

### 3. Watchdog

`lipsync-watchdog` misst `motion_unverified` weiterhin genau einmal nach. Da die
Geometrie sich durch Nachmessen nicht ändert, wird der ROI-Fall dort explizit
übersprungen statt sinnlos wiederholt — er bleibt `motion_unverified` und
blockiert nichts.

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
