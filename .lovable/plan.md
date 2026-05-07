## Root cause (verified live against the HeyGen API)

Das „3 Photo Avatars"-Kontingent wird bei HeyGen **nicht** auf `talking_photo`, `photo_avatar/photo/list` oder `/v2/avatars` getrackt — sondern auf **Photo Avatar Groups** unter `GET /v2/avatar_group.list` (Filter `group_type === "PHOTO"`).

Live-Probe gegen den echten Account:

```
GET /v2/avatar_group.list   → total_count: 3, alle group_type:"PHOTO", num_looks:0
DELETE /v2/avatar_group/{id}                 → 200 {"code":100}   ← funktioniert
DELETE /v2/photo_avatar_group/{id}           → 200 {"code":100}   ← Alias, funktioniert auch
DELETE /v2/photo_avatar/{id}                 → 404 "photo avatar not found"
```

Nach einer einzigen Test-Löschung sank `total_count` von 3 → 2. Damit ist eindeutig: das Kontingent sind die **Avatar-Groups vom Typ `PHOTO`**, und der bisher implementierte Prune (talking_photo v1 + photo_avatar/photo/list + /v2/avatars) räumt eine völlig andere Liste auf — deshalb `tried=30, deleted=0` in den Logs und HTTP 400 `401028` beim Upload.

Die letzten beiden verbleibenden Gruppen sind reine Reste vom 1.4.2026 mit `num_looks: 0` (offensichtlich Auto-Cleanup-Müll), die das Konto blockieren.

## Fix (eine Datei)

`supabase/functions/generate-talking-head/index.ts` → `pruneHeyGenTalkingPhotos` um einen **vorgelagerten Avatar-Group-Prune** ergänzen:

1. **Vor allen anderen Versuchen** (vor `photo_avatar/photo/list` und Co.):
   - `GET /v2/avatar_group.list`
   - Filter `group_type === 'PHOTO'`
   - Pro Gruppe `DELETE /v2/avatar_group/{id}` (Erfolg = HTTP 200 mit `code === 100`).
   - Hard-Cap: max. 5 Deletes pro Aufruf.
   - **Niemals** löschen, wenn `preserveId === group.id` ODER wenn `group.num_looks > 0` mit einem `look.id === preserveId` (Defensive: gecachter QA-Avatar wird nie weggeworfen).
   - Logging: `prune (avatar_groups): total=N, deleted=K, kept=M`.

2. Die bestehenden Fallback-Pfade (`/v2/photo_avatar/photo/list`, `/v2/avatars` photo-only, `/v1/talking_photo.list`) bleiben **unverändert** als Belt-and-Suspenders, falls HeyGen das Schema mal wieder ändert.

3. Sonst nichts ändern — Upload-Pfad, TTS, Video-Erzeugung, Background-Polling, Refund- und QA-Mock-Logik bleiben unangetastet.

## Verifikation

1. `generate-talking-head` deployen.
2. „Talking-Head erstellen" mit Skript „Welcome to DroneOcular!" auslösen.
3. Edge-Logs erwartet:
   ```
   prune (avatar_groups): total=2, deleted=2, kept=0
   HeyGen talking_photo upload status=200
   HeyGen video_id=…
   ```
4. UI: grüner „Talking-Head wird generiert"-Toast statt rotem Fehler. Antwort < 30 s.
5. Bei nachfolgenden Renders ist `total=1, deleted=1` (nur die frische Gruppe vom letzten Render wird wieder freigeräumt).

## Out of Scope

- Keine Frontend-, DB-, Storage-, Refund- oder Polling-Änderungen.
- Kein Eingriff in QA-Preset, Lip-Sync oder andere Edge Functions.
- Kein Schema-Wechsel auf HeyGen v3 (laut HeyGen v1/v2 bis 31.10.2026 stabil).
