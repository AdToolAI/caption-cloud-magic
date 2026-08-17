# Universal Content Creator — Untertitel: Position, Zentrierung & Restfehler

## Befund (im Code verifiziert)

1. **Position wirkt nicht / Zentrierung springt (Hauptfehler).**
   In `UniversalCreatorVideo.tsx` rendert `SubtitleLayer` in einem `AbsoluteFill`. Remotions `AbsoluteFill` hat `flexDirection: column`. Der Layer setzt aber `justifyContent: 'center'` (= vertikale Achse → immer vertikal mittig) und steuert die Position über `alignItems` (= horizontale Achse). Ergebnis exakt wie beschrieben: Der Text bleibt vertikal immer in der Mitte, und „Oben" schiebt ihn zusätzlich nach links, „Unten" nach rechts — die Zentrierung wirkt dadurch je nach Position unterschiedlich.

2. **Zweiter Renderpfad hat eine andere Position-Logik.**
   `PrecisionSubtitleOverlay` (nur für `highlight`/`hormozi`/`wordByWord`) nutzt `bottom: 8%` / `top: 8%` / `top: 50%`, während `SubtitleLayer` `10%` / `8%` verwendet. Beim Wechsel der Animation springt der Untertitel also seine Höhe.

3. **Vorschau-Box im Styling-Panel ignoriert die Position** und skaliert die Schriftgröße nicht: `fontSize` wird als rohe CSS-px in einer 128px hohen Box gezeigt, im Video sind es Kompositions-px (1080 px Breite). Deshalb sieht die Panel-Vorschau anders aus als das Video.

4. **Animationsliste unvollständig.** Der Typ und das Render-Schema kennen `typewriter`, `highlight`, `scaleUp`, `glitch`; die Auswahl im Editor bietet nur `none/fade/slide/bounce/hormozi`. Gespeicherte Werte lassen sich nicht mehr auswählen.

5. **Sprach-Lecks im deutschen Block** (`src/lib/translations.ts`, DE-Sektion): `fontSize: "tamaño de fuente"`, `backgroundBox: "Caja de fondo"`, `bgColor: "Color de fondo"`, `bgOpacity: "Transparencia del fondo"`, `autoGenerateSubtitles: "Genera subtítulos …"`, `scriptGeneratorDesc` (spanisch). Genau das zeigt der Screenshot.

## Umsetzung

**A. Positions-Layout korrigieren (`SubtitleLayer`)**
- Horizontale Zentrierung über `alignItems: 'center'` (Querachse in der Column-Richtung), vertikale Platzierung über `justifyContent: 'flex-start' | 'center' | 'flex-end'`.
- Abstände als geteilte Konstanten: `top` = 8 % von oben, `bottom` = 10 % von unten, `center` = exakt mittig; Text bleibt in allen drei Fällen horizontal identisch zentriert (`textAlign: center`, gleiche `maxWidth`).

**B. Beide Renderer auf dieselben Positionswerte ziehen**
- Eine gemeinsame Konstanten-Quelle für Untertitel-Position/Ränder, die `SubtitleLayer` und `PrecisionSubtitleOverlay` benutzen, damit der Wechsel der Animation die Höhe nicht mehr verschiebt.

**C. Panel-Vorschau ehrlich machen (`SubtitleStyleEditor`)**
- Vorschau-Box bekommt Video-Seitenverhältnis-Verhalten: Text wird gemäß gewählter Position (oben/mitte/unten) in der Box platziert.
- Schriftgröße in der Box proportional zur Kompositionsbreite skalieren, damit Panel und Live-Preview optisch übereinstimmen.

**D. Animationsauswahl vervollständigen**
- `typewriter`, `highlight`, `scaleUp`, `glitch` in die Auswahl aufnehmen (mit lokalisierten Labels), damit alle vom Renderer unterstützten Modi wählbar sind.

**E. Sprache bereinigen**
- Die genannten spanischen Strings im DE-Block auf Deutsch setzen; EN/ES-Blöcke unverändert lassen.

## Betroffene Dateien
- `src/remotion/templates/UniversalCreatorVideo.tsx` (Positions-Layout `SubtitleLayer`)
- `src/remotion/components/PrecisionSubtitleOverlay.tsx` (gleiche Positionswerte)
- `src/remotion/utils/subtitleConstants.ts` (geteilte Positionskonstanten)
- `src/components/video/SubtitleStyleEditor.tsx` (Vorschau mit Position + Skalierung, Animationsliste)
- `src/lib/translations.ts` (DE-Strings)

Keine Änderungen an Director's Cut, Motion Studio oder der Lip-Sync-Pipeline; die Untertitel-Konstanten für den Director's Cut bleiben unangetastet.
