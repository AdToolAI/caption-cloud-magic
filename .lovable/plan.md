## Problem

Aktuell zeigt die Mediathek `512 / 500` Videos und `10.06 / 10 GB`. Ursachen:

1. Der neue DB-Trigger zählt **nur `video_creations`** (jetzt korrekt auf 500 begrenzt: 500/500 für den betroffenen User).
2. Zusätzlich liegen **31 Video-Einträge in `content_items`** (Universal Creator / Kampagnen), die im UI on-top gezählt werden → 500 + 31 + 1 Demo = 512.
3. Für die **10 GB Speichergrenze gibt es überhaupt keinen Server-Enforcer** – die Schätzung im Frontend kann beliebig überlaufen.
4. Manuelle Uploads werden über `enforceLimits` blockiert, aber **AI-/Render-Pipelines schreiben ungebremst** in `video_creations` und `content_items`.

## Ziel

Es darf **nie** möglich sein, mehr als 500 Videos oder mehr als 10 GB zu haben — egal aus welcher Quelle (Upload, KI-Studios, Renderer, Composer, Universal Creator, Director's Cut, Kampagnen).

## Plan

### 1. DB-Trigger erweitern (neue Migration)

Eine neue Funktion `enforce_user_video_library_limits(_user_id, max_videos=500, max_storage_mb=10240)` führt **nach jedem relevanten Insert/Update**:

- **Video-Cap (500 total):** Zählt `video_creations(status='completed')` **+** `content_items(type='video')` (über Workspace-Mitgliedschaft) zusammen. Löscht überschüssige Einträge nach `created_at ASC` — älteste zuerst, quellenübergreifend.
- **Storage-Cap (10 GB):** Summiert `media_assets.size_bytes` + `content_items.file_size_mb` + geschätzte 20 MB pro `video_creations`-Row ohne Größe. Löscht älteste Einträge bis unter 10 GB.
- Idempotent + `SECURITY DEFINER` + `search_path=public`.

Trigger jeweils `AFTER INSERT OR UPDATE` auf:
- `video_creations` (ersetzt bestehenden Trigger)
- `content_items` (neu, nur wenn `type='video'`)
- `media_assets` (neu, für Uploads)

### 2. One-Shot Backfill

In derselben Migration: für jeden User mit Überlauf einmalig `enforce_user_video_library_limits()` ausführen, sodass sofort `≤ 500 Videos` und `≤ 10 GB` gilt.

### 3. Storage-Bucket-Cleanup

Beim Löschen einer `video_creations`-Row mit interner Storage-URL (`director-cut-renders`, `motion-studio-clips`, `talking-head-renders` …) auch das zugehörige Storage-Objekt entfernen — über eine `BEFORE DELETE`-Trigger-Funktion, die `storage.objects` per RPC bereinigt (best-effort, ignoriert Fehler).

### 4. Realtime-Sync Frontend

`MediaLibrary.tsx` lauscht bereits auf `video_creations DELETE` — zusätzlich auch auf `content_items DELETE` und `media_assets DELETE` subscriben, damit das UI sofort auf den neuen Stand aktualisiert.

### 5. Demo-Video aus Zählung ausnehmen

Der "Demo Video"-Platzhalter wird aktuell mitgezählt (zeigt 1 extra wenn der User unter 500 ist). Im Counter (`videoCount`) Demo-IDs explizit ausfiltern, damit `500 / 500` exakt stimmt.

## Technische Details

**Neue Migration:** `supabase/migrations/<timestamp>_enforce_global_video_limits.sql`
- Funktion `enforce_user_video_library_limits`
- 3 Trigger (`video_creations`, `content_items`, `media_assets`)
- `BEFORE DELETE` Trigger für Storage-Cleanup auf `video_creations`
- DO-Block für Backfill aller Über-Limit-User

**Frontend:** `src/pages/MediaLibrary.tsx`
- Realtime-Subscriptions für `content_items` und `media_assets` `DELETE` Events
- `videoCount` filtert `isDemoVideo()` raus

Keine API-Breaking-Changes; alle KI-Studios und Renderer profitieren automatisch.
