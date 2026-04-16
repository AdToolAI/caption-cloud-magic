

## Root Cause
Die **deployte Edge Function `compose-video-clips`** ist veraltet. Im Repo ist `webhook_events_filter: ["completed"]` korrekt, aber die laufende Version sendet noch `["completed", "failed"]` → Replicate antwortet mit **422 für jeden einzelnen Clip** (Hailuo, Kling, Sora gleichermaßen).

Beweis aus Live-Logs:
```
422 Unprocessable Entity: webhook_events_filter.1 must be one of: 
"start", "output", "logs", "completed"
```

## Fix-Plan

### 1. Re-Deploy `compose-video-clips`
Der Code im Repo ist bereits korrekt (Zeile 209 + 235 = `["completed"]`). Es reicht, die Function neu zu deployen, damit die Live-Version dem Repo entspricht. Ich werde dafür eine minimale Touch-Änderung (Comment-Bump mit Versions-Marker) machen, damit der Deploy garantiert greift.

### 2. Klarere Fehler-Toasts im Client
`ClipsTab.tsx` zeigt aktuell den vollen Replicate-Stacktrace im Toast. Ich kürze das auf eine lesbare Meldung wie *"Generierung fehlgeschlagen — bitte erneut versuchen"* + Detail in der Konsole.

### 3. Verify
- Nach Deploy: "Alle generieren" auf einem 30s/4-Szenen-Brief
- Header zeigt €4.50 → Toast €4.50 → **alle 4 Szenen wechseln auf `generating` (kein 422)**
- Nach ~30–60s: Webhook setzt sie auf `ready`

### Was unverändert bleibt
- DB-Schema, Types, Pricing-Matrix, Quality-Tier-System
- Briefing/Storyboard/Audio/Export Tabs
- Andere AI-Studio Functions (separate Aufgabe)

