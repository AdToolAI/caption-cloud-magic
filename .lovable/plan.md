# Universal Director's Cut — Audit-Ergebnis & priorisierte Roadmap

Nach vollständigem Read-Only-Audit (Timeline, Trim, Transitions, Audio, Export, Persistenz, History) haben wir **23 Findings**. Architektur ist gesund — die meisten Probleme sind kleine, isolierte Wiring-Fehler. Ein Bug ist aber trust-breaking: **Multi-Track-Audio wird beim Export komplett verworfen.**

Ich schlage 4 Wellen vor. Du kannst danach entscheiden, ob wir alle 4 durchziehen oder nach Welle 1 stoppen.

---

## Welle 1 — Trust-Fixes (Export-brechende Bugs)

Ziel: was der User sieht/hört im Preview = was rausrendert wird.

1. **C1 Audio-Export komplett verdrahten** — `audioTracks` (SFX, Extra-Musik, Custom-Clips) landet aktuell im Draft, aber NICHT im Render-Payload. Wir serialisieren `audioTracks` in `soundDesign.sfxTracks`, `render-directors-cut/index.ts` reicht sie durch, `DirectorsCutVideo.tsx` konsumiert sie (Schema existiert schon, wird nur nicht gefüllt).
2. **C2 Voiceover-10-s-Truncation** — Placeholder-Duration von `10` auf `videoDuration` setzen, `AbortController` beim Unmount.
3. **C3 AudioContext-Leak in WaveformDisplay** — Cleanup-Return, `cancelled`-Flag, damit Browser nicht bei 6 Contexts hart limitiert.
4. **C4 audioElementsRef-Leak** — Beim Delete `pause()` + `src=''` + `Map.delete()`.
5. **H1 Music-Volume Preview↔Export vereinheitlichen** — Preview nutzt hartkodiert `0.3`, Export nutzt Slider, Formel weicht ab. Alle drei Pfade auf `getEffectiveBackgroundMusicVolume()` konsolidieren.
6. **H2 Subtitle-Style Zod-Strip** — `SubtitleClipSchema.passthrough()` bzw. `textStroke/maxLines/style/source` explizit ins Schema, damit User-Formatierung nicht stumm verloren geht.

**Aufwand:** ~1 Session. Nach Welle 1 hat der User Vertrauen zurück, dass Preview = Export.

---

## Welle 2 — Preview/Export-Parität & Undo-Stabilität

7. **H3 Transition-Easing** — Shared Easing-Utility, Preview + Remotion nutzen dieselbe Kurve.
8. **H4 Undo/Redo-Race** — `commit()`+`undo()` in Keyboard-Shortcut kann Ghost-Snapshot pushen. Guard über `pendingRef !== null`.
9. **H5 Burned-Subs Polling-Restart pro Render** — `onCleanedVideoUrlChange` in DC.tsx in `useCallback` wrappen (aktuell wird alle 1s ein neuer Poll-Interval gestartet).
10. **H6 handleVideoEnded für Blackscreen/Media-Scenes** — Skip Source-Seek wenn `sourceMode !== 'original'`.
11. **M5 Orphan-Transitions** — Beim Scene-Delete zugehörige `TransitionAssignment` mitlöschen.
12. **M6 SubtitleSafeZone `mode`** — `reframe`/`crop` durchs Schema und in Remotion honorieren.
13. **M8 RAF-Leak in useTransitionRenderer** — Cleanup mit `cancelAnimationFrame`.

**Aufwand:** ~1 Session.

---

## Welle 3 — Performance & UX-Politur

14. **M1 Draft-Autosave** — Von synchronem localStorage-JSON (50–150 KB alle 500 ms) auf IndexedDB + 2 s Debounce.
15. **M2 Audio-Sync-Effect splitten** — Position-Sync und Volume-Sync trennen (keine Track-Iteration bei Volume-Change).
16. **M3 AudioTrackRow-DOM-Explosion** — Grid-Lines von 1 200 `<div>`s auf CSS `repeating-linear-gradient`.
17. **M4 SceneTrimInspector hardMax** — Immer volle Source-Range, damit Wiederaufweiten funktioniert.
18. **M7 Waveform Sample-Count** — Aus Container-Width ableiten statt hart 100 Bars.
19. **L2 Slide/Wipe-Directions** — `slide-right`, `slide-up` etc. in `TRANSITION_TYPES` (aktuell defaultet alles auf `left`).
20. **L3 Color-Grading-Opacity-Hack** — Blend via Pseudo-Element statt `opacity()` Filter.
21. **L5 cheapEquals** — `thumbnail_url` (data URIs!) aus Deep-Compare ausschließen.

**Aufwand:** ~1 Session.

---

## Welle 4 — Pro-NLE-Features (differenzierend vs. CapCut)

Nur wenn Welle 1–3 grün sind. Ziel: NLE-Score von 6.5 auf ~8.

- **N1 JKL-Scrubbing** — Standard-Profi-Shortcut, 30 min.
- **N2 Snap-Tick-Indikatoren** in der Timeline (Marker sind schon getrackt, nur nicht sichtbar).
- **N3 Waveform im Video-Track** (Komponente existiert schon).
- **N4 Echter Ripple-Trim** auf Handle-Drag.
- **N5 Frame-Accurate Timecode** `HH:MM:SS:FF` im Preview.
- **N6 Mobile Pinch-to-Zoom** auf Timeline.

**Aufwand:** ~1–2 Sessions je nach Umfang.

---

## Technische Details (zum Nachlesen)

Die vollständige Fundstellen-Liste mit `file:line`-Referenzen ist im Audit-Report enthalten. Wichtigste Dateien für Welle 1:
- `supabase/functions/render-directors-cut/index.ts` — Render-Payload-Serialisierung
- `src/pages/DirectorsCut/DirectorsCut.tsx` — Parent-State `capCutAudioTracks`
- `src/components/directors-cut/studio/CapCutEditor.tsx` — Voiceover-Placeholder, audioElementsRef-Cleanup, Export-Handler
- `src/components/directors-cut/timeline/WaveformDisplay.tsx` — AudioContext-Cleanup
- `src/remotion/templates/DirectorsCutVideo.tsx` — `SubtitleClipSchema`, `soundDesign.sfxTracks`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — Music-Volume-Formel
- `src/lib/audioVolume.ts` — Single-Source-of-Truth für Volume-Mapping

---

## Nicht enthalten

- **Keine** Änderungen an AI-Pipelines (Composer, Toolkit, Talking-Head).
- **Keine** DB-Migrationen nötig für Welle 1–2. Welle 3 (IndexedDB-Migration) evtl. mit sanfter Fallback-Auslesung aus altem localStorage.
- **Keine** Änderungen an Auto-Director oder Ad-Director.

---

## Meine Empfehlung

**Starten mit Welle 1** (Trust-Fixes) — die 6 Bugs kosten dich sonst zahlende Kunden, sobald jemand SFX arrangiert und einen tonlos-arrangierten Export zurückbekommt. Danach sehen wir, ob Welle 2 direkt folgen soll.

Approve → ich baue Welle 1 in einem Rutsch.