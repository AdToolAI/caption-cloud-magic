

## Problem

Die Logs zeigen klar: Gemini erkennt 4 "Boundaries" — bei 0.0s, 0.9s, 29.9s und 30.9s. Nach Filterung bleiben 0.9s und 29.9s. Das erzeugt eine Mikro-Szene von 0–0.9s (unter 1 Sekunde), die offensichtlich ein Halluzinations-Artefakt ist.

Die echte Grenze ist nur bei ~30s. Die 0.9s-Boundary ist Rauschen.

## Ursache

`buildDeterministicScenes()` prüft nur `t > lastStart + 0.5` — erlaubt also Szenen ab 0.5s Länge. Die Stabilisierungs-Policy von 3.0s Mindestdauer wird hier nicht angewendet.

## Lösung

**Datei: `supabase/functions/analyze-video-scenes/index.ts`**

1. **`buildDeterministicScenes()`**: Mindest-Szenenlänge von 3.0s durchsetzen. Boundaries die Szenen unter 3s erzeugen würden, werden verworfen.

2. **`detectScenesFromVideo()`**: Boundaries zu nah am Anfang (< 3s) oder Ende (> duration - 3s) herausfiltern, da diese fast immer Artefakte sind.

## Ergebnis

- 0.9s-Boundary wird verworfen (zu nah am Anfang, erzeugt Mikro-Szene)
- 29.9s-Boundary bleibt → 2 Szenen: 0–29.9s und 29.9–60s

