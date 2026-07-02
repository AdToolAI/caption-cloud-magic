## Universal Director's Cut — Vollständige Bug-Bereinigung

Ein tiefer Audit hat **13 Bugs** aufgedeckt. Sie werden in vier Prioritäts-Wellen behoben (nur Frontend / Preview / Undo — kein Edge-Function-, DB- oder Render-Engine-Umbau).

### 🔴 Welle 1 — Kritisch (verursacht Freezes)

**Bug 1 — Doppelter `requestAnimationFrame` im IDLE-Pfad**
`src/components/directors-cut/preview/useTransitionRenderer.ts:433–435`
Zwei RAF-Aufrufe hintereinander → `rafRef` speichert nur den zweiten → der erste wird nie gecancelt → Tick-Loop wächst exponentiell (2⁴→16, 2¹⁰→1024) → Tab friert nach ~0.3 s ein, sobald mindestens ein Übergang gesetzt ist.
**Fix:** Zeile 435 löschen (verbatim-Duplikat).

### 🟠 Welle 2 — Hoch (Datenverlust / falsche Wiedergabe)

**Bug 2 — Trim-Slider spamt Undo-History**
`SceneTrimInspector.tsx:158` + `CapCutEditor.tsx:1071`
Slider committet pro Pixel → 60–200 Undo-Einträge pro Drag → History-Kapazität (50) läuft in einer Geste voll, älterer Zustand verloren.
**Fix:** `commitHistory()` aus `handleTrimScene` entfernen; nur bei `onValueCommit` des Sliders und `onBlur` der Inputs feuern. Zusätzlich No-Op-Guard: wenn sich `original_start_time`/`original_end_time` nicht geändert haben → sofort return.

**Bug 3 — Auto-Mute macht Original-Spur unstummbar**
`CapCutEditor.tsx:416–433`
Effekt hört auf `audioTracks` und mutet die Original-Spur automatisch wieder, sobald Voiceover existiert → Nutzer kann sie nicht mehr entmuten.
**Fix:** Auto-Mute-Effekt entfernen; stattdessen die bestehende Init-Logik (Zeile 583, 30 % Volume) einmalig laufen lassen. Falls Auto-Priorisierung erwünscht bleibt: `userOverrodeRef` setzen, sobald der Nutzer den Mute-Button klickt.

**Bug 4 — Insert-at-Playhead splittet ohne Source-Mapping**
`CapCutEditor.tsx:1440–1446`
Split beim Einfügen einer leeren Szene setzt `original_end_time`/`original_start_time` nicht neu → Tail-Hälfte spielt ab Source-Start statt ab dem Split-Punkt.
**Fix:** Split-Logik aus `handleSplitAtPlayhead` (Zeile 1281–1310) übernehmen (`srcSplit = srcInBase + offset`).

### 🟡 Welle 3 — Mittel (UX-Verschlechterung / Perf)

**Bug 5 — Rename / Playback-Rate / Reorder nicht undo-fähig**
`CapCutEditor.tsx:1116, 1125, 1782`
`commitHistory()` fehlt vor der Mutation → Ctrl+Z verliert den Vorher-Zustand innerhalb des 200 ms Debounce-Fensters.
**Fix:** `commitHistory()` am Anfang jedes Handlers.

**Bug 6 — 100 ms Polling-Loop für Slot-Wechsel**
`DirectorsCutPreviewPlayer.tsx:1626–1634`
`setInterval(100ms)` prüft, ob der aktive Slot gewechselt hat → 10 State-Updates/s Idle-Cost.
**Fix:** `onSlotSwap`-Callback aus `useTransitionRenderer` exportieren; genau dort `setActiveSlotTracker` aufrufen, Polling entfernen.

**Bug 7 — `findActiveTransition` doppelt pro RAF-Frame**
`DirectorsCutPreviewPlayer.tsx:701, 937`
Zwei identische Scans pro Frame.
**Fix:** Result einmal oben in `tick` hoisten.

**Bug 8 — Trim-Inputs remounten bei jeder Commit**
`SceneTrimInspector.tsx:189, 239`
`key={`in-${scene.id}-${srcIn}`}` → jede Commit zerstört das Input-DOM-Node, Fokus verloren, `+/-` Stepping unbrauchbar.
**Fix:** Auf kontrolliertes Input mit lokalem State umbauen (`value` + `onChange` lokal, Commit bei `onBlur`/Enter); dynamischen Key entfernen.

**Bug 9 — `JSON.stringify` Equality in `useEditorHistory`**
`src/hooks/useEditorHistory.ts:39–44`
30–100 KB JSON pro Render synchron serialisiert.
**Fix:** Monotoner `editVersion`-Counter, den jeder Mutation-Handler inkrementiert; Vergleich nur auf Counter. Deep-Compare als Fallback.

### 🔵 Welle 4 — Niedrig (Latente / Randfälle)

**Bug 10 — Centered-Transitions greifen nie für Original-Szenen**
`transitionResolver.ts:140–146`
Handle-Detection liefert für Original-Modus immer 0 → immer `'start-at-cut'`. Dokumentiert, aber Parität zum Remotion-Export sicherstellen.
**Fix:** Kurzer Kommentar + Verifikation, dass `DirectorsCutVideo.tsx` denselben Modus rendert (bereits ja — nur dokumentieren).

**Bug 11 — Beide Video-Slots feuern `handleVideoEnded`**
`DirectorsCutPreviewPlayer.tsx:1688, 1717`
Wenn der eingefrorene Slot während einer Centered-Transition „endet", wird die Transition abgebrochen.
**Fix:** Handler gaten: `if (e.currentTarget !== getActiveVideo()) return;`.

**Bug 12 — `transitions` fehlt in Dep-Array**
`DirectorsCut.tsx:46–58`
Stale-Closure-Risiko beim Draft-Restore.
**Fix:** `transitions` in Dep-Array aufnehmen; Guard bleibt (`transitions.length === 0`).

**Bug 13 — Audio-Sync-Effekt läuft bei jedem `currentTime`-Change**
`CapCutEditor.tsx:453–513`
Beim Scrubben 10–30×/s volle Iteration über alle Tracks + DOM-Ops.
**Fix:** Threshold-Guard per Ref: nur re-sync, wenn |Δ currentTime| > 0.05 s oder `isPlaying`/`audioTracks` sich geändert haben.

## Rollout-Reihenfolge

1. **Welle 1** zuerst deployen (Freeze-Killer, 1-Zeilen-Fix).
2. **Welle 2** direkt danach (schützt Undo & Preview-Korrektheit).
3. **Welle 3** in einem Batch (Perf + Editor-Feel).
4. **Welle 4** als Housekeeping-Commit.

## Nicht angefasst

- Edge Functions, DB-Schema, Remotion-Templates (außer Doku-Kommentar in Bug 10)
- Persistenz / Draft-Save-Logik
- Sync.so / Lipsync-Pipeline
- Provider-Registry

## Verifikation

- Bug 1: Browser-Devtools → mit ≥1 Übergang 5 s abspielen, Performance-Tab: RAF-Count bleibt konstant.
- Bug 2: 3 s Trim-Drag → Undo genau einen Schritt zurück.
- Bug 3: Original-Spur muten/entmuten während Voiceover aktiv → Zustand hält.
- Bug 4: Blackscreen mitten in einer Original-Szene einfügen → Tail-Hälfte spielt ab Split-Punkt.
- Bug 8: Trim-Zahlenfelder → Fokus bleibt beim +/- Stepping.

Freigabe zum Umsetzen?