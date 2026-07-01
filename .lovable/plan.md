## Zwei Probleme

**1. 15s-Szene spielt nur 11s ab**

Die Seed-Szene bekommt `end_time = video.duration`. Wenn `measureVideoDuration()` nach dem Import einen anderen Wert liefert (z.B. echte MP4-Dauer 11s statt der aus Composer übernommenen 15s), wird die Seed-Szene zwar aktualisiert — bei manuell hochgeladenen Videos oder Composer-Handoffs mit Duration-Drift bleibt aber ein Mismatch: der Timeline-Block ist 15s, das HTML-`<video>` läuft nur 11s → Player pausiert am Ende der Quelle.

Zusätzlich clampt `handleTrimScene` `srcOut` nur an `original_end_time` (die aus dem Seed 15s ist), nicht an die reale MP4-Länge. Der User kann also einen Bereich "wählen", der gar nicht existiert.

**2. Trim-Eingabe ist eine Tortur**

- Inline-Inputs in `CutPanel` sind `w-14 h-5 text-[9px] step=0.01` — mikroskopisch, unmöglich präzise mit Maus/Touch zu bedienen.
- Die Labels lauten "Start"/"End" und zeigen `scene.start_time`/`scene.end_time` (Timeline-Position), werden aber vom neuen `handleTrimScene` als **Quellen-Range** interpretiert → Anzeige ≠ Wirkung, verwirrend.
- Es gibt keinen visuellen Slider, kein "Set to Playhead"-Shortcut, keine sichtbare Länge/Dauer live.
- Der Inspector (`CapCutPropertiesPanel`) hat einen eigenen zweiten Trim-Block — Doppelung.

## Fix-Plan

### Fix 1 — Source-Duration korrekt tracken

`src/pages/DirectorsCut/DirectorsCut.tsx`
- Nach `measureVideoDuration()` immer `selectedVideo.duration` auf den gemessenen Wert setzen (auch wenn schon einer da war und abweicht > 0.3s).
- Seed-Szene und alle Szenen ohne `additionalMedia` auf `min(end_time, measuredDuration)` clampen, gleiche Logik für `original_end_time`.

`src/components/directors-cut/studio/CapCutEditor.tsx` — `handleTrimScene`:
- Neuen Parameter aus Props/Context ziehen: `sourceDuration` (via `originalVideoDuration` durchreichen).
- `newSrcOut = Math.min(sourceDuration || Infinity, ...)` statt nur `origEnd`.

### Fix 2 — Neuer Trim-Editor "Cut Inspector"

**Inline-Mini-Inputs in `CutPanel.tsx` (Zeile 435–463) komplett entfernen.** Sidebar-Szenenliste bleibt reine Übersicht.

Stattdessen: **Ein einziger großzügiger Trim-Editor** im `CapCutPropertiesPanel` (Inspector rechts), sichtbar wenn eine Szene selektiert ist:

```text
┌─ Szene 1 · Quelle 0.00s → 15.00s ─────────────┐
│                                                │
│  [Thumbnails-Filmstrip mit Dual-Range-Slider]  │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●  │
│                                                │
│  Start                       Ende              │
│  [  0.00 ]s [–][+][📍]    [ 15.00 ]s [–][+][📍]│
│                                                │
│  Länge: 15.00 s        [Auf Playhead schneiden]│
│  [Zurücksetzen]        [Am Playhead splitten]  │
└────────────────────────────────────────────────┘
```

Details:
- **Dual-Range-Slider** (Radix `Slider` mit `value=[in,out]`) über dem Filmstrip → visuelles Trimmen per Drag, Ganzes-Fenster verschiebbar.
- **Numerische Inputs** groß (`h-9 text-sm`), Steps `0.1` (nicht 0.01), mit `[–]/[+]`-Buttons für Feintuning.
- **📍-Button** "Set to playhead" — schreibt aktuelle `currentTime` in Start bzw. Ende.
- **Live-Länge** unter den Inputs.
- **Zurücksetzen** = `original_start_time/end_time` löschen → Full Source.
- **Splitten am Playhead** vorhandener Handler wiederverwendet.
- Alles ist ein neues Sub-Modul `SceneTrimInspector.tsx` unter `src/components/directors-cut/studio/`.

### Fix 3 — Label & Datenfluss korrigieren

- Trim-Aufrufe passen `srcIn/srcOut` (Quellen-Range) an — nicht Timeline. Werte fürs Anzeigen kommen aus `original_start_time ?? 0` bzw. `original_end_time ?? sourceDuration`.
- Dauer der Szene (Timeline-Länge) = `srcOut - srcIn`, automatisch synchron.

## Betroffene Dateien

- `src/pages/DirectorsCut/DirectorsCut.tsx` — measure clamp, `sourceDuration` an Editor durchreichen.
- `src/components/directors-cut/studio/CapCutEditor.tsx` — `handleTrimScene` mit Quellen-Clamp gegen `sourceDuration`, Prop-Weitergabe an Inspector.
- `src/components/directors-cut/studio/sidebar/CutPanel.tsx` — Mini-Inputs Zeile 435–463 entfernen.
- `src/components/directors-cut/studio/CapCutPropertiesPanel.tsx` — alten Trim-Block durch `<SceneTrimInspector/>` ersetzen.
- **neu**: `src/components/directors-cut/studio/SceneTrimInspector.tsx` — Filmstrip + Dual-Slider + große Inputs + Playhead-Buttons.

Keine Backend-/DB-/Edge-Function-Änderungen, keine neuen Dependencies (Radix Slider + shadcn Input schon vorhanden).