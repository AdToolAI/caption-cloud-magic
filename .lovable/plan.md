## Verstandenes Konzept

Szenen sind ein **Overlay-Layer** über dem Originalvideo, mit dem man Übergänge, Filter, Trims und optional Ersatz-Clips (`additionalMedia`) bestimmt. Bereiche ohne Szene zeigen das Originalvideo pur. Bereiche jenseits der Originaldauer zeigen nur die hinzugefügte Szene mit `additionalMedia`.

## Root Cause (präzisiert)

In `CapCutPreviewPlayer.tsx`:

- Der rAF-Loop (Zeile 142–172) und der Szenen-Sync-Effekt (Zeile 200–248) machen **alles bedingt von `currentScene`** abhängig (`if (... && currentScene)` / `if (!currentScene) return`).
- Wenn `currentScene === undefined` (Bereich ohne Szene), passieren drei Dinge **nicht**:
  1. `onTimeUpdate(...)` wird nie aufgerufen → `currentTime` bleibt eingefroren.
  2. Kein Erkennen von Szenenende oder Erreichen einer neuen Szene.
  3. Kein Pause-/Switch-Handling beim Übergang zwischen Originalvideo und additionalMedia.

Also: Originalvideo läuft browser-nativ bis 0:25, aber `currentTime`-State bleibt bei 0, der Player bemerkt nicht, dass die Szene bei 0:25 startet, und schaltet nie auf das additionalMedia um.

## Lösung

Der Player wird so erweitert, dass er **auch ohne aktive Szene** korrekt arbeitet — das Originalvideo ist die „Default-Bühne", Szenen sind optionale Overlays.

### 1. rAF-Loop läuft IMMER, solange `isPlaying` (CapCutPreviewPlayer.tsx)

Die Bedingung `if (... && currentScene)` entfernen. Stattdessen:

```ts
const update = () => {
  if (!isPlaying) return;

  const currentScene = scenes.find(s => currentTime >= s.start_time && currentTime < s.end_time);
  const isAdditionalMedia = currentScene?.additionalMedia?.type === 'video';

  // Aktives Element bestimmen
  const activeVideo = isAdditionalMedia ? additionalVideoRef.current : mainVideoRef.current;

  if (activeVideo && !activeVideo.paused) {
    let newGlobalTime: number;

    if (isAdditionalMedia && currentScene) {
      newGlobalTime = currentScene.start_time + activeVideo.currentTime;
    } else {
      // Originalvideo läuft (mit oder ohne aktive Szene-Effekte)
      // currentTime = activeVideo.currentTime (1:1, weil kein Trim)
      newGlobalTime = activeVideo.currentTime;
    }

    // Ende der Gesamtdauer prüfen
    if (newGlobalTime >= duration) {
      onPlayingChange?.(false);
      onTimeUpdate(duration);
    } else {
      onTimeUpdate(newGlobalTime);

      // Übergang in eine Szene mit additionalMedia → main video pausieren, additional starten
      const nextScene = scenes.find(s => newGlobalTime >= s.start_time && newGlobalTime < s.end_time);
      if (nextScene?.additionalMedia && !isAdditionalMedia) {
        // Szenenwechsel-Effekt übernimmt das Switching
      }

      // Originalvideo zu Ende, aber Timeline läuft weiter (additionalMedia bei 25–30)
      if (!isAdditionalMedia && activeVideo.ended && newGlobalTime < duration) {
        // Force advance
        onTimeUpdate(Math.max(newGlobalTime, mainVideoRef.current?.duration ?? 0));
      }
    }
  }

  animationRef.current = requestAnimationFrame(update);
};
```

### 2. Szenen-Sync-Effekt erweitern (CapCutPreviewPlayer.tsx, Zeile 200–248)

Den frühen Return `if (!currentScene) return;` entfernen. Stattdessen:

- **Wenn aktive Szene mit `additionalMedia`**: bisheriges Verhalten (additionalVideo abspielen, mainVideo pausieren).
- **Wenn aktive Szene ohne `additionalMedia` ODER keine Szene**: mainVideo abspielen, additionalVideo pausieren.
- Sicherstellen, dass `mainVideoRef.currentTime` der globalen `currentTime` folgt (1:1, da das Originalvideo nicht getrimmt wird).
- Wenn `currentTime > videoDuration` und keine additionalMedia-Szene aktiv → `onPlayingChange(false)`.

### 3. Beim Erreichen des Originalvideo-Endes nicht stoppen

Auf das `<video>`-Element einen `onEnded`-Handler:
```tsx
<video ref={mainVideoRef} ... onEnded={() => {
  // Wenn Timeline länger als Originalvideo → weiterlaufen lassen
  if (currentTime < duration) {
    // rAF-Loop sieht das und springt in die nächste Szene
  } else {
    onPlayingChange?.(false);
  }
}} />
```

Da der rAF-Loop jetzt immer läuft, wird er den Übergang automatisch erkennen.

### 4. `handleAddVideoAsScene` defensiv (CapCutEditor.tsx)

`newStartTime = Math.max(lastScene?.end_time ?? 0, videoDuration)` — sorgt dafür, dass die erste hinzugefügte Szene nahtlos hinter dem Originalvideo liegt.

### 5. `duration`-Prop = max(videoDuration, letzte Szene)

In `CapCutEditor.tsx`:
```ts
const totalDuration = useMemo(
  () => Math.max(videoDuration, scenes[scenes.length - 1]?.end_time ?? 0),
  [videoDuration, scenes]
);
```
und an Player als `duration={totalDuration}` weitergeben.

## Geänderte Dateien

- **`src/components/directors-cut/studio/CapCutPreviewPlayer.tsx`**
  - rAF-Loop: Bedingung `currentScene` entfernen, Originalvideo als Default-Bühne behandeln.
  - Szenen-Sync-Effekt: auch ohne aktive Szene mainVideo korrekt steuern.
  - `onEnded` auf mainVideo: nur stoppen wenn Timeline-Ende erreicht.

- **`src/components/directors-cut/studio/CapCutEditor.tsx`**
  - `handleAddVideoAsScene`: `Math.max(lastScene?.end_time ?? 0, videoDuration)`.
  - `totalDuration` per `useMemo` ableiten und an Player weitergeben.

## Nicht betroffen

- Sidebar / Szenenliste — zeigt weiterhin nur User-Szenen (das Originalvideo ist keine Szene).
- Render/Export-Pipeline — die Szenen-Struktur bleibt identisch.
- AddMediaDialog — funktioniert.

## Was das löst

- ✅ Übergang von Originalvideo (0–25s) zu hinzugefügter Szene (25–30s) ohne Stopp.
- ✅ Bereiche ohne Szene zeigen Originalvideo pur (so wie gewollt).
- ✅ Szenen über dem Originalvideo bleiben weiterhin Overlay (Filter, Trim, additionalMedia).
- ✅ Timeline läuft kontinuierlich bis zur Gesamtdauer 0:30.