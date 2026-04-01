
Ziel

- Den verbleibenden Mini-Stotterer direkt nach jedem Übergang entfernen, ohne das jetzt gute Transition-Timing wieder kaputtzumachen.

Wahrscheinliche Root Cause

- In `useTransitionRenderer.ts` wird beim Handoff nur einmal ein Ziel-Zeitpunkt gesetzt (`handoffTargetTimeRef = incoming.currentTime`), aber das sichtbare incoming-Video läuft währenddessen weiter.
- Beim Swap ist das sichtbare incoming-Bild dadurch schon ca. 0,1–0,2s weiter als das Base-Video, auf das zurückgeschaltet wird. Genau das erzeugt den kurzen Rücksprung.
- Der Handoff wird aktuell außerdem zu früh freigegeben: Es wird nur `readyState + timeDiff` geprüft, aber nicht auf ein echtes `seeked` des Base-Videos gewartet.
- Im Player wird nicht die exakt konsumierte Transition-Boundary markiert, sondern nur eine ungefähre Zeit. Dadurch bleibt die Boundary-Logik unnötig unscharf.

Umsetzung

1. Handoff auf einen echten Frame-Freeze umstellen
- In `useTransitionRenderer.ts` die letzte aktive Transition in einer Ref behalten.
- Beim Wechsel `active -> handoff`:
  - incoming sofort pausieren, aber sichtbar lassen
  - dessen aktuelle Zeit als fixes Handoff-Target einfrieren
  - Base-Video genau auf dieses Target seeken
- So bleibt das sichtbare Bild stabil stehen, während Base im Hintergrund exakt auf denselben Frame synchronisiert.

2. Handoff erst nach echtem Base-Seek abschließen
- Für das Base-Video im Handoff echte Readiness-Flags ergänzen (`seeked`, ggf. `canplay`/`loadeddata`).
- Den Handoff nur dann beenden, wenn:
  - der Base-Seek wirklich angekommen ist
  - `readyState >= 2`
  - `timeDiff` klein genug ist
  - plus Safety-Fallback nach einer Maximalzahl Frames
- Erst danach incoming ausblenden und sauber auf Base zurückschalten.

3. Boundary-Skip exakt statt fuzzy machen
- `lastHandoffBoundaryRef` in eine strukturierte Markierung ändern, z. B. mit:
  - `outgoingSceneId`
  - `boundarySourceTime`
  - optional `sceneIndex`
- In `DirectorsCutPreviewPlayer.tsx` die Boundary-Advance-Logik dann nur für genau diese bereits per Handoff verarbeitete Transition einmal skippen, statt mit `Math.abs(... ) < 0.5` zu raten.

4. Reset- und Seek-Pfade mitziehen
- Alle neuen Handoff-/Seek-Refs bei manuellem Seek, Reset und Szenen-/Transition-Änderungen sauber zurücksetzen.
- Den bestehenden Cooldown beibehalten, aber erst nach erfolgreich abgeschlossenem Handoff setzen.

Technische Details

```text
Heute:
active
 -> handoff
 -> targetTime wird 1x gesnapshottet
 -> incoming bleibt sichtbar und läuft weiter
 -> base synced nur auf alten Snapshot
 -> swap auf base
 => sichtbarer Mini-Rücksprung

Nach Fix:
active
 -> handoff
 -> incoming wird auf letztem sichtbaren Frame pausiert
 -> base seekt exakt auf denselben Frame
 -> warten auf echtes base.seeked + ready
 -> erst dann sauberer swap
 => kein Stotterer nach dem Übergang
```

Betroffene Dateien

- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

Verifikation

- Crossfade, Wipe, Slide/Push testen
- Mehrere Übergänge direkt hintereinander testen
- Seek/Reset testen
- Prüfen, dass Übergänge sichtbar bleiben und der Post-Transition-Stotterer weg ist
