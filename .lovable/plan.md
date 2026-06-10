# Fix: "Lip-Sync wird gestartet" hängt ewig (Re-Run nach erfolgreichem Lauf)

## Diagnose (verifiziert in DB + Logs)
- Szene `e451083e…`: `lip_sync_status='pending'`, `twoshot_stage='master_clip'` seit 16:53 — aber `lip_sync_applied_at = 16:18` vom vorherigen, erfolgreichen Lauf ist noch gesetzt.
- Der Auto-Trigger (`useTwoShotAutoTrigger`, v23) verwirft jeden Kandidaten mit gesetztem `lip_sync_applied_at` → der neue Lauf wird nie dispatcht. Keine einzige `compose-dialog-segments`-Invocation seit 16:53; Watchdog scannt nur `running` und sieht die Szene nicht.
- Ursache: Die Re-Run-Pfade in `SceneDialogStudio.tsx` (~Z. 1238) und `ClipsTab.tsx` (~Z. 924) setzen nur `lip_sync_status='pending'`, räumen aber den alten Abschluss-Zustand nicht weg.

## Schritte

### 1. Sofort-Entstickung (Daten-Fix)
- Für Szene `e451083e-2c89-46e9-8228-8164583167f2`: `lip_sync_applied_at = NULL`, `dialog_shots = NULL`, `lip_sync_source_clip_url = NULL` setzen, `lip_sync_status='pending'`, `twoshot_stage='master_clip'` belassen.
- Der Auto-Trigger nimmt die Szene dann auf seinem nächsten 8s-Tick als frischen Kandidaten auf — Welle-D-Test läuft damit direkt los.

### 2. Code-Fix in beiden Re-Run-Pfaden
- `SceneDialogStudio.tsx`: beim Update vor `compose-video-clips`-Invoke zusätzlich `lip_sync_applied_at: null`, `dialog_shots: null`, `lip_sync_source_clip_url: null`, `twoshot_stage: null` setzen.
- `ClipsTab.tsx` (Cinematic-Sync-Pfad): identische Felder beim `pending`-Flip mitschreiben.

### 3. Selbstheilung im Auto-Trigger (Schutznetz)
- In `useTwoShotAutoTrigger`: erkennt eine Zeile mit `lip_sync_status='pending'` + gesetztem `lip_sync_applied_at` + `twoshot_stage='master_clip'` (= klarer Re-Run-Marker), wird `lip_sync_applied_at` client-seitig genullt und die Szene als Kandidat zugelassen — analog zu den bestehenden Auto-Reset-Blöcken. Verhindert, dass alte hängende Zeilen je wieder festsitzen.

## Nicht enthalten
- Keine Änderungen an Edge Functions, Watchdog oder Welle-D-Logik.
- Keine Migration nötig (nur Daten-Update + Frontend).

## Test
- Nach Entstickung: Szene startet automatisch, `compose-dialog-segments`-Logs erscheinen, Fortschritt im Overlay läuft.
- Danach einmal manuell Re-Lipsync auslösen und prüfen, dass der neue Lauf ohne manuelles Eingreifen startet (validiert Schritt 2+3).