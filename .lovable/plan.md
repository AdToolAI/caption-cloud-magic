
Ziel: Beide Probleme in einem sauberen Root-Fix schließen: (1) 32s in Schritt 2 vs. 30s in Schritt 3, (2) erster Slide verschiebt das Bild nach rechts.

1) Befund (aus dem aktuellen Code)
- Die 30s kommen sehr wahrscheinlich aus einer falschen Dauerquelle:
  - In `VideoImportStep.tsx` wird bei Mediathek-Videos `duration` aus `duration_in_frames / 30` berechnet (harte 30fps-Annahme).
  - In `DirectorsCut.tsx` Schritt 2/3 wird mehrfach `selectedVideo?.duration || 30` verwendet.
  - In `handleStartAnalysis` werden Szenen am Ende auf diese Dauer geclamped (`videoDuration = selectedVideo.duration || 30`), dadurch kann die Timeline in Schritt 3 real auf 30s abgeschnitten werden.
- Der „nach rechts verschoben“-Effekt nach dem ersten Slide ist ein Zustands-/Style-Leak zwischen Transition und Normalzustand:
  - `useTransitionRenderer` resettet nicht in jedem inaktiven Frame hart, sondern nur in bestimmten Pfaden (`wasActiveRef`-abhängig).
  - Dadurch können Transform/Layer-Zustände (insb. nach Slide/Push + Seek/Restart) stehen bleiben.

2) Fixpaket A — Dauer konsistent machen (Schritt 2/3/Analyse)
- Einheitliche, verlässliche Dauerquelle einführen:
  - Mediathek: in `VideoImportStep.tsx` primär `duration_seconds` (falls vorhanden) statt `duration_in_frames / 30`.
  - Fallback: echte Dauer per `loadedmetadata` vom Video-URL messen.
- In `DirectorsCut.tsx` alle `selectedVideo?.duration || 30`-Stellen für Analyse/Step-Props auf die kanonische Dauer umstellen.
- In `handleStartAnalysis` nicht mehr mit potenziell falscher Dauer clamped arbeiten; clamp auf die kanonisch gemessene Dauer.
- Timeline-Gesamtdauer zentral berechnen (Helper), robust als `max(end_time)` statt mehrfach per inkonsistenter lokaler Berechnung.

3) Fixpaket B — Slide-Rechtsverschiebung eliminieren
- `useTransitionRenderer.ts`:
  - Harten „Baseline Reset“ für den inaktiven Zustand einbauen (nicht nur bei `wasActiveRef`): base/incoming Transform, ClipPath, Positioning, Display deterministisch zurücksetzen.
  - Freeze-Zweig ebenfalls mit expliziten neutralen Styles (`none`) statt impliziten/leeren Zuständen.
  - Bei Seek/Restart sicherstellen, dass `lastIncomingSeekRef` und Layer-Zustände sauber neu initialisiert werden.
- `DirectorsCutPreviewPlayer.tsx`:
  - Bei `handleSeek`, `handleReset`, neuem Play-Start Transition-Layer explizit in Neutralzustand bringen (incoming pausiert/hidden, Styles zurückgesetzt), damit der erste Slide nicht mit altem Zustand startet.

4) Technische Details (kurz)
- Betroffene Dateien:
  - `src/components/directors-cut/steps/VideoImportStep.tsx`
  - `src/pages/DirectorsCut/DirectorsCut.tsx`
  - `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - `src/components/directors-cut/preview/useTransitionRenderer.ts`
  - optional: kleiner Duration-Helper in `src/utils/...`
- Keine Architektur-Änderung am Übergangsmodell nötig, sondern Konsistenz von Zeit-/Dauerquelle + deterministischer Layer-Reset.

5) Verifikation (Akzeptanzkriterien)
- Dasselbe Video zeigt in Schritt 2 und Schritt 3 identische Gesamtdauer (bei dir: 32s).
- Nach erstem Slide bleibt das Bild zentriert, kein Rechts-Offset.
- Mehrfaches Play/Pause, Seek und Restart reproduziert den Fehler nicht mehr.
- Übergang 1 startet visuell sauber ohne Layout-Drift.
