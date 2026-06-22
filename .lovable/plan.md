# Fix: Geschlossene Augen + Dauer-Nicken im Plate

## Ursache

In `supabase/functions/compose-video-clips/index.ts` enthält das `neutralTwoShotPrompt` (Zeile ~661) seit dem Ghost-Speaker-Fix die Idle-Body-Motion-Klausel:

> "small natural head bobs and weight shifts, occasional blinks and gentle eye movement"

Damit dies Hailuo/Kling tatsächlich umsetzt, übertreiben die Modelle die beiden offensichtlichsten Cues:
- **"head bobs"** → jede Person nickt durchgehend
- **"occasional blinks"** → Augen werden oft mitten im Take geschlossen festgehalten

Das `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` (Zeile ~339) hat momentan keine Negative gegen Closed-Eyes oder Head-Nodding.

## Fix (Stufe A, ~15 LOC, nur Prompts — kein Logik-Change)

### 1. `neutralTwoShotPrompt` (Zeile ~661)
Idle-Body-Klausel umschreiben:
- "small natural head bobs" → **"subtle natural weight shifts and tiny shoulder/torso adjustments (NO repeated head nodding, NO up-and-down head bobbing)"**
- "occasional blinks and gentle eye movement" → **"eyes stay open, alert and clearly visible throughout the entire clip — gaze softly engaged with the scene, only very rare natural blinks (eyes never held closed, never squinting, never sleepy)"**

Rest (breathing, locked camera, closed mouths, lip-ready geometry) bleibt 1:1.

### 2. `CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE` (Zeile ~339)
Neue Negative-Tokens an die bestehende Ghost-Speaker-Liste anhängen:
`, closed eyes, eyes closed, squinting, sleepy eyes, drowsy expression, prolonged blink, eyes held shut, head nodding, nodding head, continuous nodding, rhythmic head bobbing, head bobbing up and down, agreeing nod loop, everyone nodding`

(Kein Eingriff auf die v112-Killer-Tokens "talking mouth / lip movement / open mouth speech" — bleiben weiterhin draussen.)

### 3. `buildCinematicSyncMasterPrompt` (Zeile ~703)
Schlussklausel um einen Halbsatz ergänzen, damit der Master-Plate-Prompt selbst auch Augen + Kopf adressiert:
> "…no character produces idle mouth, jaw or lip motion in the plate itself. **Eyes stay open and alert, heads stay steady — no nodding, no head bobbing.**"

## Unverändert
- `LOCKED static camera` + Anti-Split-Screen-Negative
- Sync.so Payload / Pass-Skeleton / v170 Seeding
- Ghost-Speaker-Fix (Mund-Negative) bleibt komplett bestehen

## Verifikation
Neue 3–4-Sprecher-Szene rendern: Während Speaker 1 spricht, dürfen Speaker 2/3/4 atmen + leichte Schulter-Gewichtsverlagerung zeigen, aber **keine** wiederholten Kopfnicker und **keine** geschlossenen Augen über mehrere Frames.

## Rollback
Falls Hailuo dadurch wieder steife "Statuen" rendert (v112-ähnliche Regression): die "weight shifts + shoulder adjustments"-Klausel verstärken, statt zur alten "head bobs"-Formulierung zurückzukehren.