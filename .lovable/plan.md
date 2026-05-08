## Problem

Der amber Badge **„⚠️ 2 Sprecher · splitten"** im Storyboard tut aktuell beim Klick fast nichts:

1. Er setzt `dialogStudioOpen = true` und scrollt zum Dialog Studio.
2. Das Studio ist bei vorhandenem Script aber **schon offen** (Default in `SceneCard.tsx` Zeile 192–194), und liegt direkt unter der Karte → es ist meist schon im Viewport. Ergebnis: visuell „passiert nichts".
3. Den eigentlichen Split-Schritt — den Toggle **„Als getrennte Szenen rendern"** im Dialog-Studio aktivieren und auf **Generieren** klicken — muss der Nutzer immer noch selbst finden.

Der Nutzer erwartet: *Klick auf „splitten" → Szene wird in N Einzel-Szenen aufgeteilt.*

## Lösung (UI/Frontend only)

Den Badge zu einem **echten One-Click-Split-Trigger** machen, mit klarer Bestätigung statt stillem Scroll.

### 1. Badge umbenennen + neuer Klick-Flow (`SceneCard.tsx`, ~Zeile 451–469)

- Label bleibt `⚠️ N Sprecher · splitten`, aber Klick öffnet **AlertDialog**:
  > „Diese Szene in **N Einzel-Szenen** aufteilen? Pro Sprecher entsteht ein eigener HeyGen-Lip-Sync-Clip im Storyboard. Kosten: ca. **€{N × 0.30}**."
  > Buttons: *Abbrechen* / *Splitten & generieren*
- Bei Bestätigung:
  - `setDialogStudioOpen(true)`
  - Neuer Prop an `SceneDialogStudio`: `autoSplitOnMount?: boolean` → Studio aktiviert intern `renderAsSeparateScenes = true` und ruft direkt `handleGenerate()` auf
  - Karte expandiert visuell + Scroll zum Studio
- Reines Hover-Tooltip bleibt für „warum".

### 2. `SceneDialogStudio.tsx` — Auto-Split-Eintrittspunkt

- Neue Props:
  ```ts
  autoSplitOnMount?: boolean;       // wenn true → renderAsSeparateScenes=true + handleGenerate()
  onAutoSplitConsumed?: () => void; // Reset des Triggers nach Verbrauch
  ```
- `useEffect` im Studio: wenn `autoSplitOnMount && blocks.length >= 2 && allVoicesSet`, einmalig `setRenderAsSeparateScenes(true)` + `handleGenerate()` ausführen, dann `onAutoSplitConsumed()`.
- Wenn Voices fehlen: kein Auto-Run, stattdessen Toast „Bitte erst Stimmen pro Sprecher wählen" + Highlight der Voice-Mapping-Bar (klassisches Verhalten).

### 3. Visuelles Feedback

- Während Split läuft: Badge zeigt Spinner + Label „Splitte… 1/N".
- Nach Erfolg: Badge verschwindet (weil `dialogScript` nun in N Sub-Szenen liegt) und Toast „N Lip-Sync-Szenen erstellt".
- Bei Fehler einer Teil-Szene: bestehende `toast`-Logik aus `SceneDialogStudio` greift weiter; Badge fällt zurück auf den Hint-Zustand.

## Betroffene Dateien

```text
src/components/video-composer/SceneCard.tsx          ← AlertDialog + autoSplit-Prop weiterreichen
src/components/video-composer/SceneDialogStudio.tsx  ← autoSplitOnMount Effekt + Reset-Callback
```

Keine Edge-Function-, DB- oder Pricing-Änderungen — die komplette Split-/HeyGen-Pipeline existiert schon (`onAddScene` + `generate-talking-head`). Wir verdrahten nur den existierenden Workflow hinter einem Klick.

## Out of scope

- Multi-Speaker innerhalb *einer* HeyGen-Szene (bleibt MVP-Limit: erster Sprecher).
- Server-seitiges Rendering / neue Edge Functions.
- Änderungen am Engine-Override-Dropdown daneben.
