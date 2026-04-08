
Ziel

- Der Export-Fortschritt soll glaubwürdig und sichtbar laufen, statt optisch bei 10% festzuhängen.
- Nach Abschluss soll es im Overlay zusätzlich einen direkten Button zur Mediathek geben.

Warum es aktuell unnatürlich wirkt

- In `CapCutEditor.tsx` wird der Fortschritt momentan mit einem harten Mindestwert (`10%`) angezeigt.
- Wenn ein Polling-Request kurz keine neuen Werte liefert, bleibt die UI dadurch gefühlt stehen.
- Das Overlay hat im Erfolgszustand nur Download + Zurück zum Editor, aber keinen direkten Sprung zur Mediathek.

Umsetzung

1. `CapCutEditor.tsx` — Fortschritt realistischer machen
- Den harten 10%-Floor entfernen.
- Zusätzliche States ergänzen, z. B.:
  - `serverRenderProgress`
  - `displayRenderProgress`
  - `renderEstimatedTimeSeconds`
  - `lastProgressSource`
- `estimated_time_seconds` aus der `render-directors-cut` Response speichern.
- `check-remotion-progress` weiter als Hauptquelle nutzen, aber sauber unterscheiden:
  - echte Prozentwerte aus `overallProgress`
  - weichere ETA-basierte Fortschreibung, wenn kurz keine neuen Serverwerte kommen
- Sofort einmal pollen und danach in engem Rhythmus weiter pollen.
- Zwischen den Polls den sichtbaren Balken sanft fortschreiben, basierend auf:
  - letztem Serverstand
  - `startedAt`
  - `estimated_time_seconds`
- Fortschritt niemals rückwärts laufen lassen und erst bei echtem `done` auf 100% setzen.

2. Status klarer staffeln
- `preparing`: Startphase
- `rendering`: Haupt-Rendering
- `finalizing`: letzte Phase kurz vor Fertigstellung
- `completed`: nur wenn das Video wirklich fertig ist
So bekommt der Nutzer eine glaubwürdigere Rückmeldung als nur „10% → plötzlich fertig“.

3. `RenderOverlay.tsx` — Mediathek-Button ergänzen
- Im Completed-State einen dritten CTA ergänzen:
  - `Zur Mediathek`
- `RenderOverlay` erhält dafür einen neuen Prop wie `onOpenLibrary`.

4. Navigation zur Mediathek verdrahten
- In `CapCutEditor.tsx` `useNavigate()` hinzufügen.
- Neuer Handler navigiert auf:
  - `/media-library?tab=rendered`
- Das passt zu bestehenden Mustern im Projekt.

Dateien

- `src/components/directors-cut/studio/CapCutEditor.tsx`
  - Export-Response um `estimated_time_seconds` nutzen
  - Polling + sichtbaren Fortschritt entkoppeln
  - realistischere Statusübergänge
  - Handler für „Zur Mediathek“
- `src/components/directors-cut/studio/RenderOverlay.tsx`
  - neuen Button im Erfolgszustand
  - neuer `onOpenLibrary`-Prop
  - ggf. kleine Textanpassung für `finalizing`

Technische Details

- Der echte Backend-Status bleibt die primäre Quelle.
- Die zusätzliche Fortschrittsbewegung ist nur eine sanfte UI-Interpolation zwischen echten Polling-Werten, damit der Balken nicht eingefroren wirkt.
- Die Overlay-Logik bleibt blockierend, damit während des Exports nichts weiter verändert wird.

Ergebnis

- Der Ladebalken bewegt sich sichtbar und plausibel.
- Der Nutzer erkennt besser, ob gerade gerendert oder finalisiert wird.
- Nach Fertigstellung kann er direkt aus dem Overlay in die Mediathek springen und das Video dort prüfen.
