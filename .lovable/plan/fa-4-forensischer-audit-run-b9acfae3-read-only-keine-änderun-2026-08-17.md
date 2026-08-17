# FA-4 Forensischer Audit — Run b9acfae3 (read-only, keine Änderungen)

Alle Angaben sind erhobene Ist-Daten. Keine Ursachenhypothese, kein Fix, kein Render.

## 1. Run / Scene

| Feld | Wert |
|---|---|
| run_id | b9acfae3-8121-45ba-950a-9a1ad5373f5a |
| scene_id | e658509d-cdeb-40f7-bd33-98e74144fdc5 (S11, order_index 10) |
| T_run_start | 2026-08-17 20:38:31Z (erster Ledger-Job 20:38:45Z) |
| T_run_end | 2026-08-17 20:49:22.477Z (scene.updated_at = audio_mux finished) |
| Gesamtlaufzeit | 10 min 51 s |
| pipeline_state | complete |
| lip_sync_status | done |
| clip_status | ready |
| plate_generation | 1 → 2 (alle Jobs des Runs tragen plate_generation = 2) |
| active_run_id | b9acfae3… (unverändert) |

Chronologie der Statuswechsel (Ledger + syncso_dispatch_log):

```text
20:38:45  base_video acquire (ai-happyhorse, ext 4jebpxfnf5rmt0d025st6bq6ag)
20:44:30  base_video succeeded
20:44:46  DISPATCH_ATTEMPT_STARTED (sync-segments)
20:45:31  Pass 1 gestartet (preclip p1)
20:45:54  sync_segment #1 im Ledger
20:46:01  Pass 1 DISPATCHED (HTTP 201)
20:46:04-05 DISPATCH_ATTEMPT_STARTED x3
20:46:42/43/47/49  Pässe 3 und 4 im Ledger + DISPATCHED
20:47:05/11  Pass 2 im Ledger + DISPATCHED
20:47:52  sync_segment #1 succeeded
20:48:01/09/23/31  sync_segments #2–#4 succeeded
20:48:03/07  Pass 5 im Ledger + DISPATCHED
20:48:16/23  Pass 6 im Ledger + DISPATCHED
20:49:00  sync_segment #6 succeeded  → audio_mux acquire (remotion)
20:49:22  audio_mux succeeded, Szene complete
```

Fehler / Warnings / Timeouts / Cancels:
- Keine `error_code` in `composer_pipeline_jobs`, kein Job mit Status ≠ `succeeded`, kein Cancel, kein Retry (alle `attempt_no = 1`), `retry_count = 0`, `fallback_history = []`, `refunded = false`.
- 6 nicht-blockierende Warnings: `FACE_GATE_PROBE_UNAVAILABLE` / `error_class = face_probe_unavailable`
  (`v251_anchor_missing_probe_unavailable:no_cache_no_server_extract; source=none — dispatch will proceed unchecked`),
  je einmal pro Pass 0–5, jeweils mit `non_blocking: true`; der Dispatch lief danach jeweils weiter (HTTP 201).
- Hinweis: `composer_scene_runs` enthält für diesen Run keine Zeile (Tabelle ist projektweit leer, 0 Zeilen). Run-Wahrheit liegt in `composer_pipeline_jobs` + `composer_scenes.dialog_shots`.

## 2. Erwartete vs. tatsächliche Dauer

| Stufe | Dauer |
|---|---|
| angeforderte Szenendauer | 15,0 s (`composer_scenes.duration_seconds`) |
| Base-Video (HappyHorse) | Video 15,0417 s / Audio 15,1627 s / Container 15,1627 s, 1284×718, 24 fps |
| Preclips (pro Pass) | 1,645 / 1,447 / 1,633 / 1,726 / 1,532 / 2,740 s (Summe 10,72 s) |
| Sync-Segment-Outputs | 1,667 / 1,467 / 1,633 / 1,733 / 1,533 / 2,767 s (720×720, 30 fps, je mit AAC) |
| Timeline vor Stitch | Turn-Fenster 0,000–11,653 s (letztes Turn-Ende 11,653 s) |
| nach Stitch / nach Audio-Mux | identisch: ein einziger Remotion-Job erzeugte Stitch+Mux |
| Datei in processed_video_url | Video 15,000 s / Audio 15,0827 s / Container 15,0827 s, 1284×718, 30 fps, 8.891.024 Bytes |

Feststellung zu Kürzung/Abbruch: Es gibt keine Kürzung gegenüber der angeforderten Szenendauer — der finale Container ist 15,08 s bei 15 s Anforderung. Die Dialog-Timeline selbst endet bei 11,653 s; die restlichen ~3,35 s der 15-s-Platte enthalten keinen Dialog. Kein Job endete vorzeitig, kein Abbruch, kein Timeout.

## 3. Jobs dieses Runs (Ledger, chronologisch)

| created | started | completed | stage | job_id | att | status | provider | external_job_id | error |
|---|---|---|---|---|---|---|---|---|---|
| 20:38:45 | 20:38:45 | 20:44:30 | base_video | f58fb52a | 1 | succeeded | ai-happyhorse | 4jebpxfnf5rmt0d025st6bq6ag | – |
| 20:45:54 | 20:45:54 | 20:47:52 | sync_segment (pass 0) | 48c2a40a | 1 | succeeded | sync.so | b345cc40 | – |
| 20:46:42 | 20:46:42 | 20:48:01 | sync_segment (pass 2) | f1487aec | 1 | succeeded | sync.so | 137e2942 | – |
| 20:46:43 | 20:46:43 | 20:48:23 | sync_segment (pass 3) | 8c54e4cd | 1 | succeeded | sync.so | eee5e6d6 | – |
| 20:47:05 | 20:47:05 | 20:48:09 | sync_segment (pass 1) | 01bcf9d9 | 1 | succeeded | sync.so | b282a1bf | – |
| 20:48:03 | 20:48:03 | 20:48:31 | sync_segment (pass 4) | ff4f3194 | 1 | succeeded | sync.so | 6c797595 | – |
| 20:48:16 | 20:48:16 | 20:49:00 | sync_segment (pass 5) | 6f9d23ea | 1 | succeeded | sync.so | d795d8f5 | – |
| 20:49:00 | 20:49:00 | 20:49:22 | audio_mux | d106144d | 1 | succeeded | remotion | c5a53235 | – |

Alle acht Jobs haben `callback_delivery_status = succeeded`, `plate_generation = 2`, `ledger_source = v431_g31b_acquire`.
Es existieren im Ledger **keine** eigenen Stages für `preclip`, `stabilizer` oder `stitch` — Preclip läuft inline in `compose-dialog-segments` (Storage `lipsync-plates/shared/…/p{n}-preclip-*.mp4`, `preclip_used: true` pro Pass), Stitch ist Teil des einen Remotion-`audio_mux`-Renders (`render_id = c5a53235`).
Für die Szene existieren insgesamt genau diese 8 Jobs; keine Jobs aus anderen Runs.

## 4. Dialog-Turns (6, kanonisch aus `dialog_turns`)

| # | dialog_turn_id | Sprecher (speakerIdx) | Text | Fenster (start–end) | Audio (TTS) | Status |
|---|---|---|---|---|---|---|
| 0 | 55385e38 | Sarah Dusatko (0) | „Der Testlauf startet jetzt." | 0,000–1,625 | pass-1-tight-…144.wav (1,645 s) | done |
| 1 | ab0ba4bd | Samuel Dusatko (1) | „Alle Werte sind sauber." | 1,875–3,408 | pass-3-tight-…113.wav (1,633 s) | done |
| 2 | a4d8e837 | Matthew Dusatko (2) | „Die Schnitte sitzen gut." | 3,658–5,190 | pass-5-tight-…590.wav (1,632 s) | done |
| 3 | 9a0bd588 | Kay Mark (3) | „Dann geben wir frei." | 5,440–8,180 | pass-6-tight-…296.wav (2,840 s) | done |
| 4 | 1a97a4e2 | Sarah Dusatko (0) | „Gut, wir bleiben dabei." | 8,430–9,777 | pass-2-tight-…855.wav (1,447 s) | done |
| 5 | 162210e9 | Samuel Dusatko (1) | „Bericht folgt am Morgen." | 10,027–11,653 | pass-4-tight-…965.wav (1,726 s) | done |

4 stabile speaker_idx (0–3), bijektiv zu 4 Character-IDs; wiederkehrende Sprecher behalten ihren Index. `assignmentLock` (v277_anchor_rekognition_complete) belegt 4 Slots.

## 5. Sync-Segmente

| pass | segment_id (= dialog_turn.id) | start | end | Dauer (Fenster) | Input-Video | Input-Audio | Output | Status |
|---|---|---|---|---|---|---|---|---|
| 0 | 55385e38 | 0,000 | 1,625 | 1,625 | p1-preclip-5a998337… | pass-1-tight | …-lipsync-pass-1.mp4 (1,667 s) | done |
| 1 | 1a97a4e2 | 8,430 | 9,777 | 1,347 | p2-preclip | pass-2-tight | …-lipsync-pass-2.mp4 (1,467 s) | done |
| 2 | ab0ba4bd | 1,875 | 3,408 | 1,533 | p3-preclip | pass-3-tight | …-lipsync-pass-3.mp4 (1,633 s) | done |
| 3 | 162210e9 | 10,027 | 11,653 | 1,626 | p4-preclip | pass-4-tight | …-lipsync-pass-4.mp4 (1,733 s) | done |
| 4 | a4d8e837 | 3,658 | 5,190 | 1,532 | p5-preclip | pass-5-tight | …-lipsync-pass-5.mp4 (1,533 s) | done |
| 5 | 9a0bd588 | 5,440 | 8,180 | 2,740 | p6-preclip | pass-6-tight | …-lipsync-pass-6.mp4 (2,767 s) | done |

`set(segment_id) == set(dialog_turns.id)` (6 = 6, keine Duplikate). Alle Fenster liegen innerhalb von 0–15 s der finalen Timeline; kein Fenster überlappt ein anderes; größte Lücke 11,653–15,000 s (kein Dialog vorgesehen).

## 6. Stitch

- Kein separater Stitch-Job; Stitch und Mux sind derselbe Remotion-Lambda-Render `c5a53235-2fbb-420c-b296-8ed01e25784f` (dispatched 20:49:02.648Z, finished 20:49:22.477Z).
- Eingegangene Segmentoutputs: `…-lipsync-pass-1..6.mp4` (alle sechs, jeder Pass-Status `done`).
- Reihenfolge in der Timeline (nach startTime): pass1 (0,000) → pass3 (1,875) → pass5 (3,658) → pass6 (5,440) → pass2 (8,430) → pass4 (10,027).
- Erwartete Timeline: 15 s Platte (`total_sec: 15`, `video 1284×718`), Dialogfenster bis 11,653 s.
- Output: `…/renders/nn4aqyifqp/dialog-stitch-muxed-e658509d-…-1786999742405.mp4`, tatsächliche Dauer 15,00 s Video.
- Kein vorzeitiges Ende: alle 6 vorgesehenen Segmente sind enthalten (Pegelnachweis pro Fenster unter Punkt 8).

## 7. Audio-Mux (Fakten)

- Job: `d106144d`, Provider remotion, Status succeeded, attempt_no 1, Fehler/Warnings: keine.
- mux_dispatch_requested_at 20:49:00.420758Z, dispatched_at 20:49:02.648Z, finished_at 20:49:22.477Z (19,8 s Renderzeit).
- Input-Video: die 6 Lipsync-Pass-Clips über der Plate `…/composer/035273d7…/e658509d….mp4`.
- Audio-Inputs: die 6 `twoshot-vo/*-tight-*.wav` an ihren Turn-Positionen; Gain/Volume-Felder sind im Job nicht persistiert (kein Wert vorhanden).
- Output: `dialog-stitch-muxed-e658509d-…-1786999742405.mp4`, Ausgabedauer 15,0827 s (Audio) / 15,000 s (Video).

## 8. Finaler Output (ffprobe der Datei hinter processed_video_url)

| Merkmal | Wert |
|---|---|
| URL | `https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-6ul51trd3p/renders/nn4aqyifqp/dialog-stitch-muxed-e658509d-cdeb-40f7-bd33-98e74144fdc5-1786999742405.mp4` |
| Container | mov/mp4 |
| Video / Audio | h264 / aac |
| Streams | 1 Video, 1 Audio |
| Auflösung / fps | 1284×718 / 30 fps |
| Dauer | Video 15,000 s, Audio 15,0827 s, Container 15,0827 s |
| Dateigröße | 8.891.024 Bytes (8,48 MB) |
| mean / max volume | −28,0 dBFS / −7,1 dBFS |

Silence-Messung (`silencedetect -45 dB, 0,3 s`): 1,580–1,969 | 3,096–3,811 | 4,994–5,569 | 7,906–8,554 | 9,554–10,172 | 11,331–15,083 (3,751 s Endstille).

Pegel pro Turn-Fenster (mean_volume): 0,000 s −26,7 dB | 1,875 s −26,7 dB | 3,658 s −25,9 dB | 5,440 s −26,8 dB | 8,430 s −24,6 dB | 10,027 s −27,6 dB | 11,653–15,0 s −91,0 dB (digital still).

## 9. Output-Kette

```text
base_video   ai-happyhorse  .../composer/035273d7…/e658509d….mp4                15,163 s
  ↓ preclip (inline)  lipsync-plates/shared/e658509d…/p1..p6-preclip-*.mp4      1,645 / 1,447 / 1,633 / 1,726 / 1,532 / 2,740 s
  ↓ sync.so (6 Jobs)  .../e658509d…-lipsync-pass-1..6.mp4                       1,667 / 1,467 / 1,633 / 1,733 / 1,533 / 2,767 s
  ↓ stitch + audio_mux (ein Remotion-Render c5a53235)
processed_video_url  .../dialog-stitch-muxed-e658509d…-1786999742405.mp4        15,083 s
```

`processed_video_url` == `clip_url` == `dialog_shots.final_url` == Output des Renders `c5a53235`, also des letzten Jobs dieses Runs. `resolveSceneOutput()` liefert damit `source = processed`.

## 10. Neutraler Abschluss

- Kompletter Run ausgeführt: ja — 8 Jobs, alle `succeeded`, keine offenen oder abgebrochenen Stufen.
- Finale Videodauer vs. erwartete Szenendauer: 15,08 s gegenüber 15,0 s angefordert — deckungsgleich (Container-Overhang durch AAC-Frames).
- Alle vorgesehenen Dialog-Turns und Sync-Segmente vorhanden: ja — 6 Turns, 6 Segmente, `set(segment_id) == set(dialog_turns.id)`.
- Audio-Stream in der finalen Datei: ja — 1 AAC-Stream, 15,083 s, mean −28,0 dBFS, in allen 6 Turn-Fenstern messbarer Pegel.
- Hinweise auf Abbruch, Kürzung, Timeout, Cancel oder Early Exit: keine im Ledger. Erhobene Auffälligkeiten ohne Bewertung: (a) 6 nicht-blockierende `face_probe_unavailable`-Warnings, (b) Dialog endet bei 11,331 s, danach 3,751 s digitale Stille bis 15,083 s, (c) `composer_scene_runs` hat keine Zeile für diesen Run.
- `processed_video_url` zeigt nachweislich auf den finalen Output: ja — dieselbe Render-ID `c5a53235` wie der letzte (audio_mux-) Job, Zeitstempel 20:49:22.477Z identisch mit `scene.updated_at`.
