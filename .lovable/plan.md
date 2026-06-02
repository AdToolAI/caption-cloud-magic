## Beobachtung

Letzte 3-Sprecher-Szene (`643efb56…`):
- Pass 0 (Samuel): coords-pro → `provider_unknown_error` → Fallback **auto-pro** „erfolgreich"
- Pass 1 (Matthew): coords-pro OK
- Pass 2 (Kailee): coords-pro → `provider_unknown_error` → Fallback **auto-pro** „erfolgreich"

Alle Y-Koordinaten liegen bei `~170` (bei vermutlich 720px Plate-Höhe = obere 24 %). Plate kommt von Hailuo i2v und kann anders gecroppt sein als das Nano-Banana-Anchor-Bild, auf dem die Face-Map berechnet wurde. → Koordinaten zeigen daneben, Sync.so weist coords-pro ab.

`auto-pro` (auto_detect=true, coords gedroppt) ist bei Weitwinkel-Gruppen-Shots **nicht zuverlässig**: Sync.so trifft entweder das falsche Gesicht oder gibt das Input-Video unverändert zurück (silent passthrough). Das erklärt „nur VO, keine Lippenbewegung".

## Fix (zielgenau, 1- und 2-Sprecher unverändert)

### 1. Plate-Dimensionen probieren statt Anchor-Dim raten

`supabase/functions/_shared/twoshot-face-map.ts` — neue Helper-Funktion `probeMp4Dims(url)` (analog zu `probeImageDims`), die die ersten ~512 KiB der MP4 liest und Width/Height aus dem `tkhd`/`mvhd`-Atom extrahiert (oder fallback `ffprobe`-frei via einfachem MP4-Box-Parser; pure TypeScript, kein neuer Dep).

`supabase/functions/compose-dialog-segments/index.ts` — vor `resolveSceneFaceMap`:
1. Plate-URL = `scene.clip_url` (master_plate, bereits gerendert wenn Pass 0).
2. `plateDims = await probeMp4Dims(plateUrl)`.
3. Wenn Anchor-Bild `anchorDims` und Plate-Dims unterscheiden (Verhältnis-Mismatch > 5 %), **rescale** alle `faces[i].center` von Anchor-Space in Plate-Space:
   ```
   x_plate = x_anchor * (plate.w / anchor.w)
   y_plate = y_anchor * (plate.h / anchor.h)
   ```
4. `clampSyncCoords` mit Plate-Dimensionen statt 1280×720-Default.
5. `video_width` / `video_height` in `dialog_shots` persistieren (für Debug + Watchdog).

### 2. Auto-Fallback in Multi-Speaker-Pässen verbieten

`supabase/functions/sync-so-webhook/index.ts` — Retry-Ladder-Logik:
- 1-Speaker-Szene (`passes.length === 1`): unverändert (`coords-pro → auto-pro → auto-standard`). Auto ist hier sicher, weil nur 1 Gesicht im Frame.
- 2+-Speaker-Szene: Ladder wird auf `coords-pro → coords-standard` verkürzt. Wenn beide schlagen fehl → harter Fail mit `error_class='coords_unrecoverable'`, idempotenter Refund, `lip_sync_status='failed'`, `clip_error` mit klarer Diagnose („Face coordinates rejected by Sync.so — likely plate/anchor dimension mismatch, scene_id=…, pass=N").

Damit gibt es keine Silent-Passthroughs mehr. User sieht entweder lipsynctes Video oder einen klaren Fehler + Refund + „Neu rendern"-Button.

### 3. Diagnose-Log

`compose-dialog-segments` loggt nach Pass-Dispatch:
```
[scene=…] dispatch pass N/M speaker=X coords=[x,y] anchor=AxB plate=CxD scaled=true|false variant=coords-pro
```
So sehen wir beim nächsten Bug-Report sofort, ob das Problem an Coords-Daneben oder an Sync.so liegt.

## Was NICHT angefasst wird

- `compose-dialog-segments` Variant-Resolution-Logik (vorheriger Fix bleibt).
- `compose-twoshot-lipsync` v4 (Legacy 2-Speaker) — bleibt mit `side: left/right` und 2-Slot-Heuristik.
- 1-Speaker-Pipeline: identisch zu heute.
- 2-Speaker-Pipeline: profitiert von Plate-Probe + Rescale, bekommt aber gleiche `coords-pro → coords-standard`-Ladder ohne Auto-Fallback (Auto auf 2 Gesichtern ist genauso unsicher wie auf 3).
- Re-Host-Mechanismus aus dem letzten Fix (intermediate Pässe → Supabase Storage): bleibt.

## Recovery der bestehenden Szene `643efb56…`

Nach Deploy: User klickt im Composer auf „Lip-Sync neu rendern" → Szene wird zurück auf `pending` gesetzt, neue Pässe nutzen die korrigierten Plate-space-Koordinaten. (Wir können die Szene optional gleich im Migration-Step zurücksetzen.)

## Geänderte Dateien

- `supabase/functions/_shared/twoshot-face-map.ts` — neue `probeMp4Dims` + optional `rescaleFaceMapToDims`.
- `supabase/functions/compose-dialog-segments/index.ts` — Plate-Probe, Coord-Rescale, persistierte Plate-Dims, erweiterte Logs.
- `supabase/functions/sync-so-webhook/index.ts` — Retry-Ladder für Multi-Speaker auf `coords-pro → coords-standard` kappen, harter Fail + Refund statt Auto-Fallback.
- `mem/features/video-composer/sync-segments-dialog-pipeline` — Notiz zu Plate-Dim-Probe + No-Auto-Fallback-Policy.

## Risiken

- **Plate-Box-Parser**: einfacher MP4-Atom-Reader für `mvhd`/`tkhd`. Falls Plate exotisch encoded ist, Fallback auf `DEFAULT_DIMS = {1280,720}` mit warn-log (= heutiges Verhalten). Kein harter Crash.
- **Strenger Multi-Speaker-Fail** statt Silent-Passthrough: 3-Sprecher-Szenen schlagen jetzt eher offen fehl als „erfolgreich-aber-stumm". Das ist gewollt — Refund + klare Fehlermeldung sind besser als ein VO ohne Lippen.
