# FA-4 T4/T6 No-Lip-Motion — Read-Only Root-Cause-Lock

Ziel: Für die beiden blockierenden Turns eindeutig festlegen, an welcher Stufe die Mundbewegung verloren geht. Kein Code, kein Deploy, kein Render, kein Retry/Reset, keine DB-Mutation. Der Face-Candidate-Layer (v402) wird nicht angefasst.

## Was bereits belegt ist (aus dem abgeschlossenen Run `8b0f659d…`)

- Ledger: 1 × `base_video`, 6 × `sync_segment` (Provider sync.so), 1 × `audio_mux` — alle `status = succeeded`, kein `error_code`.
- Alle sechs Segmente tragen die korrekte `segment_id` = `dialog_turn.id`; die Fan-out-Kardinalität stimmt.
- Alle sechs Pre-Clips wurden real gerendert (`video_renders.source = dialog-pass-preclip`, alle `completed`), mit diesen Crops:

```text
pass 0  turn 0  Sarah    crop x=54   y=132 size=250   53 frames
pass 1  turn 4  Sarah    crop x=54   y=132 size=250   52 frames
pass 2  turn 1  Samuel   crop x=366  y=102 size=250   49 frames
pass 3  turn 5  Samuel   crop x=366  y=102 size=250   48 frames
pass 4  turn 2  Matthew  crop x=606  y=24  size=394   46 frames
pass 5  turn 3  Kay      crop x=890  y=36  size=394   44 frames
```

Wichtige Beobachtung: Die beiden visuell fehlgeschlagenen Turns (T4 = Kay/pass 5, T6 = Samuel/pass 3) haben identische bzw. plausible Crop-Geometrie wie ihre visuell bestandenen Partner-Turns. Eine Crop-/Zuordnungsursache ist damit nicht belegt — die Ursache ist noch offen und wird in diesem Schritt erst bestimmt.

## Vorgehen (rein lesend, vier Messpunkte pro Turn)

Für jeden der sechs Turns wird dieselbe Messkette gefahren, damit die zwei Ausfälle gegen vier Referenzen bestehen:

1. **Pre-Clip-Ebene** — Pre-Clip-MP4 herunterladen, Mund-ROI-Bewegungsenergie über die Dauer messen. Ergebnis: Ist im Input bereits ein statisches Gesicht (Plate-Standbild im Fenster) oder ein normal bewegtes?
2. **Provider-Output-Ebene** — das von sync.so zurückgegebene Segment-Artefakt zur jeweiligen `external_job_id` abrufen und dieselbe Mund-ROI-Energie messen. Ergebnis: Hat der Provider überhaupt Lippenbewegung erzeugt (Provider-No-op) oder nicht?
3. **Provider-Antwort-Ebene** — die zum Job persistierten Provider-Rückgabefelder (Status, Warnungen, erkannte Gesichter, Audio-Dauer vs. Video-Dauer) auslesen und mit den vier bestandenen Turns vergleichen.
4. **Paste-Back-/Stitch-Ebene** — die Stitch-/Mux-Payload lesen: Zeitfenster, Ziel-Box und Reihenfolge pro Segment. Prüfen, ob das Segment für T4/T6 zeitlich oder räumlich falsch bzw. gar nicht in die finale Platte zurückgeschrieben wurde.

Zusätzlich wird geprüft, ob die pro Turn verwendete Audiospur (Länge, Sprechenergie, Start-Offset) zu dem Fenster passt, in dem das Segment im finalen MP4 sitzt.

## Ergebnis (das einzige Artefakt dieses Schritts)

Ein Root-Cause-Lock, der genau eine der Stufen benennt:

- A: Pre-Clip-Input war bereits ohne Bewegung → Ursache vor dem Provider.
- B: Provider hat ein bewegungsloses Ergebnis geliefert (No-op / kein Face gefunden / Audio-Video-Dauer-Mismatch) → Ursache beim Provider-Aufruf.
- C: Provider-Ergebnis hatte Bewegung, ging aber beim Paste-Back/Stitch verloren (falsches Fenster, falsche Box, überschrieben) → Ursache in der Mux-Stufe.

Dokumentiert wird das in `docs/v433-motion-studio-final-acceptance.md` als eigener Abschnitt mit den gemessenen Zahlen pro Turn (Bewegungsenergie Pre-Clip, Bewegungsenergie Provider-Output, Fenster laut Stitch-Payload). Kein Fix-Vorschlag im selben Schritt — erst nach dem Lock.

Abschluss: `FA-4 T4/T6 ROOT-CAUSE-LOCK = <A|B|C> → STOP`. FA-5 bleibt gesperrt.

## Technische Details

- Datenquellen: `composer_pipeline_jobs` (Run `8b0f659d-7e40-41e5-9761-e870709824ff`, Stage `sync_segment`, `external_job_id`, `metadata.pass_idx`), `video_renders` (`dialog-pass-preclip`, `content_config.face_crop`), `composer_scenes.dialog_turns` sowie das fertige `processed_video_url`.
- Messung: ffmpeg-Frame-Extraktion + Mund-ROI-Differenzenergie, identische ROI-Definition wie in der bereits gefahrenen visuellen Abnahme, damit die Werte vergleichbar sind.
- Ausgeschlossen: jede Änderung an `compose-dialog-segments`, `_shared/plate-face-candidates.ts`, `_shared/pass-face-preclip.ts`, `sync-so-webhook` und jede Migration.
