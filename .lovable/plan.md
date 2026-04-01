
Ziel

- Den verbleibenden Stotterer direkt nach jedem Übergang entfernen, ohne das jetzt gute Timing oder die sichtbaren Übergänge wieder zu beschädigen.

Präzise Analyse

- Ich sehe im aktuellen Code noch 4 konkrete Ursachen:
  1. In `useTransitionRenderer.ts` wird im Handoff kurz vor dem Swap noch einmal `base.currentTime = targetTime` gesetzt. Das ist ein zusätzlicher Seek direkt vor dem Sichtbarkeitswechsel, aber ohne auf ein neues `seeked` zu warten. Genau das kann den sichtbaren Mini-Ruckler nach dem Übergang auslösen.
  2. `DirectorsCutPreviewPlayer.tsx` kennt den Renderer-Zustand `handoff` nicht. Die Boundary-Advance-Logik ist nur während aktiver Transition oder nach dem Cooldown gesperrt. Während des Handoffs kann der Player also noch selbst seeken und gegen den Renderer arbeiten.
  3. `lastHandoffBoundaryRef` ist weiterhin nur eine Zahl und wird fuzzy mit `Math.abs(... ) < 0.5` geprüft. Der Code-Kommentar spricht schon von strukturierter Boundary-Markierung, aber umgesetzt ist das noch nicht.
  4. Der Wechsel `active -> handoff` startet aktuell 1 RAF zu spät. Das vergrößert das Zeitfenster, in dem Player und Renderer nicht sauber synchron sind.

Umsetzung

1. Handoff sofort und deterministisch starten
- In `useTransitionRenderer.ts` den Übergang von `active` nach `handoff` im selben Tick initialisieren, nicht erst im nächsten RAF.
- Dabei sofort:
  - incoming einfrieren
  - fixes `handoffTargetTime` setzen
  - base-Seek anfordern
  - Handoff als aktiv markieren

2. Den letzten Blind-Seek vor dem Swap entfernen
- Den zusätzlichen `base.currentTime = targetTime` im `isReady`-Block nicht mehr direkt vor dem Sichtbarkeitswechsel ausführen.
- Stattdessen:
  - nur dann auf base zurückschalten, wenn der bereits angeforderte Seek wirklich settled ist
  - falls die Abweichung noch zu groß ist, im Handoff bleiben und erneut auf echtes `seeked` warten
- So wird base nie sichtbar, während noch ein frischer Korrektur-Seek offen ist.

3. Player während des Handoffs blockieren
- Zwischen Renderer und Player eine gemeinsame Ref für die Transition-Phase ergänzen, z. B. `transitionPhaseRef`.
- In `DirectorsCutPreviewPlayer.tsx` die Boundary-Advance-Logik und die Non-Sequential-Jump-Korrektur deaktivieren, solange `handoff` aktiv ist.
- Ergebnis: Während des Handoffs seekt nur noch eine Stelle, nicht zwei.

4. Boundary-Skip exakt statt fuzzy machen
- `lastHandoffBoundaryRef` auf ein strukturiertes Objekt umstellen, z. B.:
```text
{
  outgoingSceneId,
  incomingSceneId,
  boundarySourceTime
}
```
- Beim erfolgreichen Handoff genau diese Boundary markieren.
- Im Player dann nur exakt diese bereits konsumierte Boundary einmal überspringen.
- Die unscharfe `0.5s`-Prüfung entfernen.

5. Reset- und Seek-Pfade sauber mitziehen
- Alle neuen Handoff-/Phase-/Boundary-Refs bei:
  - manuellem Seek
  - Reset
  - Szenenänderungen
  - Transition-Änderungen
  zuverlässig zurücksetzen.
- Den bestehenden Cooldown beibehalten, aber erst nach erfolgreichem Handoff setzen.

Technische Kurznotiz

```text
Aktuell:
active endet
-> handoff startet verspätet
-> Player darf evtl. schon wieder boundary-seeken
-> base bekommt evtl. noch einen letzten Seek direkt vor dem Swap
-> base wird sichtbar, bevor dieser letzte Seek wirklich settled ist
=> sichtbarer Stotterer nach dem Übergang

Nach Fix:
active endet
-> handoff startet sofort
-> incoming friert auf exakt einem sichtbaren Frame ein
-> nur Renderer darf seeken
-> kein Blind-Seek mehr direkt vor dem Swap
-> swap erst nach bestätigtem settled seek
=> Übergänge bleiben sichtbar, Nach-Ruckler verschwindet
```

Betroffene Dateien

- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

Verifikation

- Crossfade, Wipe, Slide/Push und Zoom prüfen
- Mehrere Übergänge direkt hintereinander prüfen
- Direkt nach jedem Übergang auf Rücksprung/Mikro-Hitch achten
- Seek/Reset/Scrubbing testen
- Sicherstellen, dass die Übergänge selbst sichtbar bleiben
