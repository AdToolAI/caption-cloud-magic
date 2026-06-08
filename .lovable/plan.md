## Was ist passiert

Szene **ac7fe4d8** (Szene 1 von Projekt `df044489…`):

- `clip_status='failed'`, `clip_url=NULL`, `retry_count=1`
- `dialog_mode=true`, `lip_sync_status='pending'`, `twoshot_stage=NULL`
- letzter Update vor ~30 min, kein `clip_error`

Der eigentliche Clip-Render (Hailuo/HappyHorse-Plate) ist gescheitert, aber `lip_sync_status` wurde nicht zurückgesetzt. Dadurch:

- Der Pre-Flight-Gate im Auto-Trigger (`useTwoShotAutoTrigger.ts:340`) verwirft die Szene als Kandidat, weil `clip_status !== 'ready'` und weder `clip_url` noch `audio_plan.twoshot.url` da sind → es wird nie etwas dispatched.
- Der UI-Status (`progressActive` / "Lipsync" Pill) hängt an `lip_sync_status='pending'` → endloser Spinner.
- Der `lipsync-watchdog` greift hier nicht, weil sein Filter nur `running/audio_muxing` oder `pending+circuit_open/deferred` abdeckt — eine **pending-ohne-Stage-und-ohne-Clip**-Szene ist für ihn unsichtbar.

Keine offenen Sync.so-Jobs, keine `dialog_dispatch_locks`. Es ist ein reines State-Leak, kein Provider-Hänger.

## Plan

### 1. Sofortige Entsperrung der hängenden Szene
SQL-Migration (idempotent), die alle Szenen mit dem genannten kaputten State sauber zurücksetzt:

```sql
UPDATE composer_scenes
SET lip_sync_status = NULL,
    twoshot_stage   = NULL,
    clip_error      = COALESCE(NULLIF(clip_error,''),
                               'auto-reset: clip_failed_with_dangling_lipsync_pending'),
    updated_at      = now()
WHERE dialog_mode = true
  AND lip_sync_status = 'pending'
  AND lip_sync_applied_at IS NULL
  AND (clip_url IS NULL OR clip_url = '')
  AND (clip_status IN ('failed','pending') OR clip_status IS NULL)
  AND updated_at < now() - interval '5 minutes';
```

Damit verschwindet der UI-Spinner sofort und der User kann Szene 1 neu generieren.

### 2. Root-cause in `compose-video-clips`
Im per-Szene Error-Handler (beide Stellen bei den `lip_sync_status: "pending"`-Markierungen, Zeile 2149 und 2755): wenn der Clip-Render fehlschlägt **bevor** ein Master-Clip + Audio-Plan existieren, in derselben Transaction `lip_sync_status = NULL`, `twoshot_stage = NULL` mitschreiben. So bleibt nach einem Clip-Fail kein Fake-„Lipsync pending" zurück.

### 3. Watchdog-Safety-Net in `lipsync-watchdog`
Filter erweitern um einen dritten OR-Zweig:

```
and(lip_sync_status.eq.pending,
    twoshot_stage.is.null,
    clip_url.is.null)
```

…und im Loop: wenn so ein Row älter als `STALE_PREFLIGHT_MS` (2 min) ist, hart auf `lip_sync_status=NULL` zurücksetzen mit `clip_error='watchdog: orphaned_lipsync_pending_no_clip'`. Kein Credit-Refund nötig (es gab nie einen Sync.so-Job).

### 4. Doku
Kurze Memo-Datei `mem/architecture/lipsync/orphaned-pending-after-clip-fail.md` + Eintrag in `mem/index.md`.

## Betroffene Dateien
- neue Migration unter `supabase/migrations/`
- `supabase/functions/compose-video-clips/index.ts` (2 Stellen)
- `supabase/functions/lipsync-watchdog/index.ts` (Filter + neuer Reset-Zweig)
- `mem/architecture/lipsync/orphaned-pending-after-clip-fail.md` (neu)
- `mem/index.md`

Keine Änderungen an Sync.so-Logik, Pre-Flight-Gates oder Multi-Speaker-Pipeline.
