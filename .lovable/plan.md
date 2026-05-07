## Problem

Talking-Head schlägt mit `HEYGEN_AVATAR_LIMIT` (HTTP 400, code `401028`: "exceeded your limit of 3 photo avatars") fehl.

Logs zeigen:

```
prune: photo_avatar list 404, trying avatar.list
prune (avatars): 0 total, 0 deletable, deleting 0
HeyGen talking_photo upload status=400 … 401028 … exceeded your limit of 3 photo avatars
```

Ursache: Das Quota „3 Photo Avatars" lebt auf dem **`talking_photo`**-Endpoint, nicht auf `photo_avatar/photo/list` (404 für unseren Plan) und auch nicht auf `/v2/avatars` (filtert die 3 hochgeladenen Talking-Photos heraus → 0 Treffer). Der Prune findet daher nichts zu Löschendem, obwohl das Konto voll ist.

Beim letzten Fix wurde `pruneLegacyTalkingPhotos` (über `/v1/talking_photo.list`) entfernt, weil sie minutenlang über HeyGen-Presets lief. Genau dort liegen aber auch die echten User-Uploads, die jetzt das Quota blockieren.

## Fix (eine Datei)

`supabase/functions/generate-talking-head/index.ts` — `pruneHeyGenTalkingPhotos` erweitern um einen dritten, **smart begrenzten** Fallback auf `/v1/talking_photo.list`:

1. Bestehende Reihenfolge bleibt: `/v2/photo_avatar/photo/list` → `/v2/avatars` (photo-only).
2. **Neuer Fallback** wenn beide oben 0 deletable lieferten: `GET /v1/talking_photo.list`.
   - Ergebnisliste **rückwärts** durchgehen (User-Uploads sind typischerweise am Ende neuer als die Preset-Bibliothek).
   - Pro Eintrag `DELETE /v2/talking_photo/{id}` versuchen.
   - **Hard-Cap auf 30 Versuche pro Aufruf** (≈ < 5 s, da HeyGen-DELETE schnell antwortet).
   - **Early-Exit nach 3 erfolgreichen Deletes** (200/204) — das räumt das volle 3er-Kontingent komplett frei und stoppt sofort.
   - 404 = Preset → still ignorieren, weiterzählen.
   - `preserveId` (gecachter QA-Talking-Photo-Id aus `system_config.qa.heygen_talking_photo_id`) niemals löschen.
3. Logging: `prune (talking_photo v1 fallback): tried=N, deleted=K, skipped404=M`.
4. Sonst nichts ändern — Upload-Pfad, TTS, Video-Erzeugung, Background-Polling, Refund- und QA-Mock-Logik bleiben unverändert.

## Verifikation

1. `generate-talking-head` deployen.
2. Im Motion Studio "Talking-Head erstellen" mit Bild + Skript "Welcome to DroneOcular!" auslösen.
3. Edge-Logs erwartet:
   - `prune (avatars): 0 total, 0 deletable, deleting 0`
   - `prune (talking_photo v1 fallback): tried=…, deleted=3, skipped404=…`
   - `HeyGen talking_photo upload status=200`
   - `HeyGen video_id=…`
4. UI: grüner „Talking-Head wird generiert"-Toast statt rotem Fehler. Function antwortet < 30 s.
5. Sollte HeyGen das Konto später erneut mit „nur Presets" antworten (z. B. weil der User schon manuell aufgeräumt hat), ist der Fallback ein No-Op und der Upload geht direkt durch.

## Out of Scope

- Keine Frontend-, DB-, Storage-, Refund- oder Polling-Änderungen.
- Kein Eingriff in Lip-Sync, QA-Preset oder andere Edge Functions.
- Kein neuer Endpoint, keine Schema-Änderungen.
