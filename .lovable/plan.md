

## Feature: Speed Ramping passt Szenen-Dauer automatisch an

### Idee

Wenn ein Speed-Keyframe auf eine Szene angewendet wird (z.B. 0.5x Slow Motion), soll die Szene automatisch länger werden (doppelt so lang bei 0.5x). Bei 2x Speed wird die Szene halb so lang. Das entspricht "True Slow Motion" — die Timeline dehnt/staucht sich.

### Wie es funktioniert

Formel: `neue Dauer = Original-Dauer / durchschnittliche Speed`

Beispiel:
- Szene ist 4s lang, Speed-Keyframe auf 0.5x → Szene wird 8s
- Szene ist 4s lang, Speed-Keyframe auf 2x → Szene wird 2s
- Mehrere Keyframes: gewichteter Durchschnitt der Speeds

### Technische Umsetzung

**1. `src/pages/DirectorsCut/DirectorsCut.tsx`**

Im `onSpeedKeyframesChange`-Callback (Zeile 737): Nach dem Speichern der Keyframes die betroffenen Szenen anpassen:

- Für jede Szene mit szenen-spezifischen Keyframes den durchschnittlichen Speed berechnen
- `original_start_time` / `original_end_time` als Referenz nutzen (existiert bereits im Typ)
- Neue `end_time` berechnen: `start_time + (originalDuration / avgSpeed)`
- Alle nachfolgenden Szenen auf der Timeline verschieben (cascade)
- `playbackRate` der Szene aktualisieren (existiert bereits im Typ)

**2. `src/components/directors-cut/features/SpeedRamping.tsx`**

- Neue Prop `onSceneDurationChange?: (sceneId: string, newDuration: number, avgSpeed: number) => void`
- Nach jeder Keyframe-Änderung bei szenen-spezifischen Keyframes den avgSpeed berechnen und callback aufrufen
- Visuelles Feedback: Anzeige wie sich die Szenendauer ändert (z.B. "4.0s → 8.0s")

**3. `src/components/directors-cut/steps/MotionEffectsStep.tsx`**

- `onSceneDurationChange` Prop durchreichen von DirectorsCut → MotionEffectsStep → SpeedRamping

### Betroffene Dateien

1. `src/pages/DirectorsCut/DirectorsCut.tsx` — Szenen-Dauer bei Speed-Änderung anpassen + Cascade
2. `src/components/directors-cut/features/SpeedRamping.tsx` — avgSpeed berechnen, Callback + UI-Feedback
3. `src/components/directors-cut/steps/MotionEffectsStep.tsx` — Prop durchreichen

