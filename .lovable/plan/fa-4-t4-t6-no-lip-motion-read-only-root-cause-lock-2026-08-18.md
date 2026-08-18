# FA-4 T4/T6 No-Lip-Motion — READ-ONLY ROOT-CAUSE-LOCK

Run `8b0f659d-7e40-41e5-9761-e870709824ff` · Scene `e658509d-cdeb-40f7-bd33-98e74144fdc5` · Build `v402-fa4-face-candidate-geometry-fix`

Einzige Frage: Warum zeigen T4 (Kay) und T6 (Samuel) im finalen MP4 keine erkennbare Lip-Motion, obwohl die Pipeline terminal `succeeded` ist?

Strikt read-only: kein Code, kein Deploy, kein Render, kein Retry, kein Reset, keine DB-/Wallet-Mutation, kein FA-5. Frozen non-scope (v402 Face-Candidate/Hungarian, v183/v277-Neutralisierung, speakerPlateBboxes, AssignmentLock, Turn-ID-Fan-out, Ledger acquire/apply, RS3, audio_mux ownership, Finalizer, `processed_video_url`-Semantik) wird nicht wieder geöffnet — nur gemeldet, falls neue Evidenz einen dieser Contracts direkt widerlegt, dann STOP ohne Reparatur.

## Control Group

Alle sechs Turns mit identischer Messmethode; T1/T2/T3/T5 sind positive Controls, jede Messung wird gegen diese normalisiert (keine Bewertung anhand absoluter Pixel-Energie).

```text
T1 Sarah   55385e38-…   T2 Samuel  ab0ba4bd-…   T3 Matthew a4d8e837-…
T4 Kay     9a0bd588-…   T5 Sarah   1a97a4e2-…   T6 Samuel  162210e9-…
```

Bereits gelesene Ausgangslage (Ledger + `video_renders`): 6 × `sync_segment` succeeded (Provider sync.so), 6 Pre-Clips `completed`; Pass→Turn: p0=T1, p1=T5, p2=T2, p3=T6, p4=T3, p5=T4. Crops: p0/p1 x=54 size=250, p2/p3 x=366 size=250, p4 x=606 size=394, p5 x=890 size=394. T4/T6 teilen ihre Crop-Geometrie also mit jeweils bestandenen Controls — Geometrie ist damit als alleinige Ursache nicht plausibel, wird aber trotzdem pro Messpunkt mitgeführt.

## Messpunkt A — Preclip-Input

Pro Pass das exakte an Sync.so gegangene Preclip-MP4 abrufen und beweisen: URL/`render_id`, Dimensionen, fps, Frame-Count, Dauer, `preclip_crop`, Ziel-Bbox im Clip-Space, Turn-Zuordnung. Mund-ROI-Energie über die volle Dauer messen plus Frame-Strips (Anfang, erstes Drittel, Mitte, letztes Drittel, Ende).
Ergebnis je Turn: `PRECLIP_MOTION = static | natural_motion | ambiguous`. `static` ist ausdrücklich kein Fehler, nur Ausgangszustand.

## Messpunkt B — exakter Provider-Input

Pro `sync_segment`-Job rekonstruieren: `pipeline_job_id`, `external_job_id`, `segment_id`, `speaker_idx`, `character_id`, compose-Version, Dispatch-Video-URL und -Art (preclip), `input_space`, Modell, `sync_mode`, exakte ASD-Shape, `bounding_boxes_url`/inline boxes, Frame-Count, voiced frame count.
Das tatsächlich gesendete Audio wird aus dem Wire-Payload bestimmt (nicht blind `pass.audio_url`; falls `sync_audio_url` verwendet wurde, gilt dieses) und gemessen: URL/Hash, Dauer, Sample-Rate/Kanäle, RMS/Peak, VAD `voiced_sec`, `first_voiced_sec`, `last_voiced_sec`, führende/abschließende Stille, Verhältnis voiced zu Preclip-Dauer.
Geprüft wird: ist T4- bzw. T6-Provider-Audio voiced, setzt die Stimme sinnvoll innerhalb des Clips ein, liegt `voiced_end` innerhalb Preclip-Dauer plus bestehender Toleranz, unterscheiden sich T4/T6 strukturell von den Controls. Es wird keine neue Schwelle erfunden — es gelten die bestehenden Pipeline-/VAD-Gates und der Vergleich mit den Controls.
Ergebnis: `PROVIDER_INPUT_AUDIO = valid_voiced | silent_or_near_silent | timing_mismatch | unavailable_to_prove`.

## Messpunkt C — Sync.so-Output

Für jede `external_job_id` das exakte, vom Mux konsumierte Output-Artefakt abrufen (nichts neu generieren): Provider-Status, Output-URL, Dauer, Dimensionen, Frame-Count. Dieselbe Mund-ROI-Methode wie in A plus Frame-Strips; entscheidend ist das Delta Preclip → Output.
Ergebnis: `PROVIDER_LIP_RESULT = clear_generated_motion | weak_generated_motion | no_op | indeterminate`. `no_op` nur bei nachweislich valid_voiced Input, verfügbarem Output, fehlender Artikulation im Zielmund und klarer Motion der Controls unter derselben Methode. Bei silent/timing-invalidem Provider-Audio wird nicht `provider_no_op` vergeben.

## Messpunkt D — Mux / finales Composite

Aus persistiertem State/Render-Payload/Logs beweisen (keine Architekturannahme): welche Provider-Output-URL der Mux je Pass konsumiert, Turn-Fenster im finalen Timeline-Space, `sourceStartSec`/lokale Provider-Zeit, `preclip_crop`, Sequence-/Overlay-Placement, finales Zielfenster, Layer-Reihenfolge. Dann Vergleich Provider-Output-Timeline gegen das finale MP4 im erwarteten absoluten Turn-Fenster.
Ergebnis: `MUX_RESULT = motion_preserved | motion_lost | motion_shifted_outside_turn | wrong_source_segment | indeterminate`.

## Finales Audio

Separat bestätigen, dass T1..T6 im finalen MP4 hörbar sind, mit ihren finalen Audio-Fenstern, ohne die Annahme final audio == Sync.so-Input-Audio. Pitch/F0 ausschließlich als Diagnose-Notiz; kein Voice-Identity- oder Voice-Swap-Urteil ohne belastbare Voice-ID-Evidenz.

## Vergleichsmatrix und Lock-Logik

Eine Tabelle über alle sechs Turns: Turn, Speaker, Preclip-Motion, Provider-Audio gültig, Provider-Output-Lip-Motion, Mux/Final-Lip-Motion, finales Audio hörbar, Root-Stage (`INPUT_AUDIO_PREP`, `SYNCSO_PROVIDER_NOOP`, `MUX_SOURCE_SELECTION`, `MUX_TIMING`, `MUX_OVERLAY`, `FINAL_REVIEW_FALSE_NEGATIVE`, `INDETERMINATE`).

Geschlossen wird nur bei einer der Ketten A (Provider-Audio silent/invalid/misaligned → Output statisch = INPUT_AUDIO_PREP), B (Audio valid voiced → Output statisch = SYNCSO PROVIDER NO-OP), C (Output artikuliert → Final statisch, Source/Timing/Overlay-Abweichung bewiesen = MUX) oder D (Output und Final artikulieren im korrekten Fenster = vorherige visuelle Abnahme war falsch). Sonst: nicht raten, `ROOT CAUSE NOT LOCKED` mit Benennung der fehlenden Evidenz. `status=succeeded` gilt nie als Beweis visueller Provider-Wirkung.
T4 und T6 werden getrennt klassifiziert; eine gemeinsame Ursache wird erst behauptet, wenn beide Messketten tatsächlich identisch sind.

## Abschluss

Ergebnis wird in `docs/v433-motion-studio-final-acceptance.md` als eigener Abschnitt mit allen Zahlen pro Turn dokumentiert (einzige Schreiboperation des Schritts). Danach exakt eine Abschlusszeile:

- `FA-4 T4/T6 ROOT-CAUSE LOCKED — T4 = <Stufe + Beweiskette>, T6 = <Stufe + Beweiskette> → STOP`, oder
- `FA-4 T4/T6 ROOT-CAUSE NOT LOCKED — <fehlende Evidenz> → STOP`

Kein Fix, kein Deploy, kein Render, kein Retry, kein Reset, kein FA-5.

## Technische Details

- Quellen: `composer_pipeline_jobs` (Stage `sync_segment`, `external_job_id`, `metadata.pass_idx`), `video_renders` (`source=dialog-pass-preclip`, `content_config.face_crop`, Lambda-Payload), `composer_scenes` (`dialog_turns`, `dialog_takes`, `audio_plan`, `base_video_url`, `processed_video_url`), Edge-Function-Logs von `compose-dialog-segments`, `sync-so-webhook`, `render-sync-segments-audio-mux`.
- Messung: ffmpeg-Frameextraktion, Mund-ROI-Differenzenergie mit identischer ROI-Definition über alle Messpunkte, Normalisierung gegen die vier Controls; Audio-VAD über RMS-Fenster.
- Alle Artefakte werden nur gelesen/heruntergeladen; es erfolgt kein Aufruf an Sync.so, Remotion oder eine andere Render-API.
