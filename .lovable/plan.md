Ja. Ich glaube, wir brauchen keinen weiteren Button, sondern eine andere interne Logik. Der aktuelle Fehler liegt nicht nur am Snapping: Im Studio wird der große `DirectorsCutPreviewPlayer` verwendet, aber der kann aktuell hinzugefügte `sourceMode: 'media'`-Szenen praktisch nicht sauber als eigene Videoquelle abspielen. Beide Video-Slots laden nur das Originalvideo. Außerdem werden AI-Cuts nicht als echte Cut-Anker in den Editor zurückgegeben, sondern nur die Szenen werden gesetzt. Dadurch schnappt die Timeline teilweise an falsche oder unvollständige Grenzen.

Was Artlist, CapCut, Premiere & Co. im Kern machen:
- Sie erzeugen erst eine stabile Edit-Liste: Cut-Anker, Shot-Zellen, Source-Time und Timeline-Time getrennt.
- Neue Medien werden nicht blind angehängt, sondern in eine konkrete Cut-Zelle eingepasst.
- Playback ist source-aware: Originalvideo, B-Roll/Overlay und Audio haben getrennte Uhren, werden aber über eine gemeinsame Timeline synchronisiert.
- Cut-Erkennung ist mehrstufig: grobe Kandidaten, frame-nahe Verfeinerung, Confidence, manuelle Overrides.

## Ziel
Director’s Cut soll sich wie ein echter Editor verhalten:

1. Auto-Cut erkennt echte Schnittpunkte und macht daraus sichtbare, magnetische Cut-Anker.
2. Wenn du ein Video/eine Szene hinzufügst, wird sie automatisch in die passende Cut-Zelle gelegt und auf deren Länge gefittet.
3. Das Originalvideo läuft nach Szene 2 und nach jedem eingefügten Clip zuverlässig weiter.
4. Manuelle Marker bleiben als Override erhalten, aber sind nicht mehr zwingend nötig.

## Implementierungsplan

### 1. Zentrale Cut-Anker-/Edit-List-Engine einführen
Neue Utility-Datei, z. B. `src/lib/directors-cut/timelineAnchors.ts`:

- `normalizeCutAnchors(...)`
  - kombiniert AI-Cuts, manuelle Marker, Szenenstarts/-enden und Timeline-Start/Ende
  - sortiert, dedupliziert und quantisiert auf Frame-Grenzen, z. B. 30 fps
  - hält Confidence und Quelle: `ai`, `manual`, `scene`, `timeline`

- `buildAnchorCells(...)`
  - erzeugt aus den Ankern echte Schnitt-Zellen:

```text
0.00 ┃ 2.48 ┃ 4.32 ┃ 8.56 ┃ 12.10 ┃ ...
     cell1  cell2  cell3  cell4
```

- `findBestInsertionCell(...)`
  - bevorzugt die Zelle am Playhead
  - sonst nächste freie/nahe Zelle
  - sonst Fallback auf nächste sinnvolle Timeline-Position

- `fitSceneToCell(...)`
  - setzt `start_time` exakt auf Zellstart
  - setzt `end_time` exakt auf Zellende
  - verhindert 0.001s-Lücken/Überlappungen
  - optional: passt kurze Medien per Speed-Fit/Trim-Fit an die Zielzelle an

### 2. AI-Cuts wirklich in den Editor übernehmen
Aktuell werden die erkannten Grenzen in `handleStartAnalysis` verwendet, aber nicht sauber als `cutMarkers` in `CapCutEditor` gespeichert.

Änderungen in `src/pages/DirectorsCut/DirectorsCut.tsx` und `CapCutEditor.tsx`:

- Parent-State für AI-Cut-Marker einführen.
- Nach Auto-Cut:
  - `detectedBoundaries` als Cut-Marker speichern
  - Confidence übernehmen
  - Marker an `CapCutEditor` weiterreichen
- Manuelle Marker in `CapCutEditor` mit AI-Markern mergen statt getrennt im lokalen State zu verschwinden.

Ergebnis: Die goldenen Cut-Linien sind nicht nur Deko, sondern die zentrale Wahrheit fürs automatische Einpassen.

### 3. Scene-Add-Logik ersetzen: nicht mehr “nach letzter Szene”, sondern “in passende Cut-Zelle”
In `src/components/directors-cut/studio/CapCutEditor.tsx`:

- `handleSceneAdd` und `handleAddVideoAsScene` auf die neue Anchor-Engine umstellen.
- Neue Szene wird nicht mehr stumpf an `lastScene.end_time` oder `effectiveSourceDuration` gehängt.
- Verhalten:
  - Playhead liegt in einer Cut-Zelle: neue Szene exakt in diese Zelle.
  - Playhead liegt nahe einem Cut: Start/Ende exakt auf benachbarte Cut-Anker.
  - Kein Cut verfügbar: 5s-Fallback, aber frame-quantisiert.
- Bei Medien:
  - `sourceMode: 'media'`
  - `start_time/end_time` = Cut-Zelle
  - `additionalMedia.duration` bleibt Originaldauer
  - optional neues Feld für Fit-Strategie: `fitMode: 'trim' | 'speed' | 'hold'`

Dadurch entsteht kein falscher Cut mehr wie im Screenshot, wo die Szene zwar optisch im Clip liegt, aber die Playback-Logik danach in einen unstabilen Zustand kommt.

### 4. Den tatsächlich verwendeten Preview-Player media-aware machen
Wichtig: Die letzte Änderung hat vor allem `CapCutPreviewPlayer.tsx` verbessert. Im Studio wird aber `DirectorsCutPreviewPlayer.tsx` verwendet.

In `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`:

- `resolveVisualSourceAtTime(time)` einführen:
  - `original`: Originalvideo, Source-Time aus `original_start_time`/Timeline
  - `media`: `additionalMedia.url`, lokale Zeit = `time - scene.start_time`
  - `blackscreen`: schwarzer Frame, Timeline läuft weiter
  - keine aktive Szene: Originalvideo als Pass-through, sofern `time < originalDuration`

- Separate Media-Quelle ergänzen:
  - Original bleibt in Slot A/B für bestehende Transition-Logik.
  - Für eingefügte Medien kommt ein eigener `mediaVideoRef` darüber.
  - Beim Wechsel `media -> original` wird das Original vorab auf die exakte Timeline-Source-Time gesetzt und gestartet, dann erst Media versteckt.

- Playback-Uhr stabilisieren:
  - Originalabschnitte bleiben video-led.
  - Media-/Black-/Gap-Abschnitte laufen über eine Timeline-Clock und syncen das jeweilige Element.
  - Kein Clamp mehr auf das Ende von Szene 2, wenn danach das Originalvideo weiterlaufen soll.

Das behebt das “nach Szene 2 pausiert er” strukturell, nicht nur symptomatisch.

### 5. Lückenlosigkeit erzwingen
Neue kleine Utility-Funktion, z. B. `sanitizeSceneBoundaries(...)`:

- Alle Szenen auf Frame-Grenzen runden.
- Minigaps unter 2 Frames schließen.
- Mini-Overlaps unter 2 Frames auflösen.
- Wenn Szenen nur die ersten paar Sekunden abdecken, bleibt der Rest des Originalvideos automatisch als Pass-through sichtbar/spielbar.

### 6. Cut-Erkennung präziser machen
In `src/lib/directors-cut-scene-detection.ts`:

- Coarse Scan von ca. 3 fps auf 6 fps erhöhen.
- Refinement um Kandidaten dichter machen, z. B. 24 fps in einem kleineren Fenster.
- Cut-Zeit nicht auf 0.1s runden, sondern frame-genau bzw. mindestens auf 0.01s.
- Confidence stärker gewichten:
  - Hard Cuts = hohe Priorität
  - Soft Transitions = niedriger, aber sichtbar
- Sehr kurze echte Schnitte nicht pauschal durch `MIN_SCENE_DURATION = 3.0` wegmergen; stattdessen:
  - echte Cut-Anker behalten
  - nur Szenenliste für UI optional glätten

Damit werden die Cuts weniger “miserabel getroffen”.

### 7. UI-Feedback wie in professionellen Editoren
In Timeline/Sidebar:

- Cut-Marker unterscheiden:
  - AI stark
  - AI schwach
  - manuell
- Beim Hinzufügen kurze Info:
  - “In Cut-Zelle 2.48–4.32s eingepasst”
- Optionaler Button bleibt:
  - “Marker hinzufügen” als Override
  - aber Auto-Fit passiert automatisch.

### 8. Tests/Debug-Absicherung
Ich würde zusätzlich kleine Debug-Logs nur für Development einbauen oder eine interne Diagnosefunktion:

```text
Timeline: 8.56s
Visual source: original/media/blackscreen
Source time: 8.56s
Scene: scene-3
Cell: 4.32–8.56s
```

Damit können wir bei weiteren Problemen sofort sehen, ob die Timeline, Source-Time oder Media-Time falsch ist.

## Dateien, die ich ändern würde

- `src/lib/directors-cut/timelineAnchors.ts` neu
- `src/lib/directors-cut-scene-detection.ts`
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/components/directors-cut/studio/CapCutTimeline.tsx`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/types/directors-cut.ts`
- `src/lib/translations.ts`

## Was ich von dir brauche
Nichts zwingend. Ich kann das so implementieren.

Optional hilfreich wäre nur ein kurzes Beispielvideo bzw. die konkrete Datei, bei der Szene 2 schwarz/pausiert. Dann könnte ich die Cut-Erkennung danach noch feiner kalibrieren. Aber für den Architektur-Fix brauche ich das nicht.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
  <lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>