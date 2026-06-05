# Befund

Der Lip-Sync selbst läuft jetzt sauber (v56, sync-3, auto_asd_fallback). Das Problem liegt **eine Ebene tiefer in der Video-Plate** selbst:

- `source_clip_url` ist ein einzelnes 9s Hailuo-i2v-Clip (1376×768, Prompt: "Samuel, Matthew und Kailee sprechen abwechselnd in die Kamera…").
- Hailuo i2v erfindet bei langen Dialog-Prompts gerne einen **Kamera-Cut/Push-In** mitten im Clip. In diesem Fall: erste ~2-3s 3-Shot, danach Close-Up auf Charakter 2 (Matthew).
- Sync-3 lief mit `retry_no_asd: true` (Auto-Speaker-Detection). Auto-ASD nimmt pro Segment "den sichtbaren Mund" — im Close-Up ist nur Matthews Mund sichtbar, also bekommt **Matthew auch Kailees Zeile (Turn 3)** auf seine Lippen geklebt.
- `v50_segments_auto_fallback: 3` und `plate_detected: false` bestätigen: es gab keine echte Plate-Probe, die Koordinaten kommen aus dem Anchor-Frame (Drei-Shot), passen aber nach dem Hailuo-internen Cut nicht mehr zum tatsächlichen Bildinhalt.

**Es ist also kein Sync.so-Bug mehr — es ist ein Plate-Bug.** Wir geben Sync-3 eine Plate, die innerhalb des Clips das Subjekt wechselt.

# Plan

## 1. Locked-Camera Prompt-Guard für Dialog-Plates (compose-dialog-scene)
Für jede Szene mit ≥2 Sprechern beim Hailuo/Seedance-Render automatisch erzwingen:
- Prompt-Prefix: *"LOCKED static camera on tripod. No cuts, no zoom, no push-in, no pull-out, no pan. All speakers remain in frame for the entire duration. Only mouths and subtle facial expressions move."*
- Negative-Prompt-Hard-Inject: *"camera cut, scene change, zoom in, zoom out, push in, dolly, pan, close-up, shot change, new shot, different angle".*
- Wo möglich `camera_fixed: true` (Seedance) bzw. äquivalente Provider-Flags setzen.

## 2. Plate-Stability-Probe vor Lip-Sync-Dispatch (compose-dialog-segments)
Bevor das Plate-Clip an Sync.so geschickt wird:
- Mit ffmpeg-via-edge (oder bestehendem `plate-probe`-Helper) **4-6 Frames** (gleichmäßig über die Clip-Dauer) ziehen und über bestehende Face-Detection laufen lassen.
- Wenn die Anzahl/Position der Gesichter zwischen Frames > Toleranz abweicht (Anzahl ändert sich, oder Hauptface-Position springt >25 % der Breite), **Plate als instabil markieren**.
- Bei instabiler Plate: bis zu **2× Auto-Regenerate** mit verstärktem Locked-Camera-Prompt (Schritt 1). Danach Aufgabe → klare Fehler-UI ("Plate wechselte das Motiv, bitte Szene neu generieren / anderes i2v-Modell wählen").

## 3. Sync-3 ASD-Strategie bei instabilen Plates schärfen
- Solange `plate_detected: false` UND mehrere Sprecher: `retry_no_asd` deaktivieren und stattdessen mit den **Anchor-Koordinaten pro Turn** (Manual Point) fahren. Auto-ASD bei Multi-Speaker ist genau der Mechanismus, der hier die falsche Zuordnung produziert hat.
- Logging in `dialog_shots.asd_mode`: `manual_anchor_locked` vs `auto_asd_fallback`, damit wir solche Fälle künftig direkt erkennen.

## 4. Diagnose & Re-Run der konkreten Szene
- Szene `e72a361c-a03d-48bc-ba52-ee83b5a22aa7` über `reset-lipsync-scene` zurücksetzen, **zusätzlich** den Plate-Clip neu rendern lassen (nicht nur den Lip-Sync), damit die neue Locked-Camera-Policy greift.
- Dispatch-Log soll danach zeigen: `plate_stable: true`, `asd_mode: manual_anchor_locked`.

# Erwartetes Ergebnis

- Hailuo liefert konsistente 3-Shot-Plate über die volle Szenenlänge.
- Falls Hailuo doch einen Cut macht, wird die Plate **vor** Sync.so erkannt und ein neuer Versuch gestartet — kein verschwendetes Sync.so-Budget mehr.
- Jeder Speaker bekommt seinen Anchor-Punkt, sodass Auto-ASD nicht mehr im Close-Up Matthews Mund mit Kailees Audio koppelt.

# Technische Notizen

- Betroffene Files (read-only bisher gesichtet):
  - `supabase/functions/compose-dialog-scene/index.ts` (Plate-Prompt + Provider-Flags)
  - `supabase/functions/compose-dialog-segments/index.ts` (Plate-Probe vor Dispatch, ASD-Strategie)
  - `supabase/functions/sync-so-webhook/index.ts` (Retry-Pfad ohne ASD nur noch zulassen wenn `plate_stable: true`)
  - Neuer Helper `_shared/plate-stability.ts` (Frame-Sampling + Face-Diff)
- Neue Memory: `mem/architecture/lipsync/v57-locked-plate-and-stability-probe.md`
- Keine Migration nötig — alle neuen Felder leben in `dialog_shots`/`audio_plan.twoshot` JSONB.
