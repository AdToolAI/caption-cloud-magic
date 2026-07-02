# Director's Cut — Trim + Split Bugfix

Aus den zwei Screenshots und der aktuellen Logik gibt es drei konkrete Bugs.

## Bug 1: START-Feld lässt sich nach Trim nicht mehr zurückdrehen

**Ursache** — `src/components/directors-cut/studio/CapCutEditor.tsx:1074` (`handleTrimScene`):

```ts
const hardMin = isAdditional ? (target.original_start_time ?? target.start_time) : 0;
const hardMax = isAdditional ? (target.original_end_time ?? target.end_time) : ...;
```

Sobald der User Start auf 17.4 setzt, wird `original_start_time = 17.4` gespeichert. Beim nächsten Trim-Aufruf ist `hardMin` selbst 17.4 → jeder Versuch, wieder unter 17.4 zu klettern, wird auf 17.4 geklemmt. Gleiches Problem oben (max friert am zuletzt gesetzten Ende ein).

Das gleiche Clamping tut `SceneTrimInspector`:
- Slider-Domain = `[srcIn, srcOut]` der Szene, nicht der volle Media-Range → das UI zeigt die Grenzen gar nicht mehr.

**Fix**
1. Beim Import einer Media-Szene (`ClipsTab` → `additionalMedia`) einmalig die volle Media-Länge messen (bereits per `<video>.duration` gemacht) und in **neuen Feldern** `media_source_start = 0` und `media_source_end = mediaDuration` auf der Szene speichern. Diese Felder werden nach dem Import **nie mehr** überschrieben.
2. `handleTrimScene`:
   - `hardMin = target.media_source_start ?? 0`
   - `hardMax = target.media_source_end ?? originalVideoDuration ?? target.original_end_time`
3. `SceneTrimInspector` bekommt die volle Media-Range über einen neuen Prop `sourceRange={ min, max }` und verwendet diese als Slider-/Input-Grenzen (statt der aktuellen `srcIn/srcOut`). Die Slider-Positionen zeigen weiter die aktuellen Trim-Werte, aber die Domain ist konstant.
4. Rückwärts-Kompatibilität: Für alte Szenen ohne `media_source_end` einmalig aus `additionalMedia.url` per Preload-Video die Dauer nachladen (best effort), oder Fallback auf den generöseren Wert `max(current original_end_time, originalVideoDuration)`.

## Bug 2: Schwarze Vorschau nach Split (Media-Szene)

**Ursache** — `DirectorsCutPreviewPlayer.tsx:704`:

```ts
const trimChanged = Math.abs((activeMediaSrcInRef.current ?? 0) - mSrcIn) > 0.01;
if (activeMediaSceneIdRef.current !== mediaScene.id || trimChanged) { … rebind … }
```

Beim Split behält die **erste** Hälfte die alte `scene.id` UND `original_start_time` (unverändert) → kein Rebind, aber das Overlay-Video steht evtl. schon jenseits von `mSrcOut`. Die zweite Hälfte bekommt eine neue id → rebind wird erst getriggert, wenn der Playhead sie erreicht. In der Zwischenzeit spielt das Overlay über die neue `mSrcOut`-Grenze hinaus und `overlayPastOut` feuert einen Szenen-Vorlauf auf die falsche nächste Szene → Overlay `removeAttribute('src')` → schwarzes Bild.

**Fix**
- In `handleSplitAtPlayhead` (CapCutEditor.tsx:1250) **beide** neuen Segmente mit frischen ids ausstatten (aktuell: erste behält alte id → force rebind fehlt). Dadurch triggert der `activeMediaSceneIdRef !== mediaScene.id`-Zweig zuverlässig.
- Zusätzlich in `handleSplitAtPlayhead` **nach** `onScenesUpdate`: `activeMediaSceneIdRef.current = null` über einen kleinen Callback resetten. Einfachere Variante: nach dem Split den Playhead per `setCurrentTime(currentTime + 0.001)` minimal nudgen → forciert eine neue Tick-Runde mit sauberem Rebind.
- Fallback im Player selbst: rebind auch, wenn `mSrcOut - overlay.currentTime > 0.3` UND `overlay.currentTime` liegt **außerhalb** von `[mSrcIn, mSrcOut]` — Sicherheitsnetz gegen zukünftige Split-Varianten.

## Bug 3: Playhead klebt an Szenengrenze nach Split (User-Report vom vorherigen Turn)

Kleiner Follow-Up zum bereits gebauten „In Szene springen": Nach einem erfolgreichen `handleSplitAtPlayhead` **und** `handleSplitAtTrim` den Playhead automatisch **1 Frame (0.03s) in die neue Szene** setzen, damit ein zweiter Split direkt möglich ist ohne Umweg.

- CapCutEditor.tsx nach `onScenesUpdate(newScenes)` in Split-Handler: `setCurrentTime(currentTime + 0.03)`.

## Verifikation

- **B1**: Start auf 17 setzen → mit `–`-Button oder Eingabe zurück auf 12.6 → Szene wird wieder länger, Overlay springt auf 12.6 im Quellvideo.
- **B2**: Szene 2 (Media-Overlay, 12.6–16.6) bei Playhead 14.6 splitten → beide Hälften spielen weiter (2s + 2s), kein Blackscreen zwischen ihnen.
- **B3**: Nach Split direkt nochmal „Am Playhead teilen" klicken → funktioniert ohne „Zu nah am Rand".

## Nicht betroffen

- Kein Backend/Render-Pfad ändert sich; `original_start_time`/`original_end_time` bleiben die Wahrheit für Trim, `media_source_*` sind rein clientseitige Domain-Grenzen.
- `handleSplitAtTrim`, Ripple-Logik und Original-Video-Szenen bleiben unverändert.
