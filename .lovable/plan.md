## Befund

Die Sync.so-3-Requests sind zwar inzwischen syntaktisch gültig und laufen durch, aber die sichtbare Ausgabe bleibt „Frozen“, weil unsere Pipeline weiterhin nicht dem empfohlenen Multi-Speaker-Workflow entspricht.

Wesentliche Abweichungen:

1. **Multi-Speaker wird mit `auto_detect: true` auf Preclips gefahren**
   - Sync.so empfiehlt Auto-Detect nur für Single/obvious-speaker-Clips.
   - Für mehrere Personen soll deterministisch mit `frame_number + coordinates` oder `bounding_boxes(_url)` gearbeitet werden.
   - Unsere v104-Payloads nutzen auf jedem 512x512-Preclip `active_speaker_detection: { auto_detect: true }`.

2. **Preclip-Video und Audio sind zeitlich nicht zuverlässig identisch**
   - Die Log-Probe zeigt Preclips von ca. 1.1–3.1s, aber Telemetrie/Audio-Diagnostik weiterhin 9s-Full-Timeline-WAVs mit Lead-ins bis ~7s.
   - Wenn Sync.so auf einem kurzen Preclip zuerst Stille/idle Audio sieht, ist das erwartbare Ergebnis: Job completed, aber keine sichtbare Mundanimation.

3. **Unsere Telemetrie validiert nicht den echten Payload**
   - `audio_diagnostics`, `audio_probe` und `audio_full_sec` kommen teilweise aus den ursprünglichen per-speaker Full-Length-Tracks, nicht aus der tatsächlich gesendeten `payload.input[].audio.url`.
   - Dadurch wurde „bbox_count=0 / 201 / completed“ korrekt gemeldet, aber nicht geprüft, ob Sync.so wirklich passendes Audio+Video bekam.

4. **Alte Kommentare/Logik widersprechen sich**
   - Der Code enthält bereits eine v97-Strategie „Multi-Speaker full-plate + bbox-url-pro“, aber der tatsächliche Lauf ging trotzdem über `preclip-sync3-autodetect-v104`.
   - Das deutet auf stale `preclip_url`/FaceMap-State oder Gate-Order-Probleme hin: ein bestehender Preclip gewinnt gegen die eigentlich bessere Sync.so-3-Multi-Speaker-Route.

## Plan

1. **Sync.so-3 Multi-Speaker Standardpfad umstellen**
   - Für N≥2 keine `auto_detect`-Preclips mehr als Standard verwenden.
   - Standard wird: Full plate video + `sync-3` + `active_speaker_detection` mit deterministischem Target:
     - bevorzugt `bounding_boxes_url`, wenn Plate-Identity/FaceMap vorhanden ist
     - sonst `frame_number + coordinates`
   - `auto_detect: true` bleibt nur für echte Single-Face-Crops oder Single-Speaker-Szenen ohne Mehrpersonen-Kontext.

2. **Stale Preclip-State neutralisieren**
   - Beim Fresh-Dispatch für Multi-Speaker vorhandene `preclip_url`, `preclip_crop`, `preclip_duration_sec` ignorieren oder löschen.
   - Damit kann ein alter v104-Preclip nicht erneut den Sync.so-3-konformen Full-Plate-Pfad übersteuern.

3. **Payload-Audio wirklich prüfen**
   - Direkt vor dem Sync.so-POST die tatsächlich gesendete Audio-URL (`pass.audio_url`) inspizieren.
   - Loggen: echte Payload-Audiodauer, Lead-in, voiced seconds, peak, bytes.
   - Wenn Payload-Audio und Videofenster stark auseinanderlaufen, Dispatch blockieren statt „grün“ laufen lassen.

4. **Tight-Audio und Preclip-Fenster angleichen**
   - Falls Preclip weiterhin als Fallback genutzt wird, muss Audio exakt zum Preclip-Fenster passen: keine Full-Timeline-Leadin-WAVs an kurze Preclips.
   - Sync.so bekommt dann entweder:
     - Full plate + Full/segment-konforme Timeline mit deterministic speaker selection, oder
     - Short preclip + short audio ab t=0.
   - Keine Mischform „short video + 9s silence-padded audio“.

5. **Telemetry v105 hinzufügen**
   - Neuer Probe-Block: `stage: sync3-fullplate-deterministic-v105` oder `singleface-preclip-v105`.
   - Felder: `dispatch_video_kind`, `payload_audio_dur_sec`, `payload_audio_lead_in_sec`, `payload_video_dur_sec`, `asd_shape`, `has_bounding_boxes_url`, `has_coordinates`, `auto_detect`.
   - Erfolgskriterium: Bei Multi-Speaker darf `auto_detect=true` nicht mehr auftauchen.

6. **Betroffene Szene sauber neu starten**
   - Szene `ddde37a6-9334-4286-8aa4-528d8a8f4a5e` resetten:
     - `lip_sync_status` zurücksetzen
     - `clip_error` löschen
     - stale Preclip-Felder aus `dialog_shots.passes[]` entfernen
   - Danach neu dispatchen und prüfen:
     - 4 Sync.so-Jobs mit `sync-3`
     - Full-plate deterministic speaker targeting
     - keine `auto_detect`-Preclips bei N=4
     - finale Ausgabe zeigt sichtbare Mundbewegung pro Sprecher.

## Technische Details

Relevante Stellen:

- `supabase/functions/compose-dialog-segments/index.ts`
  - Pass-/Audio-Slicing: ca. Zeilen 1993–2089
  - Preclip-Gate und v104 `auto_detect`: ca. Zeilen 2300–2594
  - `bbox-url-pro`/Coordinates-ASD: ca. Zeilen 2596–2687
  - Sync.so payload POST: ca. Zeilen 2834–2892

- `supabase/functions/render-sync-segments-audio-mux/index.ts`
  - Overlay/Stitching der einzelnen Sync.so-Ausgaben: ca. Zeilen 164–305

- Sync.so Docs-Abgleich:
  - Auto-detect: nur für single/obvious speaker sinnvoll.
  - Multi-Speaker: `frame_number + coordinates` oder `bounding_boxes(_url)`; `auto_detect=false` für manuelle Auswahl.

## Verifikation

Nach Implementierung:

1. Query `syncso_dispatch_log` für die Szene.
2. Bestätigen:
   - `payload_model = sync-3`
   - `dispatch_video_kind = full_plate` für alle 4 Sprecher
   - `auto_detect != true`
   - `bounding_boxes_url` oder `coordinates` vorhanden
   - echte Payload-Audiodauer passt zur gewählten Dispatch-Strategie
3. Finale `clip_url` öffnen/prüfen, dass die vier Sprecher sichtbar den Mund bewegen.