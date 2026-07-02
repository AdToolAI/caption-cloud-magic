## Head-Trim für Library-/Zusatz-Szenen im Director's Cut

### Problem
Bei Szene 2 (Library-Clip, 9s) lässt sich im Inspector zwar der **Start**-Wert setzen und der Handler `handleTrimScene` speichert `original_start_time` korrekt — aber im Preview-Player wird der Overlay-Video-Tag für Zusatz-Medien immer bei `currentTime = 0` gestartet und ignoriert `original_start_time`/`original_end_time`. Deshalb wirkt es so, als würde nur hinten geschnitten (dort funktioniert es, weil das Szenen-Ende die Timeline-Länge steuert).

### Root Cause
`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` (Zeilen ~697–716): Beim Bind der Overlay-`<video>`-Quelle für `sourceMode === 'media'` wird hart `overlay.currentTime = 0` gesetzt, und der Wall-Clock-Advance stoppt erst am `scene.end_time` — nicht am `original_end_time` der Zusatz-Quelle.

### Fix

**Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**

1. Beim (Re)bind der Overlay-Quelle für Media-Szenen:
   - `overlay.currentTime = mediaScene.original_start_time ?? 0` (statt hart `0`).
   - `overlay.playbackRate = mediaScene.playbackRate ?? 1`.

2. Wenn Overlay pausiert war und Szene gleich bleibt, aber die Trim-Grenzen wurden verändert: bei einem `overlay.currentTime < original_start_time − ε` oder `>= original_end_time` auf `original_start_time` snappen.

3. Szenen-Ende-Check erweitern: Zusätzlich zum Timeline-Ende auch prüfen, ob `overlay.currentTime >= (mediaScene.original_end_time ?? overlay.duration)` — dann handoff zur nächsten Szene auslösen.

4. Overlay-Rebind-Trigger: aktuell nur bei `activeMediaSceneIdRef !== mediaScene.id`. Zusätzlich rebind/seek, wenn sich `original_start_time` seit dem letzten Bind geändert hat (via zusätzlichem `activeMediaSrcInRef`).

### Verifikation
- Szene 2 (9s Library-Clip) → Start im Inspector von 0 auf 2s setzen → Preview springt beim Betreten von Szene 2 auf Sekunde 2 des Quell-Clips; sichtbare Länge = 7s; Timeline-Länge shrinkt via bestehendem Ripple in `handleTrimScene`.
- End-Trim weiterhin funktional.
- Original-Video-Szenen unverändert (der Fix betrifft nur den `isMediaMode`-Branch).

### Nicht betroffen
- `handleTrimScene` in `CapCutEditor.tsx` — der Handler ist bereits korrekt.
- `SceneTrimInspector.tsx` — UI ist bereits korrekt.
- Render/Export-Pfad: liest `original_start_time` bereits (in `CapCutEditor` an Renderer übergeben).
