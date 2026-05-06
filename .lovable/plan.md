
## Bestätigte Ursache

DB-Beweise (gerade abgefragt):
- `video_creations` für deinen User: 209 Zeilen mit `metadata.source='motion-studio-clip'`, **alle mit `created_at = 2026-05-06 20:35:17.825355+00`** (= Zeitpunkt der Backfill-Migration von gestern).
- Echte Render-Zeit liegt aber in `composer_scenes.updated_at` (z. B. 20:17:24, 19:28:29, …).
- Sowohl Dashboard-Carousel als auch Mediathek sortieren `ORDER BY created_at DESC LIMIT N` → bei 209 identischen Timestamps liefert Postgres **eine willkürliche** 10er-/N-Auswahl. Deshalb siehst du an beiden Stellen denselben „eingefrorenen" Stapel statt deiner echten letzten Clips.
- Titel sind generisch („Video 62537168") weil das Backfill kein `metadata.title` gesetzt hat.

Neue Clips ab jetzt bekommen über den Trigger korrekt `created_at = now()` — aber 209 Backfill-Zeilen blockieren die Sortierung.

## Plan

### 1. Backfill-Timestamps korrigieren
SQL-Update auf `video_creations` für alle Composer-Clips mit dem Backfill-Stempel: `created_at` aus `composer_scenes.updated_at` (echte Ready-Zeit) übernehmen, Fallback auf `composer_projects.created_at`.

```sql
UPDATE video_creations vc
SET created_at = COALESCE(cs.updated_at, cp.created_at, vc.created_at)
FROM composer_scenes cs
JOIN composer_projects cp ON cp.id = cs.project_id
WHERE vc.metadata->>'source' = 'motion-studio-clip'
  AND vc.metadata->>'scene_id' = cs.id::text
  AND vc.created_at = TIMESTAMPTZ '2026-05-06 20:35:17.825355+00';
```

### 2. Sprechende Titel nachziehen
Titel aus Projekt-Name + Szenen-Order setzen, damit Dashboard/Mediathek nicht „Video abc12345" zeigt.

```sql
UPDATE video_creations vc
SET metadata = vc.metadata || jsonb_build_object(
  'title', COALESCE(cp.title, 'Composer-Video') ||
           ' · Szene ' || (COALESCE((vc.metadata->>'scene_order')::int, 0) + 1)
)
FROM composer_scenes cs JOIN composer_projects cp ON cp.id = cs.project_id
WHERE vc.metadata->>'source' = 'motion-studio-clip'
  AND vc.metadata->>'scene_id' = cs.id::text
  AND (vc.metadata ? 'title') = false;
```

### 3. Trigger-Funktion ergänzen (für die Zukunft)
`archive_composer_scene_to_library` so erweitern, dass sie für jede neue Composer-Szene direkt `metadata.title` (Projektname + Szene N) mitschreibt. Verhindert, dass künftig wieder generische Titel auftauchen.

### 4. Verifikation (mache ich selbst per read_query)
- `SELECT created_at, metadata->>'title' FROM video_creations WHERE source='motion-studio-clip' ORDER BY created_at DESC LIMIT 10;` → muss eine echte zeitliche Spreizung über mehrere Tage zeigen, **nicht** 10× denselben Timestamp.
- Carousel/Mediathek nach Reload → deine wirklich zuletzt erzeugten Clips erscheinen oben mit Projekt-/Szenennamen.

## Was nicht angefasst wird
- Trigger `archive_composer_scene_trg` selbst (funktioniert für neue Clips korrekt).
- Auto-Cleanup, Wallet-Logik, Composer-Renderpfad.
- Bestehende Nicht-Composer-Einträge in `video_creations`.
