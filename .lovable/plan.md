

## Plan: KI-Szenenanalyse — Echte Schnitterkennung statt Ratespiel

### Problem
Die KI erfindet Szenen-Schnitte, auch wenn das Video keine echten Schnitte hat. Bei einem 60s-Video mit 2 Szenen a 30s erkennt sie 5 "Szenen". Ursachen:

1. **Frame-Extraktion scheitert** (CORS) — 0 Frames werden gesendet
2. **Fallback-Prompt sagt "Erwarte 2-5 Szenen"** — AI füllt das Minimum
3. **Kein klarer Hinweis**, dass Kamerabewegung/leichte Änderungen KEINE Schnitte sind

### Änderungen

**1. Edge Function `supabase/functions/analyze-video-scenes/index.ts`**

**Prompt überarbeiten (beide Pfade: mit Frames + ohne Frames):**
- Klare Anweisung: "Nur ECHTE HARTE SCHNITTE zählen. Kamerabewegung, Zoom, Schwenk = KEIN Schnitt"
- "Wenn keine Schnitte erkennbar sind, gib NUR 1 Szene zurück"
- "Erwarte 2-5 Szenen" entfernen — stattdessen: "Gib so viele Szenen zurück wie es echte Schnitte gibt. Das können auch nur 1-2 sein."
- Explizit betonen: "Farbänderungen, leichte Perspektivwechsel, gleiche Szene aus ähnlichem Winkel = KEIN Schnitt"

**Fallback-Szenen konservativer:**
- `generateFallbackScenes`: Für 60s nur 2 Szenen statt 4 (eine pro 30s statt pro 15s)
- Generell: `sceneCount = Math.max(1, Math.ceil(duration / 30))` statt `/15`

**Stabilisierung verschärfen:**
- `MIN_SCENE_DURATION` von 0.8s auf 3.0s erhöhen — Szenen unter 3s werden zusammengeführt
- `MAX_SCENES_PER_10S` von 3 auf 1 reduzieren (max 6 Szenen für 60s)

**2. Client-seitig `src/pages/DirectorsCut/DirectorsCut.tsx`**
- `MIN_SCENE_DURATION` client-seitig ebenfalls von 1.5s auf 3.0s erhöhen (Zeile 528)

### Ergebnis
Die KI meldet nur echte harte Schnitte. Ein 60s-Video mit 2 Szenen a 30s wird korrekt als 2 Szenen erkannt, nicht als 5.

