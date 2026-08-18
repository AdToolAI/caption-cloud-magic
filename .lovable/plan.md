# FA-4 Provider-No-op Fix Contract — CORRECTED (Option C′)

Status: `FA-4 CONTROLLED RETEST = BLOCKED`
- T4 Kay / p5 = `SYNCSO_PROVIDER_NOOP`
- T6 Samuel / p3 = `SYNCSO_PROVIDER_NOOP`

Kein Code, kein Deploy, kein Render in diesem Schritt.

## 0. Korrektur der Ausgangsannahmen

Die frühere „Option A: auf `bounding_boxes_url` wechseln“ ist gestrichen. Der aktuelle Production-Pfad IST bereits:

- `model = sync-3` (kein `lipsync-2-pro` als Primary)
- Multi-Speaker = Single-Face-Preclip
- Fresh ASD = `bbox-url-pro` via `active_speaker_detection.bounding_boxes_url`
- Contract-E-transformierte Ziel-BBox im Preclip-Raum
- `auto_detect` im finalen Dialog-Wire verboten, coordinate-only kein Happy-Path

Kein Modellwechsel in diesem Contract.

## 1. Frozen — nicht zu öffnen

v402 Face-Candidate / Hungarian / AssignmentLock · Contract E / Preclip-Crop-Geometrie · Audio-Preparation · Turn-ID / Fan-out · Ledger / RS3 · Mux / Finalizer · `processed_video_url`-Semantik.

## 2. Gewählte Option — C′

Multi-Speaker Provider-Output Motion Gate
+ bestehender autoritativer G3.2.2 NOOP-Escalate-Vertrag
+ genau EINE alternative Wire-Konfiguration.

Keine neue Retry-Architektur.

## 3. Motion-Noop Classifier (PURE)

Nach Sync.so `COMPLETED` bewertet ein reiner Classifier für Multi-Speaker-Passes den Provider-Output gegen den exakten Provider-Input-Preclip.

- Keine DB-Writes, kein Pass-Patch, kein Retry, kein Ledger-Zugriff.
- Input: Motion-Metrik Preclip, Motion-Metrik Provider-Output, optional normalisierte Begleitmetriken.
- Output: `motion` | `noop` | `indeterminate` + Messwerte/Reason.
- Klassifikation NIE allein über HTTP/Provider-Status, Dateigröße, ETag oder Resolution. Diese bleiben nur Zusatz-Evidenz.

## 4. Frozen S11 Motion Fixture (aus abgeschlossener RCA)

| Pass | Turn | Pre (mean/peak) | Provider (mean/peak) | Δpeak | Erwartet |
|---|---|---|---|---|---|
| p0 | T1 Sarah | 1.076 / 2.907 | 1.157 / 3.768 | +0.86 | motion |
| p1 | T5 Sarah | 0.635 / 1.981 | 0.717 / 2.953 | +0.97 | motion |
| p2 | T2 Samuel | 0.328 / 0.886 | 0.340 / 1.019 | +0.13 | motion |
| p3 | T6 Samuel | 0.355 / 0.936 | 0.356 / 0.864 | −0.07 | noop |
| p4 | T3 Matthew | 0.329 / 1.073 | 0.357 / 2.213 | +1.14 | motion |
| p5 | T4 Kay | 0.307 / 0.836 | 0.292 / 0.688 | −0.15 | noop |

Pflicht: T1/T2/T3/T5 nie `noop`; T4/T6 immer `noop`. Der schwache positive Control T2 (+0.13) ist der bindende Sensitivity-Anker.

Kein frei erfundener Epsilon. Ein Runtime-Threshold darf nur aus einer dokumentierten Classifier-Regel entstehen, die alle sechs frozen Cases trennt und eine explizite Sensitivity-Prüfung um T2 enthält (dokumentierter Abstand zwischen T2 und dem stärksten Noop-Case p3 = −0.07).

## 5. Authoritative Retry Ownership

Bei `noop` NICHT: `dialog_shots` direkt patchen, `pipeline_job_id` nullen, eigenen Retry-Attempt erzeugen, freien Redispatch starten.

Stattdessen ausschließlich über den eingefrorenen G3.2.2-Vertrag:

`composer_apply_sync_segment_result` mit `write_id = ssw:noop_escalate`

Der RPC bleibt Owner von Segment-Fail/Retryable, Slot-Reset, Replacement-Attempt und Ledger-Provenienz. Der folgende Redispatch adoptiert ausschließlich `replacement_job_id`. RS3 / `run_id` / `plate_generation` bleiben unverändert.

## 6. `report-lipsync-motion-probe` bleibt Nicht-Owner

Diese Function darf höchstens als Quelle PURER Motion-Metrik-/Classifier-Logik dienen. Ihre `update_dialog_pass_slot`-Mutation, Retry-State-Änderungen und eigene Redispatch-Logik sind NICHT der autoritative G3.2.2-Vertrag und werden für C′ weder kopiert noch aktiviert.

## 7. Alternative Wire-Konfiguration (genau eine)

Fresh: `sync-3` · Single-Face-Preclip · `bbox-url-pro` · `bounding_boxes_url` · v402/Contract-E-Geometrie · Provider-Audio.

Retry (C′):
- `sync-3` unverändert
- EXAKT derselbe Preclip
- EXAKT dieselbe transformierte Ziel-BBox
- EXAKT dasselbe Audio
- statt `bounding_boxes_url`: inline `bounding_boxes`

Einziger Unterschied = ASD-Transportform. Kein Full-Plate-Fallback, kein `auto_detect`, kein coordinate-only, kein Modellwechsel, kein Geometry-Recompute.

## 8. P1 Integration Conflict — Auflösung

Bestehender Konflikt: v148 entfernt bei NOOP-Eskalation (`coords-pro-box`) den Preclip; v204 blockiert Multi-Speaker-Dispatch ohne Preclip (`v204_preclip_required`).

Für C′ verbindlich: Der NOOP-Retry BEHÄLT den bewiesenen Single-Face-Preclip. Der Payload-Test muss beweisen:

```text
Fresh: video = preclip, ASD = bounding_boxes_url
Retry: video = SAME preclip, ASD = inline bounding_boxes
NICHT: video = full plate
```

## 9. Unit-/Contract-Tests vor Deploy

- A. Classifier: T1/T2/T3/T5 → motion; T4/T6 → noop
- B. COMPLETED + motion → `ssw:success`, kein Retry
- C. COMPLETED + noop → `ssw:noop_escalate`, genau ein Replacement-Attempt
- D. Duplicate Callback → kein zweiter Replacement-Attempt
- E. Stale run/generation → kein Apply/Redispatch
- F. Wire-Diff: Fresh `bbox-url-pro` vs. Retry inline-bbox unterscheiden sich ausschließlich in der ASD-Transportform
- G. Multi-Speaker-Retry: Preclip bleibt gesetzt, `v204_preclip_required` feuert nicht
- H. Single-Speaker: unverändert
- I. Geometry / Contract E / `speaker_idx` / `segment_id`: unverändert

## 10. Success Contract (Unit-/Contract-Ebene)

- Alle frozen Motion-Fixtures korrekt klassifiziert
- Keine Control-False-Positives (T2 bindend)
- Genau ein autoritativer Replacement-Attempt
- Retry-Wire nachweislich anders
- Preclip identisch
- Keine Änderung an Geometry / Audio / Mux / Fan-out

Danach STOP. Kein Deploy, kein Render. Ein einzelner Controlled Retest erst nach separatem Deploy-GO.

`FA-4 PROVIDER-NO-OP FIX CONTRACT CORRECTION READY → STOP`
