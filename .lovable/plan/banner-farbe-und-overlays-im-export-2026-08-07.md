# Banner-Farbe und Overlays im Export

Zwei getrennte Fehler.

## 1. Overlays fehlen im fertigen Video (Hauptproblem)

Der Export-Knopf im Director's Cut Studio schickt die Text- und Grafik-Overlays gar nicht mit. Im Studio-Export werden Szenen, Effekte, Ton und Untertitel übergeben — `text_overlays` fehlt komplett. Die Render-Funktion und der Remotion-Renderer können Overlays verarbeiten (der zweite, ältere Export-Weg schickt sie korrekt), deshalb kommt das Video "roh" zurück.

Fix: Der Studio-Export übergibt die Overlays genauso wie die Untertitel — inklusive Sichtbarkeitsschalter (ausgeblendete Overlays werden nicht mitgerendert) und Zeitfeldern in Sekunden.

## 2. Gewählte Flächenfarbe schlägt nicht durch

Der Renderer bevorzugt inzwischen die gewählte Fläche gegenüber dem Verlauf der Vorlage, aber nur wenn `fill` gesetzt ist. Es gibt zwei Wege, an denen es weiterhin scheitert:

- Ältere Overlays speichern die Farbe unter `backgroundColor` statt `fill` — dann greift weiter der Goldverlauf.
- "Verlauf entfernen" wird als `undefined` gespeichert und geht beim Speichern/Laden des Projekt-Entwurfs verloren, wodurch der Verlauf der Vorlage zurückkommt.

Fix: Eine ausdrücklich gewählte Fläche (auch `transparent`, auch aus dem alten Feld) gewinnt immer gegen den Verlauf; das Entfernen des Verlaufs wird dauerhaft als `null` gespeichert, damit es Speichern und Neuladen übersteht. Gilt einheitlich für Banner, Störer, Karten, Lower Thirds und CTA.

## Technische Details

- `src/components/directors-cut/studio/CapCutEditor.tsx`: In `runExportInternal` `text_overlays` in den Payload aufnehmen (gefiltert über `showTextOverlays`, Felder `startTime`/`endTime`, `kind`, `box`, `style`, `slots`, `enter`/`exit`), Abhängigkeiten des `useCallback` ergänzen.
- `src/remotion/components/OverlayGraphic.tsx`: Hintergrundwahl umstellen auf „expliziter Fill (fill oder backgroundColor, inkl. `transparent`) > gradient > Default"; `badge`/`cta` auf dieselbe Logik ziehen.
- `src/components/directors-cut/features/overlays/OverlayInspector.tsx`: Flächen-Kacheln setzen `gradient: null`, die Verlauf-Kachel setzt `fill: null`; Auswahl-Markierung entsprechend anpassen.
- `src/types/directors-cut.ts`: `fill`/`gradient` als nullable zulassen.

## Prüfung

Banner mit schwarzer Fläche anlegen, Projekt neu laden (Farbe bleibt schwarz), exportieren und im fertigen Video Banner plus Untertitel sichtbar prüfen.
