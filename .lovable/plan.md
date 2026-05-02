## Problem

Du hast zwei Punkte:

1. **Auto-Snap beim Hinzufügen** — der „An nächsten Schnitt einrasten"-Knopf funktioniert, aber du musst ihn manuell drücken. Eine neu hinzugefügte Szene soll sich **sofort** automatisch an den nächstgelegenen Cut-Marker anlegen, statt 5 s lang ab dem letzten Szenenende zu starten.
2. **Playback stoppt nach Szene 2** — wenn das überlagerte Video von Szene 2 zu Ende ist, läuft das Originalvideo nicht weiter. Ursache: beim Wechsel von `additionalMedia` zurück auf das Originalvideo wird das `<video>`-Element zwar entstummt, aber nicht zuverlässig wieder gestartet, weil der Animation-Loop für genau diesen Übergang keine Resume-Logik hat. Außerdem wird `mainVideo.currentTime` nicht korrekt gesetzt, sodass es ins Off läuft (mainVideo ist auf seinem alten `currentTime` stehen geblieben, während die Timeline weitergesprungen ist).

## Plan

### 1. Auto-Snap beim Szene-Hinzufügen (`CapCutEditor.tsx`)

In `handleSceneAdd` und `handleAddVideoAsScene`:
- **Start-Zeit**: nach Berechnen von `newStartTime` durch `snapToNearest(newStartTime, targets, 0.5s)` schicken. Targets = `cutMarkers` + Enden anderer Szenen (über `buildSnapTargets`). Toleranz für Auto-Snap großzügig (0,5 s), damit auch ungenaue Klicks fangen.
- **End-Zeit**: 
  - Wenn ein nächstgelegener Cut-Marker **nach** dem Start innerhalb von 15 s liegt → End-Zeit = dieser Marker.
  - Sonst → Default 5 s.
- **Visual Feedback**: kurzer Toast „An Schnitt eingerastet bei 0:12" / „Bei nächstem Schnitt verankert" wenn gesnapt wurde.

Damit wird die Szene automatisch genau zwischen zwei AI-erkannte Schnitte gelegt — der „Snap to nearest cut"-Button bleibt als manueller Override für nachträgliche Korrekturen.

### 2. Playback-Continuation nach Overlay-Szene (`CapCutPreviewPlayer.tsx`)

Bug: Nach Ende von Szene 2 (mit `sourceMode: 'media'`) läuft das Original nicht weiter.

Fixes im Animation-Loop und Scene-Sync-Effekt:
- **Übergangs-Detection**: wenn `currentScene` von `media` auf `null`/`original` wechselt **und** `isPlaying` ist:
  - `mainVideo.currentTime` explizit auf den neuen `currentTime` der Timeline setzen (statt sich auf den 0,3 s-Drift-Schwellwert zu verlassen).
  - `mainVideo.play()` mit `.catch(() => {})` aufrufen, **bevor** `additionalVideo.pause()` läuft (verhindert eine Mikro-Pause, in der weder die eine noch die andere Quelle läuft).
- **Animation-Loop-Hardening**: wenn `isAdditionalMedia` ist, aber das `additionalVideo.ended` ist und kein nextScene mit Media folgt → `onTimeUpdate(currentScene.end_time + epsilon)`, damit der Loop in den Original-Stage-Zweig eintritt, statt am Scene-Boundary zu stehen.
- **Re-Sync nach Scene-Ende**: nach `onTimeUpdate(nextScene.start_time)` zusätzlich `lastSceneIdRef.current = null` setzen, damit der nächste Render-Pass den Sync-Effekt zwingt, das richtige Video auch wirklich zu starten (kein „sceneChanged"-Skip).

### 3. Edge-Case-Polish
- Wenn nach der Overlay-Szene noch eine **weitere** Overlay-Szene direkt anschließt (Lücke < 50 ms), keinen Mini-Switch zurück auf Main, sondern direkt das nächste `additionalMedia` laden — verhindert Flackern.
- Wenn die Original-Szene nach dem Overlay leer ist (kein eigener Scene-Eintrag), den Original-Pass-Through-Stage-Zweig benutzen, der bereits in den useEffect-Branches enthalten ist, aber jetzt mit explizitem `play()`-Trigger.

## Betroffene Dateien
- `src/components/directors-cut/studio/CapCutEditor.tsx` — Auto-Snap in `handleSceneAdd` + `handleAddVideoAsScene`
- `src/components/directors-cut/studio/CapCutPreviewPlayer.tsx` — robuster Übergang Media → Original
- `src/lib/translations.ts` — neuer Toast-String („An Schnitt eingerastet")

## Ergebnis
- **Eine neue Szene rastet automatisch** zwischen die nächstgelegenen AI-Schnitte ein, ohne dass du irgendeinen Knopf drückst.
- **Playback läuft nahtlos weiter**, wenn ein überlagertes Video endet — das Original springt sofort an die richtige Stelle und spielt automatisch weiter, ohne Pause oder Schwarzbild.