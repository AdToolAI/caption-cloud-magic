## Diagnose (bestätigt aus Phase-1-Logs)

Sync.so liefert nur `"error": "An unknown error occurred."` — keine weiteren Felder. Die echte Ursache ist aber im Payload-Muster sichtbar:

- **Turn 0** (`segments_secs: [[0, ~2.3]]`) → ✅ erfolgreich
- **Turn 1 + 2** (`segments_secs: [[2.26, 3.43]]` bzw. `[[3.44, 6.52]]`) → ❌ FAILED, beide mit `frame_number: 0`

Das Problem: `active_speaker_detection.coordinates` werden bei `frame_number: 0` gesampelt — also am Anfang des Master-Videos — während Sync.so erst ab Sekunde 2.26+ überhaupt verarbeitet. An Frame 0 sitzt der Sprecher selten an genau den Pixelkoordinaten, die später aus dem Anchor extrahiert wurden. Sync.so findet keine Face an `(605,269)` bei Frame 0 → silent failure. Turn 0 funktioniert nur, weil dessen Fenster bei 0 startet.

## Fix (eine Datei, ~30 Zeilen Diff)

`supabase/functions/poll-dialog-shots/index.ts` → `startSyncTurnJob`:

1. **Primary: `auto_detect: true` im Turn-Fenster.** Statt fixe Coords + `frame_number: 0` schicken wir `active_speaker_detection: { auto_detect: true }` zusammen mit den per-Turn `segments_secs`. Sync.so erkennt dann den Sprecher selbst innerhalb des Fensters — robust gegen leichte Camera-Moves, exakt das was die [Lipsync-Pro-Policy](mem://architecture/lipsync/sync-so-pro-model-policy) für Auto-Detect bereits als Fallback vorsieht.

2. **Fallback bei `auto_detect`-Failure: Coords + korrekter `frame_number`.** Falls Sync.so im ersten Versuch trotzdem failed (z.B. zwei Gesichter im Frame, kein klares Voiced-Signal), retry mit den bisherigen Coords aus FaceMap, aber `frame_number = round(turn.startSec * fps)` (24fps Hailuo-Default, optional aus Master-Clip-Probe). Damit sampelt Sync.so Coords im Turn-Fenster statt am Video-Anfang.

3. **Diagnostik beibehalten.** Phase-1-Logging bleibt aktiv — falls auch der Fallback failed, sehen wir es sofort.

## Was sich NICHT ändert

- Kein Concurrency-Pool (alle 3 Turns weiter parallel — Concurrency war nicht die Ursache, Turn 0 lief ja parallel zu 1+2 und kam durch).
- Keine Window-Mindestlänge, keine Padding-Strategie (Längen waren ausreichend).
- Keine UI-Änderung, keine DB-Migration, keine Credit-Logik (idempotenter Refund existiert bereits).
- `compose-twoshot-lipsync`/`compose-dialog-scene` bleiben unverändert.

## Verifikation

1. Edge Function deployen.
2. User triggert eine 3-Turn-Dialog-Szene neu.
3. `supabase--edge_function_logs poll-dialog-shots` lesen: erwartet `auto_detect=true` Pfad, alle 3 Turns ready.
4. Falls noch Failures: Fallback-Pfad mit `frame_number=…` greift automatisch, wir sehen den ursprünglichen Sync.so-Response.

## Geänderte Dateien

- `supabase/functions/poll-dialog-shots/index.ts` (nur `startSyncTurnJob` + neuer 1× Retry mit Fallback-Coords).

Keine neue Edge Function, keine DB-Migration, keine UI-Änderung.
