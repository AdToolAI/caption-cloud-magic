

## Befund

Der "Gummiband"-Effekt tritt im **Preview-Player** (`ComposerSequencePreview.tsx`) auf. Der Player verwendet **ein einziges `<video>`-Element**, dessen `src` bei jedem Szenenwechsel getauscht wird. Genau dort liegt das Problem.

### Wurzelursache (3 zusammenwirkende Fehler)

**Fehler 1: Clip-Länge ≠ `durationSeconds`**
Die KI-Modelle (Hailuo: 6s/10s fixed, Kling: 5s/10s, Sora: 4/8/12s) liefern **feste Längen**. Der User stellt aber im Storyboard z. B. `durationSeconds: 5` ein. Beim Abspielen läuft das Video bis `onEnded` (also volle 6/10 s) — `advanceScene()` wird **erst dann** ausgelöst. Das bedeutet: die letzten 1–5 Sekunden des Clips werden trotz "Szenendauer = 5s" weitergespielt → die Slider-Position überspringt die geplante Boundary, dann erfolgt der harte Cut. Der User nimmt das als "Wiederholung/Zurückspulen" wahr.

**Fehler 2: `onTimeUpdate` läuft beim Src-Tausch weiter und meldet Müll-Werte**
Wenn `sceneIdx` wechselt, setzt der Effekt (Zeile 100–115) `v.currentTime = 0` und wartet auf `canplay`. **Browser feuern jedoch beim Src-Wechsel noch ein bis zwei `timeupdate`-Events mit dem alten `currentTime` des vorigen Clips**. Das ruft `onVideoTimeUpdate` (Zeile 164) auf → setzt `globalTime = startOffsets[neueSzene] + alterCurrentTime` → der Slider springt sichtbar **nach vorne** und dann wieder zurück. Das ist der "Gummiband"-Look.

**Fehler 3: `<video>`-Element zeigt während des Src-Wechsels den letzten Frame des alten Clips weiter**
Da nur **ein** Video-Element existiert und `src` gewechselt wird, bleibt der **letzte gerenderte Frame** des Vorgänger-Clips solange sichtbar, bis das neue Video den ersten Frame dekodiert hat (typisch 100–400 ms). Der User sieht: alter Clip → kurzer Freeze auf dem Endframe → neuer Clip startet. Das wirkt wie "kurzer Loop / Wiederholung".

### Warum war es bei den ersten Videos nicht so?
Höchstwahrscheinlich, weil dort entweder (a) die Clip-Längen zufällig genau zur gewählten `durationSeconds` passten, oder (b) der Composer früher die Clips serverseitig auf Szenenlänge **getrimmt** hat. Aktuell wird offensichtlich der **rohe** Clip vom Provider an den Preview gegeben.

## Plan

### Fix 1 — Harte Längen-Begrenzung im Preview-Player
In `ComposerSequencePreview.tsx`:
- Beim `onTimeUpdate` prüfen: wenn `videoRef.current.currentTime >= scene.durationSeconds`, **sofort** `advanceScene()` und nicht auf `onEnded` warten.
- Falls der Clip kürzer als `durationSeconds` ist (auch möglich), den letzten Frame freezen (Pause bei Ende, manueller Tick weiter bis `durationSeconds` erreicht ist) — kein Auto-Loop.

### Fix 2 — Stale-`timeupdate`-Events beim Src-Wechsel ignorieren
- Eine `transitioningRef` (boolean) einführen, die beim `sceneIdx`-Wechsel auf `true` geht und erst nach `canplay` + `currentTime === 0` auf `false`.
- Solange `transitioningRef.current === true`: `onVideoTimeUpdate` ignorieren. So springt der globale Zeit-State nicht zurück.

### Fix 3 — Sauberer Frame-Übergang via Ping-Pong oder Black-Frame
Zwei Optionen, ich empfehle Option **A** als minimalinvasiv:

- **Option A (klein, sicher):** Beim Szenenwechsel **kurz das Video-Element ausblenden** (`opacity: 0`) bis `canplay` + erster `seeked`-Callback feuert, dann wieder einblenden. Dauer typisch 80–150 ms — nicht als "Gummiband", sondern als sauberer Cut wahrnehmbar.

- **Option B (groß, später):** Dual-Slot-Architektur (zwei `<video>`-Elemente, Ping-Pong wie im Director's Cut, siehe `mem://architecture/directors-cut/ping-pong-transition-architecture`). Vorteil: nahtlos. Nachteil: doppelt so viel Code, doppelter Bandbreitenverbrauch beim Preloading. **Nicht in diesem Schritt** — erst nach Verifikation, ob A schon ausreicht.

### Fix 4 (optional, falls A nicht reicht) — Preload des nächsten Clips
- Verstecktes zweites `<video preload="auto">` für `playable[sceneIdx + 1]`, damit beim Wechsel der nächste Clip schon dekodiert ist.

## Geänderte Dateien

- `src/components/video-composer/ComposerSequencePreview.tsx` — alle drei Fixes oben

## Verify

1. Preview eines Projekts mit gemischten Szenenlängen (5s / 10s) abspielen → kein sichtbares Zurückspringen mehr beim Übergang
2. Slider-Wert bewegt sich monoton vorwärts, kein kurzer Sprung beim Szenenwechsel (in DevTools beobachtbar)
3. Bei sehr kurzen geplanten Szenen (3s) wird der Clip korrekt nach 3s abgeschnitten, auch wenn er physisch 6s lang ist
4. Scrubben über Szenengrenzen funktioniert weiterhin sauber

