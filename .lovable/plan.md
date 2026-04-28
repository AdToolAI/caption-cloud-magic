## Problem

Scene 3 (Luma Ray 2, 7 Sekunden) schlägt sofort fehl. Replicate's `luma/ray-2-720p` Modell akzeptiert **nur 5 oder 9 Sekunden** als Dauer (siehe `src/config/lumaVideoCredits.ts` → `allowedDurations: [5, 9]`).

Die Edge Function `compose-video-clips` übergibt aber jeden Wert zwischen 5 und 10:

```ts
duration: Math.min(Math.max(scene.durationSeconds, 5), 10),  // 7 → 7 ❌
```

Replicate lehnt 7s ab → Prediction failed → Scene-Status "Fehlgeschlagen".

Das gleiche Problem besteht latent für **Wan 2.5** (erlaubt 5/10) und **Seedance** (erlaubt 5/10) – nur Hailuo (Zeile 301) und Veo (531) snappen bereits korrekt auf erlaubte Werte.

## Lösung

In `supabase/functions/compose-video-clips/index.ts` für die drei betroffenen Engines die Dauer auf das **nächstgelegene erlaubte Discrete-Value** snappen:

```ts
// Helper am Anfang der Datei
function snapDuration(seconds: number, allowed: number[]): number {
  return allowed.reduce((best, val) => 
    Math.abs(val - seconds) < Math.abs(best - seconds) ? val : best
  , allowed[0]);
}
```

Anwendung:
- **Luma** (Zeile 494): `duration: snapDuration(scene.durationSeconds, [5, 9])` → 7s wird zu 5s
- **Wan 2.5** (Zeile 430): `duration: snapDuration(scene.durationSeconds, [5, 10])`
- **Seedance** (Zeile 462): `duration: snapDuration(scene.durationSeconds, [5, 10])`

## Zusätzlich: Auto-Director Planung

`auto-director-compose` plant Szenen oft mit krummen Dauern (6, 7, 8s). Damit der Composer die geplante Dauer nicht stillschweigend ändert, sollte der Auto-Director beim **Engine-Mapping** ebenfalls auf die erlaubten Dauern snappen, bevor er Szenen anlegt. Sonst zeigt die UI 7s an, gerendert wird aber 5s → Diskrepanz zur Audio-/VO-Spur.

→ Im Auto-Director nach dem Engine-Routing eine analoge `snapDuration`-Funktion auf `scene.durationSeconds` anwenden (basierend auf der `recommendedEngine`).

## Bonus: Bessere Fehlermeldung

Aktuell bleibt die Szene auf "Fehlgeschlagen" ohne klare Ursache. In `compose-clip-webhook` beim Failure-Path die `payload.error`-Message in `composer_scenes.error_message` schreiben, damit der "Erneut versuchen"-Button kontextualisiert werden kann.

## Geänderte Dateien

1. `supabase/functions/compose-video-clips/index.ts` – `snapDuration` helper + Anwendung auf Luma/Wan/Seedance
2. `supabase/functions/auto-director-compose/index.ts` – Snap pro Engine bei Szenen-Erstellung
3. `supabase/functions/compose-clip-webhook/index.ts` – Error-Message persistieren

## Test

Nach Deploy: Scene 3 mit "Erneut versuchen" antriggern → sollte mit `duration: 5` an Luma gehen und erfolgreich rendern.
