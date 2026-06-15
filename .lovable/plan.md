## Sync.so 3 — Offizielle Anleitung vs. unsere Pipeline

Quelle: `https://sync.so/docs/models/sync-3.md` + `https://sync.so/docs/developer-guides/speaker-selection.md` + `…/api/generate-api/create.md`.

### Was die offizielle sync-3 Doc sagt

1. **Endpunkt unverändert**: `POST /v2/generate`, nur `"model": "sync-3"`. ✅ Bei uns korrekt (`SYNC3_MODEL = "sync-3"`).
2. **Verbotene Options für sync-3** (explizit "not applicable"):
   - `temperature`
   - `reasoning_enabled`
   - `occlusion_detection_enabled`
3. **Erlaubte Options**: `sync_mode` (für Video) + `active_speaker_detection` (ASD).
4. **ASD — exklusive Felder**: entweder
   - `auto_detect: true` (nur Video, single/obvious speaker), **oder**
   - `frame_number` + `coordinates` (eine Referenz, in Pixel-Space des Videos), **oder**
   - `bounding_boxes` / `bounding_boxes_url` (eine Box **pro Frame**, `null` wenn kein Gesicht in dem Frame). Wenn Boxes gesetzt sind, **kein** `frame_number`/`coordinates` mehr nötig.
5. **Image-Input** (nur sync-3): `frame_number: 0` + `coordinates`; `auto_detect` ist verboten. `sync_mode` wird ignoriert.

### Gaps in unserer Pipeline (verifiziert in `compose-dialog-segments/index.ts`)

| # | Doc-Anforderung | Aktuell | Wo | Konsequenz |
|---|---|---|---|---|
| G1 | `temperature` ist für sync-3 verboten | Wird im Default-Payload gesetzt (`syncOptions = { sync_mode, temperature: 0.5 }`) und nur im **Preclip-Branch** wieder gelöscht | L3057-3064, Delete nur in L3154 | Im Full-Plate-Path (`!usePassPreclip`) geht `temperature` mit raus → reproducible `provider_unknown_error` (eigene Memory v106 dokumentiert es bereits) |
| G2 | `occlusion_detection_enabled` ist für sync-3 verboten | Wird im Full-Plate-Path **explizit aktiviert** | L3105-3107 | Gleiches `provider_unknown_error`-Risiko wie G1; Doc sagt: ist in sync-3 automatisch eingebaut |
| G3 | `bounding_boxes` ist eine **Per-Frame**-Liste mit `null` wo der Sprecher nicht im Bild ist | Wir füllen jedes Frame mit **derselben statischen Box** (`new Array(frameCount).fill(box)`) | L158, `uploadBoundingBoxesJson` | Sync.so sieht "Sprecher A ist überall" und kann in Frames, wo A's Mund verdeckt/abgewandt ist, an einem **Nachbargesicht** lippensynchronisieren → "pixelige Pflanze über Mund" / "nur Sprecher 4 spricht" |
| G4 | Bei vorhandenen `bounding_boxes` **kein** zusätzliches `frame_number`/`coordinates` setzen | Wir setzen in einigen Retry-Varianten beides | L3198-3201 vs. L3203+ | Sync.so dokumentiert die Felder als sich ausschließend |
| G5 | Wenn Preclip face-count !== 1 → wir fallen auf `bbox-url-pro` zurück (gut), aber `temperature`/`occlusion` werden vor diesem Fallback **nicht** wieder gestrippt | L3076-3100 (Reset von Variant, nicht von Options) | Re-trigger geht mit toxischen Defaults raus |
| G6 | Vor sync.so kommt unsere **Anchor-Stage** — aktuell `anchor_identity_failed` bei Szene 90d620a6 (Samuel männlich → Frau, Kailee dunkel → blond) | Anchor-Stage gibt nach 2 Retries auf, UI zeigt aber endlos "Szene wird gebaut…" | `compose-dialog-scene` / `SceneCard.tsx` | Sync.so wird gar nicht erst erreicht; UI-State-Bug verschleiert das |

### Plan (v124 — "sync-3 doc-strict end-to-end")

#### 1. `supabase/functions/compose-dialog-segments/index.ts` — Payload-Sanitizer
- **Single Source of Truth** für `model === "sync-3"`: direkt vor dem `fetch(SYNC_API_BASE + "/generate")` einen `sanitizeSync3Options(options)` einfügen, der unwiderruflich entfernt:
  - `temperature`
  - `reasoning_enabled`
  - `occlusion_detection_enabled`
  - jegliche Felder, die nicht in `{ sync_mode, active_speaker_detection }` whitelisted sind
- ASD-Mutex: wenn `active_speaker_detection.bounding_boxes` **oder** `bounding_boxes_url` gesetzt sind, `frame_number` und `coordinates` löschen.
- Falls `coordinates` fehlt aber `auto_detect: false` → harter Throw (statt Sync.so 500).
- Initialer Default in L3057 wird auf `{ sync_mode: payloadSyncMode }` reduziert (kein `temperature` mehr by default).
- Log-Tag: `v124_sync3_sanitize` (vor jedem fetch) mit den gestrippten Keys.

#### 2. Per-Frame Bounding-Boxes statt Static-Fill
- In `uploadBoundingBoxesJson` (~L135-160) und dem inline `bounding_boxes`-Pfad (`coords-pro-box`, ~L3203+):
  - Pro Pass den **Voiced-Window-Range** (`frame_start..frame_end` aus `pass.frames` / tightAudioInfo) berechnen.
  - Frames **innerhalb** des Windows → Per-Frame-Box aus `faceMap[frame]` (falls vorhanden) oder Fallback auf die statische Box.
  - Frames **außerhalb** → `null`.
  - Schema: `{ bounding_boxes: ([x1,y1,x2,y2] | null)[] }`, Länge === totalFrames.
- Memory-Note: Doc-Beispiel L116-126 ist genau dieses Muster ("`null` where no box is present").

#### 3. ASD-Mutex im Code statt nur in Reviews
- In den Retry-Varianten `coords-pro` / `sync3-coords` / `coords-pro-lp2pro` (L3191-3202) UND `coords-pro-box`/`bbox-url-pro` (L3203+) sicherstellen, dass nur **eine** ASD-Form pro Request reingeht. Beide Wege bauen das ASD-Objekt jetzt **neu** statt zu mergen.

#### 4. Anchor-Stage-Failure sichtbar machen (UI-State-Sync)
- `src/components/composer/SceneCard.tsx`: Wenn `clip_status === 'failed'` mit `clip_error` → statt Spinner eine rote/gelbe Fehlerbox + "🎥 Clip + Lip-Sync neu rendern"-Button rendern. Realtime-Channel `composer_scenes` auf `clip_status`/`clip_error` lauschen.
- Watchdog im Frontend: wenn Scene >3min im `pending/generating` ohne `updated_at`-Bump → DB neu fetchen.

#### 5. One-shot DB-Recovery für die hängende Szene
- SQL für `90d620a6-8abd-4210-b210-fc558de0c62e`:
  - `clip_status = 'pending'`, `clip_error = NULL`, `twoshot_stage = NULL`, `lip_sync_status = NULL`.
  - Eintrag in `scene_anchor_cache` für diese Szene `DELETE`, damit der nächste Render einen frischen Anchor versucht (oder direkt full-plate ohne Anchor, wenn die Identitäts-Reproduktion weiter scheitert).

#### 6. Memory & Index
- Neu: `mem/architecture/lipsync/v124-sync3-doc-strict-end-to-end.md` mit:
  - Liste der erlaubten/verbotenen Options (kopiert aus Doc),
  - Per-Frame-Bbox-Schema,
  - ASD-Mutex-Regel,
  - Pointer auf v106 (vorgänger), das nur den Preclip-Branch gefixt hatte.
- `mem/index.md` Eintrag.

#### 7. Deployment & Verifikation
- Deploy: `compose-dialog-segments`.
- Re-trigger Szene `90d620a6`. In den Function-Logs nach `v124_sync3_sanitize stripped=[temperature,occlusion_detection_enabled]` greppen → Beweis, dass kein doc-illegales Feld mehr rausgeht.
- DB-Check: nach 5 min `pass_idx 0..3` aller `dialog_shots` von Szene `90d620a6` → alle `status='done'` mit eigenem `output_url`, keiner mehr `provider_unknown_error`.

### Was bewusst NICHT in diesem Plan ist

- Anchor-Identity-Reproduktion (Nano Banana 2 verwechselt Geschlecht/Haar): separater Fix-Track, hier nur UI-Sichtbarkeit + DB-Reset, damit Sync.so überhaupt erreicht wird.
- Migration der Legacy `lipsync-2`/`lipsync-2-pro`-Calls in `lip-sync-video/index.ts` (anderer Code-Pfad, nicht im Composer-Dialog).

### Erwartetes Resultat

- Keine `provider_unknown_error` mehr durch doc-illegale Options.
- Multi-Speaker-Szenen: jeder Sprecher animiert in seinem eigenen Voiced-Window, Nachbargesichter werden während fremder Turns auf `null` gesetzt → keine "Pflanze über Sprecher 2/3"-Artefakte mehr.
- Anchor-Fail wird sofort in der UI sichtbar mit Re-Render-Knopf, kein 8-min-Spinner mehr.
