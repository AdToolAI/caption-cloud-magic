

## Fix: Director's Cut stockt weiterhin an Übergängen

### Wahrscheinliche Hauptursachen

Ich habe den aktuellen Stand geprüft. Das Problem sitzt jetzt sehr wahrscheinlich an **drei konkreten Stellen**:

1. **Zwei Preview-Player laufen parallel**
   - In `src/pages/DirectorsCut/DirectorsCut.tsx` wird rechts weiterhin die globale `Live-Preview` angezeigt.
   - Gleichzeitig rendern viele Steps **bereits ihren eigenen** `DirectorsCutPreviewPlayer`:
     - `SceneAnalysisStep`
     - `SceneEditingStep`
     - alle `StepLayoutWrapper`-basierten Steps (4–9)
   - Ergebnis: **zwei Remotion-Player dekodieren dasselbe Video gleichzeitig**, genau dort fällt Buffering an Übergängen besonders auf.

2. **Die nächste Szene wird nicht wirklich vorgepuffert**
   - In `src/remotion/templates/DirectorsCutVideo.tsx` gibt es zwar schon eine Überlappung, aber die nächste Szene wird erst **am sichtbaren Transition-Fenster** gemountet.
   - Das ist noch kein echtes Preloading.
   - Zusätzlich existiert **kein `previewMode`**, obwohl das im letzten Plan vorgesehen war.

3. **Preview lädt Audio doppelt**
   - `DirectorsCutPreviewPlayer.tsx` baut eigene native `Audio(...)`-Elemente auf.
   - `DirectorsCutVideo.tsx` rendert im Preview aber zusätzlich weiterhin Remotion-`<Audio>`-Spuren.
   - Das erhöht Netz-/Decode-Last unnötig.

### Änderungen

#### 1. `src/pages/DirectorsCut/DirectorsCut.tsx`
Die rechte globale `Live-Preview` nur dann anzeigen, wenn der aktuelle Step **keine eigene große Preview** hat.

Geplant:
- Step-Mapping wie `stepHasOwnPreview`
- rechte Sidebar-Preview für Steps mit eingebautem Player ausblenden
- Layout stabil halten, z. B. dort nur Projekt-Info anzeigen

Das reduziert die Last sofort von **2 Playern auf 1 Player**.

#### 2. `src/remotion/templates/DirectorsCutVideo.tsx`
Die Preview-Logik gezielt auf flüssige Wiedergabe umbauen, ohne die bestehende Szenen-Architektur aufzugeben.

Geplant:
- `previewMode?: boolean` ergänzen
- bei Szenen-Sequences `premountFor` verwenden, damit die nächste Szene **vor dem sichtbaren Übergang** gemountet wird
- `pauseWhenBuffering` im **Preview-Modus** für Szenen-Videos nicht aggressiv verwenden
- Remotion-`<Audio>` im `previewMode` **gar nicht rendern**, weil die Preview bereits eigene Audio-Sync nutzt
- die aktuelle Übergangslogik von „nur Exit-Effekt“ auf **echte Zwei-Layer-Transition** bringen:
  - aktuelle Szene = Exit
  - nächste Szene = Entry
- besonders `crossfade` / `fade` korrigieren, da sie aktuell nicht als echte Ein-/Ausblendung arbeiten

Wichtig:
- Die bestehende **Sequence-per-scene** Architektur bleibt erhalten.
- Ich stelle **nicht** wieder auf ein einziges globales Video um.

#### 3. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
Den Preview-Player an die neue Preview-Strategie anbinden.

Geplant:
- `previewMode: true` an `DirectorsCutVideo` weitergeben
- native Audio-Elemente nicht mehr unnötig früh voll preloaden
  - zuerst `metadata` oder lazy setup
  - volles Audio erst bei Play/Unmute
- bestehende Verbesserungen (`stable playerKey`, gedrosselte `timeupdate`) beibehalten

### Warum das den Fehler sehr wahrscheinlich behebt

Der aktuelle Engpass ist vermutlich nicht mehr nur die Transition-Animation selbst, sondern die Kombination aus:

- **doppelten Playern**
- **doppeltem Audio**
- **zu spätem Mount der nächsten Szene**

Gerade an Übergängen steigt die Last sprunghaft an, weil dort neue Medieninstanzen aktiv werden. Wenn nur noch **ein** Preview-Player läuft, Audio nicht doppelt lädt und die nächste Szene schon **vorher** gemountet ist, sollte das sichtbare Stocken deutlich zurückgehen.

### Erwartetes Ergebnis
- deutlich flüssigere Vorschau im Director's Cut
- weniger Hänger speziell bei Szenenübergängen
- Übergänge wirken wieder wie echte Übergänge statt wie kurze Pausen

### Dateien
1. `src/pages/DirectorsCut/DirectorsCut.tsx`
2. `src/remotion/templates/DirectorsCutVideo.tsx`
3. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

### Technische Hinweise
- Kein Backend- oder Datenbank-Fix nötig
- Die bereits umgesetzte Dauer-Synchronisierung mit `actualTotalDuration` ist korrekt und nicht der Hauptfehler
- Der wichtigste zusätzliche Hebel ist jetzt: **nur ein Preview-Player gleichzeitig + echtes Premounting im Preview**

