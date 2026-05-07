## Problem

Talking-Head generation hängt minutenlang und endet in einem `Edge Function returned a non-2xx status code`-Fehler.

Edge-Logs zeigen: `pruneLegacyTalkingPhotos` iteriert über **hunderte** HeyGen-Preset-IDs aus `/v1/talking_photo.list` (HeyGen liefert dort seine komplette Sample-Bibliothek) und ruft für jede einzelne `DELETE /v2/talking_photo/{id}` auf — alle antworten mit `404`. Das blockiert den eigentlichen Upload so lange, bis die Function in den Shutdown läuft, bevor das User-Bild überhaupt hochgeladen wird.

```
prune (legacy): delete 8b470bdce44948d897390a5612119db9 -> 404
prune (legacy): delete 30854db4d8104fe0b0608f3f4452bdd5 -> 404
... (100+ Zeilen, ~17 Sekunden, weiter wachsend)
LOG shutdown
```

`pruneHeyGenTalkingPhotos` über `/v2/photo_avatar/photo/list` ist bereits die korrekte Quelle für das tatsächliche User-Quota (3 Photo-Avatars). Der Legacy-Pfad ist reiner Schaden.

## Fix (eine Datei)

`supabase/functions/generate-talking-head/index.ts`:

1. **`pruneLegacyTalkingPhotos`-Aufruf entfernen** (Zeile 173) und die Funktion löschen — sie löscht nur HeyGen-Presets (immer 404) und blockiert die Function-Ausführung minutenlang.
2. **`pruneHeyGenTalkingPhotos` als alleinige Quota-Bereinigung** beibehalten — das ist der richtige Endpoint (`/v2/photo_avatar/photo/list`).
3. **Defensive Hard-Cap** in der verbleibenden Prune-Schleife: maximal 10 DELETEs pro Aufruf, damit selbst bei einer kaputten API-Antwort nie mehr als wenige Sekunden verbraucht werden.
4. Sonst nichts ändern — Upload, Video-Erzeugung, Background-Polling und Refund-Logik bleiben unangetastet.

## Verifikation

1. `generate-talking-head` deployen.
2. Im Motion Studio "Talking-Head erstellen" mit Bild + Skript "We are DroneOcular!" auslösen.
3. Edge-Logs erwartet: 1× `prune (photo_avatar): N total, M deletable, deleting M` (M ≤ 3), dann `talking_photo upload status=200`, dann `HeyGen video_id=...`.
4. UI: grüner "Talking-Head wird generiert"-Toast statt rotem Fehler-Toast; Function antwortet < 30 s.

## Out of Scope

- Keine Frontend-, DB- oder Storage-Änderungen.
- Kein Eingriff in Refund-Logik, Polling oder QA-Preset.
- Keine Änderung am Hintergrundsound-Übergang oder am Lip-Sync (separater Workstream).
