
## Fix: Universal Director's Cut stockt weiterhin an Szenenübergängen

### Wahrscheinliche Ursache
Ich habe die aktuelle Preview- und Remotion-Implementierung geprüft. Das Hängen sitzt sehr wahrscheinlich **nicht mehr primär im Player-Key**, sondern in der Szenen-/Transition-Architektur selbst:

1. **Jede Szene mountet ein neues `<Video>`**
   - In `src/remotion/templates/DirectorsCutVideo.tsx` rendert jede Szene ihre **eigene** `Video`-Instanz in einer eigenen `Sequence`.
   - Beim Szenenwechsel muss der Browser die Quelle neu auf die neue `startFrom`-Position anfahren.
   - Weil `pauseWhenBuffering` aktiv ist, pausiert die Preview genau dann sichtbar.

2. **Transitions sind aktuell nur “out”-Effekte**
   - Die aktuelle Logik animiert am Szenenende fast nur die **ausgehende** Szene.
   - Die **nächste** Szene wird nicht vorab sichtbar/preloaded überlagert.
   - Dadurch fällt der Buffer-/Seek-Moment genau im Übergang auf.

3. **Die Haupt-Preview rechts nutzt teils die falsche Gesamtdauer**
   - In `src/pages/DirectorsCut/DirectorsCut.tsx` wird der Preview-Player rechts noch mit `selectedVideo.duration` gefüttert statt mit der bearbeiteten Gesamtdauer.
   - Nach Trims/Speed-Änderungen kann Preview-Timeline vs. Szenen-Timeline auseinanderlaufen, was Übergänge zusätzlich unsauber macht.

4. **Es gibt noch Rest-Overhead**
   - In `DirectorsCutVideo.tsx` steckt noch ein `console.log` pro Szenen-Mount.
   - `DirectorsCutPreviewPlayer.tsx` aktualisiert UI/State weiterhin sehr häufig während Playback.

### Änderungen

#### 1. `src/remotion/templates/DirectorsCutVideo.tsx`
Die Transition-Logik auf **echte Überlappung** umbauen:

- `SceneVideo` so refaktorieren, dass **aktuelle und nächste Szene gleichzeitig** gerendert werden können
- in den letzten Transition-Frames einer Szene:
  - **Current Scene** = Exit-Animation
  - **Next Scene** = Entry-Animation
- dadurch ist die nächste Szene schon da, **bevor** der harte Cut kommt
- `crossfade`, `dissolve`, `fade`, `slide`, `wipe`, `push`, `zoom`, `blur` als echte Zwei-Layer-Transitions behandeln statt nur Out-Effekt
- verbleibendes Debug-Logging entfernen

Zusätzlich:
- optionales `previewMode` Prop ergänzen
- im Preview-Modus die Szenen-Videos weniger aggressiv auf Buffering reagieren lassen als im finalen Render

#### 2. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
Den Preview-Player auf flüssigere Wiedergabe trimmen:

- `previewMode: true` an `DirectorsCutVideo` weitergeben
- `timeupdate`/`setInternalTime` nicht unnötig oft durch den ganzen React-Tree treiben
- Parent-Updates (`onTimeUpdate`) leicht drosseln, damit die UI nicht jeden Tick mitrendert
- den bereits stabilisierten `playerKey` beibehalten

#### 3. `src/pages/DirectorsCut/DirectorsCut.tsx`
Die rechte Live-Preview mit der **bearbeiteten Gesamtdauer** synchronisieren:

- statt `selectedVideo.duration || 30`
- `actualTotalDuration` verwenden

Das sorgt dafür, dass:
- Transition-Frames an der richtigen Stelle liegen
- Seek/Playhead/Preview nicht gegen die Szenenlogik laufen

### Warum das den Fehler behebt
Der aktuelle Ruckler entsteht sehr wahrscheinlich genau dann, wenn am Szenenende das nächste `Video` erstmals gebraucht wird. Mit echter Überlappung wird der Übergang nicht mehr zu einem harten “Szene endet / neue Szene muss erst anlaufen”, sondern zu einem kontrollierten Blend/Slide zwischen zwei bereits vorhandenen Layern.

### Erwartetes Ergebnis
- deutlich weniger Hänger an Szenenwechseln
- Übergänge wirken wirklich wie Übergänge, nicht wie kurze Pausen
- Preview bleibt auch nach Trim-/Speed-Anpassungen zeitlich sauber synchron

### Dateien
1. `src/remotion/templates/DirectorsCutVideo.tsx`
2. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
3. `src/pages/DirectorsCut/DirectorsCut.tsx`

### Technische Hinweise
- Kein Backend- oder Datenbank-Fix nötig
- Der finale Render kann die robuste Render-Logik behalten; die wichtigste Optimierung ist die **Preview-Wiedergabe**
- Falls nötig, würde ich die Lösung so aufbauen, dass Render und Preview dasselbe Template teilen, aber über `previewMode` unterschiedlich auf Buffering reagieren
