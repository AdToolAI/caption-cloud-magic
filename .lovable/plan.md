# V450 — NOOP-Retry stirbt am V445-Geometrie-Guard

## Was tatsächlich passiert ist (belegt aus der Szene)

Szene `be60d106…` (Projekt V449, Rooftop-Test) steht auf `clip_status = ready`,
`lip_sync_status = failed`, `clip_error = v204_preclip_required`.

Die Kette lief weiter als bisher:

1. Plate ist fertig, alle **vier** Gesichter wurden identitätsscharf zugeordnet
   (`matchSource = gemini-identity`, Confidence 1.0 für Sarah, Kay, Matthew, Samuel).
2. Pass 0 (Sarah) wurde regulär mit Preclip an den Provider geschickt.
3. Das Provider-Ergebnis wurde als **NOOP** gemessen
   (`delta_mean = -63.4` gegen Schwelle 3.68) → automatische NOOP-Eskalation
   auf Variante `coords-pro-box`.
4. Beim Retry hat der Pass **keinen Preclip mehr** (`preclip_url = null`,
   `preclip_crop = null`, aber `preclip_from_bbox` und der V434-Preclip-Pin sind
   noch da) → der v204-Guard verweigert korrekt den Multi-Speaker-Dispatch ohne
   Preclip → Szene terminal fehlgeschlagen.

## Ursache

Zwei Verträge widersprechen sich seit V445:

- **v404/v407 (NOOP-Retry):** Ein NOOP-Retry MUSS exakt denselben Preclip,
  dasselbe Audio und dieselbe Box wiederverwenden ("frozen wire"). Deshalb ist
  das Neu-Rendern eines Preclips bei `noop_auto_escalation` ausdrücklich
  gesperrt (`v161PreclipEligible` endet mit `body?.noop_auto_escalation !== true`).
- **V445 (Geometrie-Kohärenz):** Wenn die Signatur der gecachten Crop-Box nicht
  exakt zur neu gemessenen finalen Plate-Box passt, wird der gecachte Preclip
  verworfen (`preclip_url = null`, `preclip_crop = null`), damit er neu
  gerendert wird.

Beim NOOP-Retry greift V445, wirft den Preclip weg — und das Neu-Rendern ist im
selben Lauf verboten. Ergebnis ist ein garantierter Hard-Fail. Das trifft jede
Mehrsprecher-Szene, die einmal in die NOOP-Eskalation läuft.

## Fix (minimal, exakt zwei Verzweigungen)

In `supabase/functions/compose-dialog-segments/index.ts`:

**1. V445-Cache-Drop beim NOOP-Retry aussetzen.**
Wenn `body.noop_auto_escalation === true`, ist der eingefrorene Wire-Snapshot
die Authority. Verbindlich festgeschrieben: `preclip_url`, `preclip_crop`,
Audio-URL, BBox/Coords sowie Run-/Generation-/Pass-Identität werden beim
NOOP-Retry **weder neu berechnet noch ersetzt**. Eine erkannte
Geometrieabweichung wird ausschliesslich protokolliert
(`v450_noop_retry_geometry_drift_ignored`, mit beiden Box-Signaturen).

**2. Beweisgebundene Recovery, wenn der Preclip bereits fehlt.**
Eine Rekonstruktion aus dem V434-Pin bzw. `_v105_probe.payload_video_url` ist
nur zulässig, wenn alle vier Bedingungen nachweisbar erfüllt sind:
gleiche `run_id`, gleiche `plate_generation`, gleicher Pass (Index +
`speaker_idx`/`segment_id`) und die originale Crop-Geometrie ist ebenfalls
rekonstruierbar. Eine blosse MP4-URL ohne zugehörigen Crop reicht
ausdrücklich **nicht**. Ist der Snapshot nicht vollständig beweisbar, bleibt
`v204_preclip_required` unverändert fail-closed inklusive idempotentem Refund.

Damit gilt der Vertrag scharf:
Fresh dispatch → aktuelle V445-Geometrie.
NOOP-Retry → exakt eingefrorener vorheriger Wire.

Nicht angefasst: Gates, Schwellenwerte, Framing, Kamerapfad, Maskengeometrie,
Provider-Liste, Zustandsmaschine, Assignment-Lock, Refund-Logik.


## Freeze-Einordnung

Der Lip-Sync-Freeze (v400) verbietet Änderungen an Gates und Retry-Mechanik.
Dieser Fix ändert weder Schwelle noch Gate-Logik, sondern behebt einen
deterministischen Widerspruch zwischen zwei bestehenden Verträgen (v404/v407 vs.
V445), der jeden NOOP-Retry unmöglich macht. Er braucht deine ausdrückliche
Freigabe als eng begrenzte Ausnahme.

## Verifikation in diesem Gate

- Neuer Unit-Test: NOOP-Retry mit abweichender Box-Signatur behält
  `preclip_url`/`preclip_crop`; Fresh-Dispatch verwirft sie weiterhin.
- Neuer Unit-Test: Recovery greift nur bei vollständig bewiesenem Snapshot
  (run_id + plate_generation + Pass + Crop); MP4-URL ohne Crop → fail-closed
  mit `v204_preclip_required`.
- Bestehende Deno- und Vitest-Suites müssen grün bleiben.
- Deploy ausschließlich von `compose-dialog-segments`.
- **Kein** Render, kein S01/S11-Rerender in diesem Gate.

## Danach: V451 — Read-Only Motion Geometry Diagnosis (eigenes Gate)

Nicht Teil von V450, keine Änderung an der Motion-Metrik in diesem Gate.

`deltaMean = provider.mean − preclip.mean`; bei Schwelle 3.6827 ist `−63.4`
zwangsläufig NOOP. Der produktive v404-Verdict misst in
`_shared/measure-provider-motion-sync.ts` weiterhin über ein festes
normalisiertes ROI (centerX .5, centerY .6, width .28, height .12); die
V434-Geometrie-ROI läuft nur als Telemetrie, `useGeometryRoiForVerdict` ist im
Webhook nicht aktiv. Bei bewegter Szene kann das feste ROI in Preclip und
Provider-Output unterschiedliche anatomische Regionen treffen — ein falscher
NOOP ist damit real möglich.

V451 vergleicht read-only für exakt denselben Pass: V434-Pin des Preclips,
immutable Provider-Output, dieselben sechs Sample-Zeitpunkte, v404-Fixed-ROI
`deltaMean`, V434 geometry-coupled ROI / MAD-Ratio, die sechs Stillframes
visuell, und — sofern V450 den Retry ermöglicht — First Output gegen
`coords-pro-box`-Retry mit identischem Frozen Input.

Entscheidungsmatrix:
- beide Metriken NOOP + visuell kein Lippenbild → echter Provider-NOOP
- v404 NOOP, geometry-coupled zeigt Motion → ROI-Drift / Messfehler
- beide Outputs bewegen Lippen, `deltaMean` bleibt negativ → v404-Klassifikator
  ist für bewegte Szenen nicht mehr geeignet

