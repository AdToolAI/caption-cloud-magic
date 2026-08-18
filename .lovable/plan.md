# FA-4 Server-Side Synchronous Motion Measurement — Fix Contract (v404)

Read-only design. Kein Code, kein Deploy, kein Render, keine Migration in diesem Schritt.

Offener P1: `sync-so-webhook` liest die Motion-Metrik aus `syncso_dispatch_log.meta_yavg_probe`, das ausschließlich der Browser über `report-lipsync-motion-probe` schreibt (`readMotionProbeMetrics`, Polling 5 s). Der autoritative Apply hängt damit an einem Client-Race.

## 1. Read-only Infrastructure Inventory (Ist-Stand, im Code nachgewiesen)

| Primitive | Datei | Runtime | MP4 lesen | Frames | Synchron aus Webhook | Read-only | Auth | Laufzeit | Failure | Fremdprovider |
|---|---|---|---|---|---|---|---|---|---|---|
| Remotion-Lambda Still-Invoke (`type: "still"`, Composition `DialogStitchVideo`, `inputProps.masterVideoUrl`, Parameter `frame`) | `supabase/functions/_shared/transition-frame.ts` (Zeilen ~85–140) | Deno Edge → AWS Lambda `eu-central-1` via `aws4fetch` | ja (Remotion lädt die MP4-URL) | ja, exakt 1 Still pro Invoke (JPEG, S3/public) | ja, ein einfacher `await aws.fetch(...)` | die Invoke selbst mutiert keinen App-State (der bestehende Wrapper persistiert danach `last_frame_url` — dieser Persist-Teil wird NICHT wiederverwendet) | AWS-Keys + `REMOTION_SERVE_URL` aus Function-Env | grob 3–10 s pro Still (Timeout im Payload aktuell 120 s) | `res.ok === false` → `reason`, kein Throw | nein (AWS-eigene Infrastruktur, entspricht der AWS-only-Regel) |
| `extractFrameForFaceProbe` | `_shared/face-frame-extract.ts` | Edge | nein | nur Cache-Lookup in `composer-frames`; ohne vorherigen Client-Upload `ok:false` | ja | ja | Service-Role | ms | `probe_unavailable` | keiner (Replicate explizit entfernt) |
| `computeMouthYavg` / `useMouthYavgProbe` | `src/lib/composer/lipsync/computeMouthYavg.ts` | Browser-Canvas | ja | ja | nein | – | – | – | – | – |
| `report-lipsync-motion-probe` | Edge-Function | Edge | nein | nein (nimmt nur Client-Werte entgegen) | – | schreibt heute State | – | – | – | – |

Ergebnis: Es existiert **genau ein** freigegebener, im Code nachweisbarer serverseitiger Frame-Primitive: der Remotion-Lambda-Still-Invoke. Ein serverseitiger Bild-Decoder (JPEG → Pixel) existiert heute **nicht** in den Edge-Functions; er ist Teil dieses Contracts (reine Decode-Bibliothek, kein neuer Frame-/Face-Provider).

## 2. Measurement Owner (genau einer)

`supabase/functions/_shared/measure-provider-motion-sync.ts` → `measureProviderMotionSync()`

- läuft serverseitig, wird ausschließlich aus dem `COMPLETED`-Pfad von `sync-so-webhook` synchron aufgerufen
- Input: `{ preclipUrl, providerOutputUrl, passIdx, roi (frozen, siehe §5), sampleCount, deadlineMs }`
- berechnet **keine** neue Face-/Mouth-Geometrie, kein Face-Detection, kein Landmark-Detection, kein Replicate, kein Full-Plate-Recompute
- Ablauf je Video: N gleichverteilte Stills über Remotion-Lambda (`type:"still"`, `frame = round(t*fps)`), parallel invoked, JPEG-Bytes laden, Luminanz in der frozen ROI decodieren, temporale Varianz je Pixel → `mean` und `peak`
- mutiert weder Scene-, noch Ledger-, noch Dispatch-State und startet keinen Retry
- Output ausschließlich `{ preclip_metric, provider_metric, measurement_status: 'ok'|'timeout'|'error', reason }`

`classifyMotionProbe()` bleibt unverändert PURE und einziger Classifier.

## 3. Produktionspfad — Measurement läuft AUSSERHALB des Dialog-Locks

`sync-so-webhook` hält heute den v5-Pfad unter `withDialogLock(..., { ttlSeconds: 30, maxAttempts: 4 })` (Zeilen 703 / 1298). Ein AWS/Lambda-Wait darf niemals in diesem Lock stattfinden.

```text
1  Webhook-Auth / Scene-Lookup / Run-Guard
2  authoritative pipeline_job_id + pass binding auflösen
3  immutable Measurement-Snapshot:
     pipeline_job_id, external_job_id, scene_id, pass_idx,
     run_id, plate_generation, exact preclip_url,
     exact rehosted provider_output_url, frozen ROI/Sampling-Config
4  KEIN Dialog-Lock während:
     Lambda-Still-Invokes | Still-Downloads | JPEG-Decode | Measurement
5  PURE classifyMotionProbe(...)
6  danach authoritative composer_apply_sync_segment_result(...)
       motion        -> ssw:success
       noop          -> ssw:noop_escalate (genau 1 Replacement-Attempt,
                        Retry-Wire = inline bounding_boxes)
       indeterminate -> ssw:failed, output_url=null,
                        error_text='motion_probe_indeterminate'
```

Der G3.2.2-RPC bleibt alleinige Stale-/Idempotency-/Apply-Authority. Ist zwischen Snapshot und Apply `run_id` / `plate_generation` / Job-Binding stale geworden, lehnt der RPC ab — keine manuelle Recovery-Mutation.

Vor Abschluss der Messkette: kein `ssw:success`, kein Segment `done`, kein `audio_mux`, kein Replacement-Attempt, keine Client-Voraussetzung.

## 4. Metrik-Provenance und Kalibriergate

Die historischen S11-Zahlen (T1 1.076/2.907 → 1.157/3.768 usw.) stammen aus der abgeschlossenen RCA (ffmpeg grayscale frame-difference energy, globaler Mittelwert + 9×9-Peak-Block) — **nicht** aus `computeMouthYavg`. Sie sind damit ausschließlich historische Evidenz für die frozen Labels:

T1 = motion, T2 = motion, T3 = motion, T4 = noop, T5 = motion, T6 = noop

Sie werden **nicht** als numerisch kompatible Fixture behandelt und **nicht** mit den heutigen Thresholds (+0.08 / −0.02) verknüpft.

Calibration Gate (eigener, später freizugebender Schritt, vor jedem Deploy des Gates):

1. Dieselben sechs S11-Artefaktpaare (p0..p5, Preclip + Provider-Output) mit dem neuen serverseitigen Algorithmus **neu messen** — nur Messung, kein Apply.
2. Aus den Server-Werten ableiten: `server_delta_min_motion` (min Δpeak über T1/T2/T3/T5), `server_delta_max_noop` (max Δpeak über T4/T6), `gap = server_delta_min_motion − server_delta_max_noop`.
3. Nur wenn `gap > 0`: `MOTION_THRESHOLD = server_delta_min_motion − gap/4`, `NOOP_THRESHOLD = server_delta_max_noop + gap/4`.
4. Wenn `gap ≤ 0`: **BLOCKED**, kein Deploy, keine Threshold-Erfindung, keine manuelle Justage.
5. Die historischen RCA-Werte bleiben im Test nur als Provenance-/Label-Kommentar erhalten.

## 5. ROI- und Sampling-Semantik (frozen)

Für die erste Server-Kalibrierung exakt die heutige normalisierte ROI des Browser-Probes, ohne jede neue Geometrie:

- center x = 0.5, center y = 0.6
- width = 0.28, height = 0.12

Sampling:

- N gleichmäßig verteilte Samples
- 5 % Start-Padding, 5 % End-Padding
- identische N-Zahl für Preclip und Provider-Output
- N wird im Calibration Gate bestimmt und danach frozen

Kein Face Detection, kein Landmark Detection, kein Geometry-Recompute.

## 6. Remotion Source→Still Transform (Beweispflicht vor Implementation-GO)

`transition-frame.ts` beweist nur den erlaubten Primitive (`type: "still"`, Composition `DialogStitchVideo`, `masterVideoUrl`, `frame`, JPEG). Daraus folgt **nicht**, dass ein 720×720-Preclip pixelidentisch und ungecroppt im Still liegt.

Vor Implementation-GO ist zu beweisen und im Contract festzuhalten:

- Still-Output width/height
- Source-Video width/height
- object-fit / scale / crop / letterbox-Verhalten der Composition
- exakte Transformation source-space → still-space

Zulässige Ergebnisse:

- **A**: Still-Space = Source-Space exakt → normalisierte ROI direkt verwendbar
- **B**: deterministische Transformation existiert → dieselbe normalisierte Source-ROI wird mathematisch in Still-Space transformiert

Ist die Transformation nicht eindeutig beweisbar: **BLOCKED**. Keine visuelle Schätzung.

## 7. Duplicate Callback

Das Measurement ist read-only gegenüber Composer/DB/Ledger. Ein Duplicate Callback darf nie einen zweiten Apply-Effekt, zweiten Replacement-Attempt, zweiten Mux oder eine zweite Refund-Wirkung erzeugen — das garantiert weiterhin der bestehende G3.2.2-Apply-Vertrag. Führen zwei parallele identische Callbacks ausnahmsweise dieselbe read-only Lambda-Messung aus, ist das kein State-Correctness-Fail, sondern als Cost-/Telemetry-Duplikat zu loggen. Keine neue Measurement-Lock-/Ledger-Architektur in FA-4.

## 8. Fail-closed / Deadline

- Die Deadline wird **nicht** vorab als Wunschzahl eingefroren. Im Calibration-/Performance-Gate zu messen: N, Still-Latenz p50/p95, Gesamtzeit für 2 × N Stills, Webhook-Gesamtbudget. Danach eine endliche, deterministische Deadline festlegen; pro Still-Invoke eigener Timeout; keine nichtterminale Warteschleife.
- Messung nicht startbar / Timeout / Preclip nicht lesbar / Output nicht lesbar / keine verwertbare Metrik ⇒ `measurement_status != 'ok'` ⇒ Verdict `indeterminate`
- `indeterminate` ⇒ `composer_apply_sync_segment_result(write_id='ssw:failed', provider_status='COMPLETED', output_url=null, error_text='motion_probe_indeterminate')`
- kein stilles Success, kein Mux, kein automatischer Retry bei `indeterminate`

## 9. report-lipsync-motion-probe

Bleibt reine Telemetrie. Aus der Authority entfernt werden: `readMotionProbeMetrics()`, Client-Polling als Voraussetzung, `update_dialog_pass_slot` für die Motion-Entscheidung, Retry-/Apply-Ownership. Der Produktionspfad muss bei komplett geschlossenem Browser vollständig funktionieren.

## 10. Geforderte Tests der späteren Implementierung

A. COMPLETED + serverseitig `motion` → `ssw:success`
B. COMPLETED + serverseitig `noop` → `ssw:noop_escalate`, genau ein Replacement-Attempt
C. Measurement timeout/error → `indeterminate` → `ssw:failed`, kein Mux
D. Kein Browser, `report-lipsync-motion-probe` nie aufgerufen → Motion-Gate funktioniert vollständig (Pflicht-Akzeptanztest)
E. verspätete Client-Telemetrie ändert ein bereits autoritativ entschiedenes Resultat nicht
F. doppelter Sync.so-Callback → keine doppelte Mess-/Apply-Wirkung, kein zweiter Replacement-Attempt
G. stale run / `plate_generation` → kein Apply, kein Redispatch
H. S11-Fixture (nach Kalibrierung, Server-Werte): T1/T2/T3/T5 = motion, T4/T6 = noop
I. Single-Speaker-Pfad unverändert
J. Geometry / Audio / Fan-out / Mux / RS3 unverändert

## 11. Frozen (nicht Teil dieses Contracts)

v402 Face-Candidate / Hungarian / AssignmentLock, Contract E / Preclip-Geometrie, Audio-Preparation, Turn-ID / Fan-out, `speaker_idx`, Ledger / G3.2.2, RS3, Mux / Finalizer, `processed_video_url`-Semantik, Fresh = `bounding_boxes_url` / Retry = inline `bounding_boxes`, Sync-3-Modellentscheidung.

## 12. Restrisiken (im Calibration-Gate zu klären)

- Laufzeit: 2 × N Still-Invokes pro Segment außerhalb des Dialog-Locks, innerhalb des Webhook-Gesamtbudgets.
- Kosten: zusätzliche Lambda-Still-Invokes pro Lip-Sync-Pass, inkl. möglicher Duplicate-Callback-Duplikate (nur Cost/Telemetry).
- Der serverseitige JPEG-Decoder ist eine neue Abhängigkeit (reine Dekodierbibliothek, kein Frame-/Face-Provider).
- Source→Still-Transform (§6) ist noch unbewiesen und ist harte Voraussetzung für Implementation-GO.

FA-4 SERVER-SIDE SYNCHRONOUS MOTION MEASUREMENT FIX CONTRACT = FINAL CORRECTION READY
