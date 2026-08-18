# FA-4 Provider-No-op Fix Contract — C′

Status: `FA-4 CONTROLLED RETEST = BLOCKED`
- T4 Kay / p5 = `SYNCSO_PROVIDER_NOOP`
- T6 Samuel / p3 = `SYNCSO_PROVIDER_NOOP`

Kein Code, kein Deploy, kein Render in diesem Schritt.

## 0. Frozen — nicht zu öffnen

v402 Face-Candidate / Hungarian / AssignmentLock · Contract E / Preclip-Crop-Geometrie · Audio-Preparation · Turn-ID / Fan-out · Ledger / RS3 · Mux / Finalizer · `processed_video_url`-Semantik.

## 1. Gewählte Option — C′

Multi-Speaker Provider-Output Motion Gate
+ bestehender autoritativer G3.2.2 NOOP-Escalate-Vertrag
+ genau EINE alternative Wire-Konfiguration.

Keine neue Retry-Architektur.

## 2. Motion-Gate Integration Point (eingefroren)

Für Multi-Speaker `sync_segment` muss der Provider-Callback exakt diese Reihenfolge haben:

1. Sync.so terminal `COMPLETED`
2. Provider-Output abrufen/rehosten
3. PURE Motion-Metrik berechnen für:
   - exakten Provider-Input-Preclip
   - exakten Provider-Output
4. PURE Classifier: `motion | noop | indeterminate`
5. erst DANACH autoritativer Apply

Vor Abschluss der Motion-Probe darf:
- kein `ssw:success` committet werden
- kein Segment als done gelten
- kein `audio_mux` ausgelöst werden

`composer_apply_sync_segment_result` bleibt alleiniger State-/Ledger-Owner.

## 3. Motion-Noop Classifier (PURE)

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

## 5. Authoritative Apply Outcomes

Bei `motion`:

`composer_apply_sync_segment_result(... write_id='ssw:success')`

Bei `noop`:

`composer_apply_sync_segment_result(... write_id='ssw:noop_escalate')`

Bei `indeterminate`:

FAIL CLOSED und terminal über den bestehenden Failure-Apply:

`composer_apply_sync_segment_result(
  write_id='ssw:failed',
  provider_status='COMPLETED',
  output_url=null,
  error_text='motion_probe_indeterminate'
)`

Damit gilt:
- kein Segment bleibt nichtterminal hängen
- kein Mux startet
- kein Provider-No-op wird als Success akzeptiert
- kein neuer Write-ID / kein neuer State-Owner wird erfunden
- Refund/Scene-Verdict bleiben beim bestehenden G3.2.2-Vertrag

Kein automatischer Retry für `indeterminate` in diesem Contract.

## 6. Measurement Owner

Die Motion-Metrik muss serverseitig im Provider-Completion-Pfad oder über einen synchron autorisierten read-only Measurement-Helper verfügbar sein, BEVOR `ssw:success` entschieden wird.

`report-lipsync-motion-probe` bleibt ausdrücklich:
- kein State-Owner
- kein Retry-Owner
- kein Replacement-Attempt-Owner
- kein post-hoc Mechanismus, auf den der Mux warten muss

Seine bestehende Client-/Mutation-Architektur wird nicht zur neuen Authority.

## 7. Alternative Wire-Konfiguration (genau eine)

Fresh:
- model = sync-3
- video = Single-Face-Preclip
- audio = bestehendes Provider-Audio
- target bbox = Contract-E-transformierte BBox
- ASD = bounding_boxes_url

Retry C′:
- model = sync-3
- video = EXAKT derselbe Single-Face-Preclip
- audio = EXAKT dasselbe Provider-Audio
- target bbox = EXAKT dieselbe transformierte BBox
- ASD = inline bounding_boxes

Einziger Wire-Unterschied:

`bounding_boxes_url` → inline `bounding_boxes`

Kein Full-Plate. Kein Preclip-Drop. Kein `auto_detect`. Kein coordinate-only. Kein Modellwechsel. Kein Geometry-Recompute.

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
- D. COMPLETED + indeterminate → `ssw:failed` mit `error_text='motion_probe_indeterminate'`, kein Mux
- E. Duplicate Callback → kein zweiter Replacement-Attempt
- F. Stale run/generation → kein Apply/Redispatch
- G. Wire-Diff: Fresh `bbox-url-pro` vs. Retry inline-bbox unterscheiden sich ausschließlich in der ASD-Transportform
- H. Multi-Speaker-Retry: Preclip bleibt gesetzt, `v204_preclip_required` feuert nicht
- I. Single-Speaker: unverändert
- J. Geometry / Contract E / `speaker_idx` / `segment_id`: unverändert

## 10. Success Contract (Unit-/Contract-Ebene)

- Alle frozen Motion-Fixtures korrekt klassifiziert
- Keine Control-False-Positives (T2 bindend)
- `indeterminate` fail-closed in `ssw:failed`
- Genau ein autoritativer Replacement-Attempt bei `noop`
- Retry-Wire nachweislich anders
- Preclip identisch
- Keine Änderung an Geometry / Audio / Mux / Fan-out

Danach STOP. Kein Deploy, kein Render. Ein einzelner Controlled Retest erst nach separatem Deploy-GO.

FA-4 PROVIDER-NO-OP FIX CONTRACT FINAL PRECISION READY → STOP
