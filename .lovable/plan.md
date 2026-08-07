# Banner: gewählte Flächenfarbe wird vom Gold-Verlauf überstimmt

## Befund

Du hast die Vorlage „Banner oben — Gold" benutzt. Diese Vorlage bringt einen fest hinterlegten Goldverlauf mit (`gradient: [GOLD, '#C79B3F']` in `src/lib/directors-cut/overlayPresets.ts`, Zeile 118).

Im gemeinsamen Renderer `src/remotion/components/OverlayGraphic.tsx` (Zeile 56) gewinnt dieser Verlauf bedingungslos gegen die Flächenfarbe:

```text
background = s.gradient ? "linear-gradient(...)" : fill
```

Dein Klick auf Schwarz setzt zwar `style.fill`, der Verlauf bleibt aber gesetzt und überdeckt ihn. Deshalb ändert sich die Textfarbe (die kennt keinen Verlauf) und die Fläche nicht. Dieselbe Reihenfolge steckt auch in `badge` (Zeile 192) und `cta` (Zeile 257) — dort tritt der Fehler mit denselben Vorlagen genauso auf.

## Fix

**1. Klick auf eine Flächenfarbe ist eine klare Entscheidung.**
Im `OverlayInspector` setzt die Farbauswahl künftig `fill` *und* entfernt den Verlauf. Wer Schwarz wählt, bekommt Schwarz — auch bei einer Verlauf-Vorlage.

**2. Der Renderer respektiert eine explizit gesetzte Fläche.**
Die Reihenfolge wird zu: explizite Fläche schlägt Verlauf, Verlauf schlägt Standard. Das repariert auch bereits gespeicherte Projekte, in denen beides gesetzt ist, und gilt einheitlich für Banner, Badge und CTA.

**3. Verlauf bleibt erreichbar.**
Damit der Goldverlauf nicht verloren geht, bekommt die Farbreihe „Fläche" ein zusätzliches Verlauf-Feld als erste Option. Es stellt den Verlauf der Vorlage wieder her. Ohne das wäre die Entscheidung für eine Vollfläche eine Einbahnstraße.

Weil Vorschau und Export denselben Renderer benutzen, gilt die Korrektur automatisch auch im gerenderten Video — die WYSIWYG-Parität bleibt erhalten.

## Technische Details

- `src/remotion/components/OverlayGraphic.tsx`: `background` so berechnen, dass ein gesetztes `s.fill` Vorrang vor `s.gradient` hat; die Zweige in `banner`, `badge` und `cta` auf dieselbe Logik ziehen.
- `src/components/directors-cut/features/overlays/OverlayInspector.tsx`: Farbauswahl der Fläche ruft `onUpdateStyle({ fill: c, gradient: undefined })`; zusätzliche Verlauf-Kachel setzt `gradient` zurück und leert `fill`.
- Kein Eingriff in Presets, Timeline, Export-Payload oder Datenbank.
