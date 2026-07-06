## Kontext / Ist-Zustand

Nach v189 sind alle Lipsyncs korrekt zugeordnet (richtiger Sprecher, richtige Mund-Koordinaten). Einziger sichtbarer Rest-Bug in der 3-Sprecher-Szene: **Sprecher 1 bewegt die Lippen nach Ende seines Dialogs weiter**, während Sprecher 2/3 sprechen.

## Root Cause

Der v90-Overlay-Mux legt pro Sprecher-Turn einen `<Sequence>` mit einem Face-Mask/Crop-Overlay des Sync.so-Outputs **nur im Turn-Fenster** [start, end] auf die Master-Plate. Außerhalb dieses Fensters wird die rohe Hailuo-Master-Plate durchgereicht. Obwohl der Plate-Prompt „mouths stay softly closed" fordert, produziert Hailuo bei N≥2 sichtbar oft leichte Idle-Mund-Bewegung für nicht-sprechende Charaktere — sichtbar sobald deren Turn vorbei ist.

Es existiert bereits das v183-System `SilentFaceAnchor` (statisches Closed-Mouth-Portrait pro Face-Slot) inklusive Component in `DialogStitchVideo.tsx` und Mux-Logik in `render-sync-segments-audio-mux/index.ts`. Zwei Probleme:

1. **Feature-Flag `composer.silent_faces_v183` ist standardmäßig OFF** → v183 wird nie aktiv.
2. **Silent-Slots hängen an einzelnen Shots** (nur innerhalb der `<Sequence>` eines aktiven Overlays sichtbar). In den Lücken zwischen Turns und nach dem letzten Turn eines Sprechers fehlt jegliche Silent-Cover → rohe Plate leakt durch.

## v190 Fix (2 chirurgische Änderungen, keine neuen Konzepte)

### Fix 1 — Globale Silent-Anchor-Basis-Ebene (P0)

**Datei:** `src/remotion/templates/DialogStitchVideo.tsx`

Neues optionales Prop `globalSilentSlots?: SilentSlot[]` an `DialogStitchVideoProps`. Wird **einmal** direkt über der Master-Plate und **unter** allen Fanout-Shots gerendert — spannt die volle Szenendauer:

```
[master plate (video/img)]
  → [globalSilentSlots × <SilentFaceAnchor>] ← NEU, spannt gesamte Szene
  → [tail-freeze (v182, unverändert)]
  → [fanout shots × <Sequence>] (aktive Sync.so-Overlays, ihre Fenster überdecken die Anchor-Tiles)
```

Da `SilentFaceAnchor` maskierte Standbilder rendert (keine `<Video>`, kein `<Freeze>` mit Motion) und die aktiven Sync.so-Overlays denselben Face-Slot mit voller Deckkraft überschreiben, gibt es keinen Konflikt: im Turn-Fenster gewinnt die animierte Overlay, außerhalb bleibt das Standbild.

### Fix 2 — Mux liefert `globalSilentSlots` + Feature-Flag defaults ON (P0)

**Datei:** `supabase/functions/render-sync-segments-audio-mux/index.ts`

- Wenn `isFanout && donePasses.length ≥ 2`: das bereits berechnete `silentSlotBySpeakerIdx` (Zeilen 282–305) einmal als flaches Array `globalSilentSlots` in den Render-Payload einhängen — **alle Speaker**, nicht wie bei per-shot `silentSlots` „alle außer der aktuelle".
- Per-shot `silentSlots` **entfernen** (redundant, sobald die globale Ebene existiert). Reduziert Payload-Größe und vermeidet Doppel-Rendering.
- Default des Flags `composer.silent_faces_v183` auf `true` setzen (Fallback bleibt: fehlt der DB-Row, gilt `true`). Bestehende explizite `false`-Zeilen im `system_config` bleiben respektiert (Kill-Switch für Rollback).

### Nicht angefasst

- v90 Overlay-Mux-Fenster (SHOT_PAD_START/END), Sync.so-Payload, sync_mode=loop, v169 Tight-Slice, v182 Tail-Hold, v189 Identity-Trust-Gate, Preclip-Pipeline, Coordinate-Space-Logik. Der Fix ist rein additiv auf der Compositing-Ebene.

### N-Skalierung

- N=1: kein Fanout → globalSilentSlots leer, kein Effekt (v182 Tail-Hold bleibt zuständig).
- N=2, 3, 4: greift identisch; jeder nicht-sprechende Face-Slot ist zu jedem Zeitpunkt durch ein statisches Closed-Mouth-Portrait abgedeckt, sofern nicht gerade sein eigener Sync.so-Overlay aktiv ist.

### Fallback / Sicherheit

- Speaker ohne gültiges `preclip_crop` oder ohne `portrait_url` (Fallback: dunkles Halbtransparenz-Tile aus dem bestehenden `SilentFaceAnchor`-Fallback-Zweig) werden weiterhin geschützt.
- Kill-Switch: `UPDATE system_config SET value='false' WHERE key='composer.silent_faces_v183'` → Verhalten fällt exakt auf v189 zurück.

### Verifikation

1. 3-Sprecher-Szene neu rendern; Sprecher 1's Face-Region visuell prüfen zwischen Turn-Ende und Sprecher 2/3-Turns → statisches Portrait, keine Idle-Mund-Bewegung.
2. Edge-Log muss zeigen: `v183_silent_slots ENABLED speakers=3 crops=3 anchors=3 fallback=0` (bzw. entsprechende Zahlen für N=4).
3. Aktive Turns unverändert korrekt lipsynct (Regression-Check gegen v189-Referenz).
