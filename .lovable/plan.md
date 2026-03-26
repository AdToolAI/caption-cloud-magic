
Ziel: Im Director's Cut soll im Schritt „KI-Analyse“ der Originalton standardmässig hörbar sein, und die Preview soll an Szenenübergängen nicht mehr stocken.

Ursachen, die ich im Code gefunden habe:
1. `SceneAnalysisStep.tsx` übergibt bereits `initialMuted={false}`, aber `DirectorsCutPreviewPlayer.tsx` übernimmt das nur einmal in `useState(initialMuted)` und synchronisiert den Zustand danach nicht mehr sauber mit Player/Nativ-Audio.
2. `SceneAnalysisStep.tsx` rendert bei jedem Playback-Tick neu (`setCurrentVideoTime`) und enthält noch sehr viel Debug-/Altlogik. Das belastet genau den Schritt, in dem du das Stocken siehst.
3. `DirectorsCutVideo.tsx` rendert an Übergängen die nächste Szene doppelt: einmal als Overlap-Sequenz und zusätzlich noch einmal als normale Szene mit `premountFor`. Das erhöht die Decode-Last genau an den Cuts.

Umsetzung:

1. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `initialMuted` robust machen:
  - `isMuted` bei Prop-Änderungen mitsynchronisieren
  - beim Mount/Player-Ready den tatsächlichen Mute-State aktiv auf Player + native Audio anwenden
- Audio-Start vereinheitlichen:
  - eine zentrale Helper-Logik für `play/pause/seek/sync`
  - bei `initialMuted={false}` soll nach dem ersten Play-Klick direkt der Originalton starten, ohne extra „Audio aktivieren“
- den Overlay-Button nur zeigen, wenn der Player wirklich absichtlich stumm ist

2. `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
- Playback-induzierte Re-Renders stark reduzieren:
  - `currentVideoTime` nicht mehr ungefiltert bei jedem Tick in den ganzen Step schreiben
  - stattdessen nur grob/throttled für Timeline/aktive Szene aktualisieren oder auf Szenenwechsel begrenzen
- die vielen `console.log`-Aufrufe entfernen
- tote Altlogik entfernen, die noch aus dem früheren HTML-Video-Preview stammt (`videoRef`, `videoFilter`, `videoKey`, ungenutzte Time-Update-Pfade)

3. `src/remotion/templates/DirectorsCutVideo.tsx`
- Übergangs-Rendering entschärfen:
  - keine doppelte Vorab-Montage derselben nächsten Szene mehr
  - `premountFor` nur dort nutzen, wo es wirklich hilft, nicht gleichzeitig auf Overlap- und Haupt-Sequenz
- bestehende Zwei-Layer-Transitions beibehalten, aber die Preview so umbauen, dass an einem Cut nicht unnötig 3 Video-Instanzen parallel aktiv sind

Erwartetes Ergebnis:
- In Schritt 2 ist der Originalsound standardmässig an
- der „Audio aktivieren“-Hinweis erscheint dort nicht mehr fälschlich
- die Preview im KI-Analyse-Schritt wird deutlich ruhiger
- Szenenübergänge ruckeln wesentlich weniger, weil sowohl React-Overhead als auch Video-Dekodierung an den Cuts reduziert werden

Dateien:
1. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
2. `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
3. `src/remotion/templates/DirectorsCutVideo.tsx`

Technische Hinweise:
- Kein Backend-/Datenbank-Fix nötig
- Das ist jetzt vor allem ein Preview-State- und Performance-Fix
- Der wichtigste Unterschied zum letzten Versuch: Ich würde nicht nochmals nur am Transition-Effekt schrauben, sondern gezielt die zwei echten Engpässe beheben: falscher Audio-State + doppelte Last an Übergängen
