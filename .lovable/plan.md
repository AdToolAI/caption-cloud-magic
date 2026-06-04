## Befund: drei Abweichungen vom offiziellen Sync.so Segments-Spec

Quelle: https://docs.sync.so/developer-guides/segments

### 1. KRITISCH — Falsches Modell (`sync-3` statt `lipsync-2-pro`)

Die offizielle Doku zeigt in **allen** Multi-Speaker-Segments-Beispielen (Basic, Multiple Audio, optionsOverride, Multi-Speaker ASD) ausschließlich `model: "lipsync-2"` / `lipsync-2-pro`. `sync-3` wird in der Segments-Guide nirgends als unterstütztes Modell genannt.

Unsere eigene v42-Memory (`mem://architecture/lipsync/v42-lipsync2pro-segments`) hat genau diesen Punkt schon einmal gefixt:

> v41 sent the same shape against sync-3, which silently ignores `segments[]` (sync-3 is a "full-shot global" model with no segments support in the docs) — only the dominant speaker got lipsync and the job ended in opaque "An unknown error occurred." after 10–13 min.

v45 hat das Modell wieder auf `sync-3` umgestellt → **gleicher Fehler, gleiches Symptom**. Die jüngsten Failures sind damit erklärt.

### 2. `auto_detect: false` ist nicht Teil der Doku

Die Doku listet die ASD-Varianten als **exklusiv** auf:
- `auto_detect` ODER
- `v3` ODER
- `frame_number + coordinates` ODER
- `bounding_boxes` / `bounding_boxes_url`

Das offizielle Multi-Speaker-Beispiel sendet **nur** `{frame_number, coordinates}` — kein `auto_detect`-Feld daneben. Unser Payload kombiniert beide Varianten, was Sync.so als ungültig verwerfen kann.

### 3. Input-Audio-`ref_id` vs. `refId`

Doku-Beispiele:
- Top-level Input: `Audio(url=…, ref_id="audio_1")` → snake_case `ref_id`
- Innerhalb `audioInput`: `{"refId": "audio_1"}` → camelCase `refId`

Unser Code sendet im Input-Array `{ type: "audio", url, refId }` (camelCase). Die offizielle REST-Form ist `ref_id`. Beides defensiv setzen kostet nichts und macht den Job doku-konform.

## Plan v46

### A) `compose-dialog-segments/index.ts`

1. Modell zurück auf `lipsync-2-pro` (Konstante `V46_MODEL = LIPSYNC_MODEL`).
2. `active_speaker_detection` exakt wie im offiziellen Multi-Speaker-Beispiel:
   ```text
   { frame_number, coordinates: [x, y] }
   ```
   `auto_detect: false` entfernen.
3. Im Input-Array zusätzlich `ref_id` setzen (beide Schreibweisen):
   ```text
   { type: "audio", url, ref_id: "speaker_N", refId: "speaker_N" }
   ```
4. State-Felder bumpen: `version: 46`, `model: "lipsync-2-pro"`, `asd_mode: "coordinates"`, Log-Marker `v46_official_segments_payload`.
5. Defensive Pre-Dispatch-Validierung beibehalten: jedes Segment hat `audioInput.refId`, jeder `refId` existiert im Input-Array, Koordinaten innerhalb `videoDims`, Segmente sortiert. Diagnose-Summary bleibt im Log.

### B) `sync-so-webhook/index.ts`

- Akzeptierten Versions-Gate um `46` erweitern (`41 | 42 | 43 | 44 | 45 | 46`), damit Retry/Refund/Apply für v46 greifen.
- Bestehende Retry- (1x) und idempotente Refund-Pfade unverändert.

### C) Memory

- Neue Memory `v46-lipsync2pro-official-segments` als aktuelle Wahrheit.
- v41/v42/v43/v44/v45-Memories als `superseded` markieren.
- Core-Memory auf v46 aktualisieren: `lipsync-2-pro`, `segments[]`, `audioInput.refId`, `frame_number + coordinates` (ohne `auto_detect`), `sync_mode: "cut_off"`, Input mit `ref_id`+`refId`.

### D) Szenen-Reset

Erst NACH Deploy: die fehlgeschlagenen Szenen (`4992cff4…`, `7dcdcfc7…`) auf `pending` zurücksetzen, `dialog_shots` leeren, in-flight Jobs entfernen. Refund bleibt idempotent.

## Erwartetes Ergebnis

- Payload entspricht 1:1 dem offiziellen Sync.so Multi-Speaker-Segments-Beispiel.
- `lipsync-2-pro` verarbeitet `segments[]` tatsächlich (statt sie wie sync-3 stillschweigend zu ignorieren).
- `An unknown error occurred.` nach 10–13 min sollte verschwinden.
- Webhook closed v46-Jobs sauber, kein Hängenbleiben mehr.
