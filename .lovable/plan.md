

# Plan: Video-Ladezeit reparieren

## Problem
Das aktive Video zeigt ewig einen Spinner, weil `onCanPlay` nie feuert. Das passiert weil:
1. `preload="auto"` bei Cross-Origin S3-Videos oft nicht genug Daten lädt um `canplay` auszulösen
2. Der Spinner-Overlay verdeckt das Video komplett und verschwindet nie
3. Kein Error-Handling — wenn die URL fehlschlägt, dreht der Spinner ewig

## Lösung (1 Datei: `DashboardVideoCarousel.tsx`)

### 1. Spinner-Logik entfernen / durch sanften Fallback ersetzen
- Statt `loadedVideos` State + Spinner: Video direkt anzeigen lassen
- Nur ein kurzes Fade-In wenn das Video geladen ist (via CSS `opacity` Transition)
- `onLoadedMetadata` statt `onCanPlay` als "geladen"-Signal (feuert viel früher)

### 2. Error-Handling hinzufügen
- `onError` auf dem `<video>` Element: bei Fehler ein statisches Fallback-UI zeigen (Film-Icon + "Video nicht verfügbar")
- Fehlerhafte Videos nicht ewig laden lassen

### 3. Auto-Play robuster machen
- Im `onLoadedMetadata` Callback direkt `play()` aufrufen wenn es das aktive Video ist
- Zusätzlich `onCanPlay` als Backup behalten
- `preload="metadata"` statt `"auto"` (lädt schneller, reicht für erstes Frame + Autoplay)

