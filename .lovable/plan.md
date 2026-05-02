## Problem

Der „Medien hinzufügen"-Dialog im Director's Cut bleibt leer, obwohl die Mediathek 527 fertige Videos enthält. Ursachen (in der DB verifiziert):

1. **Kaputte Query**: `AddMediaDialog` selektiert aus `video_creations` die Spalten `title` und `duration_seconds` — **die existieren in der Tabelle nicht**. Tatsächlich vorhanden: `output_url`, `thumbnail_url`, `metadata`, `customizations`. Supabase liefert dadurch leere Daten.
2. **Falsche Bilder-Quelle**: Der Dialog listet Storage-Bucket `images/{userId}/` direkt — die zentrale Mediathek nutzt aber den Bucket `media-assets` und die Tabelle `media_assets`.
3. **Fehlende Quellen**: Manuell hochgeladene Videos (`media_assets` mit `type='video'`) und AI/Campaign-Videos (`content_items`) tauchen gar nicht auf.

## Lösung

In `src/components/directors-cut/ui/AddMediaDialog.tsx` die zwei `useQuery`-Hooks ersetzen, sodass sie dieselben drei Quellen abfragen wie `MediaLibrary.tsx`:

### Videos-Tab — drei zusammengeführte Quellen
- **`video_creations`**: `status='completed'` und `output_url IS NOT NULL`. Titel/Dauer aus `metadata` oder `customizations` ableiten (Fallback: 10s).
- **`media_assets`** (`type='video'`, `user_id`): Public-URL über Bucket `media-assets`, Name aus `metadata.original_name`.
- **`content_items`** (`type='video'`): über Workspace-Lookup (`workspace_members.workspace_id`) — falls vorhanden. `thumb_url` als Quelle.

Alle drei Listen normalisieren auf `{ id, url, thumbnail_url, title, duration_seconds, created_at }`, zusammenführen, sortieren (neueste zuerst), Limit 50 pro Quelle.

### Bilder-Tab
Statt `storage.from('images').list(userId)` jetzt aus Tabelle `media_assets` mit `type='image'`, Public-URL via Bucket `media-assets`.

### UI
Keine Änderungen am Layout — die Karten zeigen weiterhin Thumbnail + Titel + Dauer. Beim leeren Zustand bleibt der bestehende Hinweis. Selektionslogik (`handleSelectVideo`/`handleSelectImage`) muss nicht angepasst werden, da die normalisierten Felder identisch heißen.

## Technische Details

- Keine Migration und kein Edge-Function-Change nötig. Reine Frontend-Korrektur.
- Query-Keys umbenennen auf `dc-add-media-videos` / `dc-add-media-images`, damit der alte falsche Cache verworfen wird.
- Workspace-Lookup mit `maybeSingle()` (User ohne Workspace soll nicht crashen).
- `content_items` werden nur einbezogen, wenn `thumb_url` gesetzt ist (sonst keine abspielbare URL vorhanden).

## Datei

- `src/components/directors-cut/ui/AddMediaDialog.tsx` (nur die beiden `useQuery`-Blöcke, Zeilen ~51–98)
