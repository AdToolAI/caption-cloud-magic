
Ziel: Das echte Laufzeitproblem beheben, nicht nochmal am Timing raten. Der neue Fehler ist jetzt klarer: Beim Übergang 1→2 bleibt der Regler stehen, obwohl rechts das Video weiterläuft. Das bedeutet: Transport und Darstellung laufen auf zwei verschiedenen Video-Elementen auseinander.

1. Genaues Problem
- In `DirectorsCutPreviewPlayer.tsx` ist das Base-Video weiterhin die Zeitquelle des gesamten Players (`video.currentTime`).
- In `useTransitionRenderer.ts` wird genau dieses Base-Video während der aktiven Transition absichtlich `pause()`d und auf dem letzten Frame eingefroren.
- Gleichzeitig läuft das `incoming`-Video weiter und zeigt den Übergang visuell an.
- Folge:
  - Slider/`displayTime`/`visualTimeRef` hängen an der eingefrorenen Base-Time fest
  - das sichtbare Overlay-Video bewegt sich weiter
  - dadurch wirkt der Player “aufgehangen”, obwohl rechts das Bild weiterläuft

2. Zweites bestätigtes Problem
- Die 30s vs. 32s sind noch nicht vollständig sauber gelöst:
  - `VideoImportStep.tsx` verwendet beim Library-Select teils noch `duration_in_frames / 30`
  - `VisualTimeline.tsx` und `SceneEditingStep.tsx` berechnen die Gesamtdauer per Summe der Szenenlängen statt per echter Timeline-Grenze (`max(end_time)`)
- Wenn Szenen lückenlos, aber verschoben/gestretcht sind, kann Summe und echte Timeline-Gesamtdauer auseinanderlaufen.

3. Dateien mit der eigentlichen Ursache
- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/steps/VideoImportStep.tsx`
- `src/components/directors-cut/ui/VisualTimeline.tsx`
- `src/components/directors-cut/steps/SceneEditingStep.tsx`

4. Umsetzung
- `useTransitionRenderer.ts`
  - Base-Video nicht mehr als transportkritische Zeitquelle “hart pausieren”, ohne dass der Player das weiß
  - stattdessen Freeze rein visuell entkoppeln:
    - entweder Base nicht pausieren und nur Darstellung/Fallback kontrollieren
    - oder expliziten Transition-Transport-State nach außen geben, damit der Player während aktiver Transitions nicht mehr `video.currentTime` als Wahrheit benutzt
  - Freeze/Reset-Pfade vereinheitlichen, damit Slide nicht mehr Layout-Reste hinterlässt

- `DirectorsCutPreviewPlayer.tsx`
  - Während aktiver Transition darf die Timeline nicht mehr blind aus `videoRef.current.currentTime` gelesen werden
  - aktiven Übergang einmal pro Frame auf Timeline-Basis bestimmen und `timelineTime` daraus kontinuierlich fortschreiben
  - wenn Base eingefroren ist, den Regler trotzdem mit der Transition-Zeit weiterlaufen lassen
  - Scene-Detection und Boundary-Advance strikt auf dieselbe Zeitdomäne bringen
  - Seek/Reset/Restart so anpassen, dass kein alter Transition-Zustand wiederverwendet wird

- Dauer-Fix ergänzen
  - `VideoImportStep.tsx`: für Mediathek primär `metadata.duration_seconds`
  - `SceneEditingStep.tsx` + `VisualTimeline.tsx`: Gesamtdauer nicht als Summe, sondern als `max(end_time)` berechnen
  - damit Schritt 2, Schritt 3, Regler und Timeline dieselbe Dauer anzeigen

5. Warum dieser Fix der richtige ist
- Das aktuelle Verhalten ist kein kosmetischer Fehler, sondern ein Transport-Bug:
```text
Base-Video = Zeitquelle
Base-Video wird in Transition eingefroren
Incoming-Video läuft weiter
=> sichtbares Bild und Slider laufen auseinander
```
- Solange genau das nicht korrigiert wird, bleiben alle weiteren Timing-Patches instabil.

6. Erfolgskriterien
- Beim Übergang 1→2 läuft der Regler sauber weiter und bleibt nicht an der Grenze stehen
- Kein “rechts weiterlaufendes” Video mehr bei gleichzeitig eingefrorenem Slider
- Der erste Slide verschiebt das Bild nicht mehr
- Schritt 2 und Schritt 3 zeigen dieselbe Gesamtdauer
- Übergänge bleiben sichtbar, ohne dass Transport und UI auseinanderdriften

7. Technische Kurznotiz
- Ich würde das als Transport-Fix umsetzen, nicht als weiteren Transition-Tweak.
- Wichtigste Änderung:
```text
Transition-Layer darf nicht unabhängig von der Playback-Zeit laufen.
Entweder:
A) Base bleibt Zeitquelle und wird nicht hart pausiert
oder
B) Player bekommt während aktiver Transition eine eigene fortlaufende Timeline-Zeit
```
- In diesem Code ist B wahrscheinlich sauberer, weil die Freeze-Logik schon existiert und nur korrekt in die Playback-Steuerung integriert werden muss.
