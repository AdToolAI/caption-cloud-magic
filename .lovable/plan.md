## Problem

Im Inspector (rechte Seite) hast du `Trim Start` auf **2,10s** gesetzt — der Clip wird aber weder auf der Timeline kürzer, noch passiert visuell irgendetwas. Grund:

Die Trim-Inputs schreiben aktuell **nur** das Feld `clip.trimStart` (Audio-Playback-Offset). Sie fassen `clip.startTime` und `clip.duration` **nicht** an. Das heißt:
- Timeline-Balken bleibt 14,9s breit
- Audio spielt intern zwar ab 2,1s, aber der Clip belegt weiter den vollen Slot → wirkt "kaputt"

Die **Handle-Drags** (Ziehen am Clip-Rand) machen es korrekt: `startTime`, `duration` und `trimStart/trimEnd` werden zusammen bewegt (siehe `CapCutEditor.tsx:1015-1028`). Die Inspector-Inputs spiegeln diese Logik nicht.

Es gibt zusätzlich keinen expliziten **"Anwenden / Schneiden"**-Button neben den Inputs — Nutzer erwarten sichtbares Feedback.

## Fix (Welle 6.1 — Inspector Trim wiring)

**Datei:** `src/components/directors-cut/studio/CapCutPropertiesPanel.tsx`

1. **`Trim Start`-Input umverdrahten**  
   Beim Ändern:
   - `delta = newTrimStart - clip.trimStart`
   - `startTime += delta`
   - `duration -= delta` (min 0.1s)
   - `trimStart = newTrimStart`
   
   → Clip schrumpft links, springt korrekt weiter rechts an — identisch zum Left-Handle-Drag.

2. **`Trim End`-Input umverdrahten**  
   Beim Ändern:
   - `duration = newTrimEnd - clip.trimStart` (min 0.1s)
   - `trimEnd = newTrimEnd`
   
   → Clip schrumpft rechts — identisch zum Right-Handle-Drag.

3. **Zweiter (duplizierter) Trim-Block (Zeilen 437–470)**  
   Gleiche Logik anwenden — aktuell doppelter Code mit dem gleichen Bug.

4. **UX-Verbesserungen im Trim-Panel**  
   - Read-only Anzeige "Länge: X.XXs" unter den beiden Inputs (aktuell `Dauer` = `duration`, aber ohne Live-Update sichtbar)
   - Neuer Button **"Am Playhead schneiden"** direkt im Trim-Block (ruft bestehende `handleSplitAtPlayhead`-Funktion), damit Splitten von genau dem Clip auch aus dem Inspector geht
   - Kleiner Hinweistext: *"Trim kürzt die sichtbare Länge auf der Timeline."*

5. **Value-Formatierung**  
   Inputs verwenden `.toFixed(2)` — dadurch springt der Cursor. Auf `defaultValue` + `onBlur` umstellen (oder Debounce), damit `2,1` beim Tippen nicht auf `2,10` snapt und weiterspringt.

## Technische Änderungen

```
src/components/directors-cut/studio/CapCutPropertiesPanel.tsx
  - updateClip({trimStart}) → updateClipWithGeometry({trimStart}) 
    (bewegt startTime/duration mit)
  - Analog für trimEnd → duration
  - Neue kleine Helper-Funktion applyTrim(edge: 'start'|'end', value)
  - Neuer Button "Am Playhead schneiden" (props: onSplitAtPlayhead)
  - Numeric-Input: value → defaultValue + onBlur/onKeyDown Enter
src/components/directors-cut/studio/CapCutEditor.tsx
  - handleSplitAtPlayhead als Prop an <CapCutPropertiesPanel /> durchreichen
```

## Nicht geändert

- Keine Änderungen an Render-Pipeline, Preview-Player, oder Audio-Ducking
- Keine Änderungen an der Split-Logik selbst (`S`-Taste, Toolbar-Button funktionieren weiter)
- Handle-Drag am Clip-Rand bleibt unverändert (funktioniert bereits korrekt)
