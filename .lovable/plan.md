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
- Input: `{ preclipUrl, providerOutputUrl, passIdx, mouthRoi (bestehende Preclip-space-Geometrie), sampleCount, deadlineMs }`
- berechnet **keine** neue Face-Geometrie, ruft **kein** Face-Detection, kein Replicate, kein Full-Plate-Recompute
- Ablauf je Video: N gleichverteilte Stills über Remotion-Lambda (`type:"still"`, `frame = round(t*fps)`), parallel invoked, JPEG-Bytes laden, Luminanz in der Mouth-ROI decodieren, temporale Varianz je Pixel → `mean` und `peak` (identische Formel wie `computeMouthYavg`, nur andere Frame-Quelle)
- mutiert weder Scene-, noch Ledger-, noch Dispatch-State und startet keinen Retry
- Output ausschließlich `{ preclip_metric, provider_metric, measurement_status: 'ok'|'timeout'|'error', reason }`

`classifyMotionProbe()` bleibt unverändert PURE und einziger Classifier.

## 3. Produktionspfad nach dem Fix

```text
Sync.so COMPLETED
  -> Output rehosten (unverändert)
  -> measureProviderMotionSync(preclip, output)   [synchron, serverseitig]
  -> classifyMotionProbe(...)
       motion        -> ssw:success
       noop          -> ssw:noop_escalate  (genau 1 Replacement-Attempt, Retry-Wire = inline bounding_boxes)
       indeterminate -> ssw:failed, output_url=null, error_text='motion_probe_indeterminate'
```

Vor Abschluss der Messkette: kein `ssw:success`, kein Segment `done`, kein `audio_mux`, kein Replacement-Attempt, keine Client-Voraussetzung.

## 4. Metrik-Kompatibilität — verbindliches Kalibriergate

Die Lambda-Still-Quelle liefert andere Encoder-/Skalierungspfade als der Browser-Canvas. Die frozen Thresholds (`MOTION_THRESHOLD=+0.08`, `NOOP_THRESHOLD=-0.02`) dürfen **nicht** ungeprüft auf die neue Quelle gelegt werden.

Kalibrierschritt (eigener, später freizugebender Gate-Schritt, vor jedem Deploy des Gates):

1. Die sechs eingefrorenen S11-Artefaktpaare (p0..p5, Preclip + Provider-Output) mit `measureProviderMotionSync()` **offline** neu messen — nur Messung, kein Apply.
2. Ergebnis tabellarisch gegen die frozen Client-Werte stellen (T1 1.076/2.907→1.157/3.768, T5 0.635/1.981→0.717/2.953, T2 0.328/0.886→0.340/1.019, T6 0.355/0.936→0.356/0.864, T3 0.329/1.073→0.357/2.213, T4 0.307/0.836→0.292/0.688).
3. Akzeptanz nur wenn die serverseitige Messung dieselbe Ordnung erzeugt: Δpeak(T1,T5,T2,T3) > 0 und Δpeak(T6,T4) ≤ 0.
4. Thresholds werden aus den **gemessenen** Server-Werten abgeleitet, exakt nach der bestehenden Regel: `gap = Δpeak_min(motion) − Δpeak_max(noop)`, `MOTION_THRESHOLD = Δpeak_min(motion) − gap/4`, `NOOP_THRESHOLD = Δpeak_max(noop) + gap/4`. Keine Wunschwerte, keine manuelle Justage.
5. Wenn `gap ≤ 0` (T2 nicht sauber von T6/T4 trennbar): **BLOCKED**, kein Deploy, keine Threshold-Erfindung.
6. Der Fixture-Kommentar im Classifier wird um die Server-Spalte ergänzt; die Client-Werte bleiben als historischer Anker stehen.

Sampling-Parameter (N Frames, ROI-Größe) sind Teil der Kalibrierung und werden danach eingefroren.

## 5. Fail-closed / Timeout

- harte, endliche Gesamt-Deadline für die Messung im Webhook (Vorschlag: 45 s, final in der Implementierung fixiert), pro Still-Invoke eigener Timeout; keine nichtterminale Warteschleife
- Messung nicht startbar / Timeout / Preclip nicht lesbar / Output nicht lesbar / keine verwertbare Metrik ⇒ `measurement_status != 'ok'` ⇒ Verdict `indeterminate`
- `indeterminate` ⇒ `composer_apply_sync_segment_result(write_id='ssw:failed', provider_status='COMPLETED', output_url=null, error_text='motion_probe_indeterminate')`
- kein stilles Success, kein Mux, kein automatischer Retry bei `indeterminate`

## 6. report-lipsync-motion-probe

Wird auf reine Telemetrie reduziert: schreibt nur ein Diagnosefeld, kein Scene-State (`yavg_probed_at`-Patch entfällt), kein Freischalten des Webhooks, kein Success, kein Retry, kein Replacement-Attempt. `readMotionProbeMetrics()` in `sync-so-webhook` entfällt ersatzlos.

## 7. Geforderte Tests der späteren Implementierung

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

## 8. Frozen (nicht Teil dieses Contracts)

v402 Face-Candidate / Hungarian / AssignmentLock, Contract E / Preclip-Geometrie, Audio-Preparation, Turn-ID / Fan-out, `speaker_idx`, Ledger / G3.2.2, RS3, Mux / Finalizer, `processed_video_url`-Semantik, Fresh = `bounding_boxes_url` / Retry = inline `bounding_boxes`, Sync-3-Modellentscheidung.

## 9. Restrisiken (offen zu bestätigen)

- Laufzeit: 2 × N Still-Invokes pro Segment innerhalb des Webhook-Zeitbudgets; N wird in der Kalibrierung so klein wie möglich gewählt.
- Kosten: zusätzliche Lambda-Still-Invokes pro Lip-Sync-Pass.
- Der serverseitige JPEG-Decoder ist eine neue Abhängigkeit (reine Dekodierbibliothek, kein Frame-/Face-Provider).

FA-4 SERVER-SIDE SYNCHRONOUS MOTION MEASUREMENT FIX CONTRACT = READY FOR APPROVAL
