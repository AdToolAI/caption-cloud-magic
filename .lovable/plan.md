## Ziel
Die linke Director's-Cut-Seitenleiste wird endgültig stabil: nicht ziehbar, ca. 10 cm breit statt 7 cm, keine abgeschnittenen Buttons/Texte, keine verschobene Preview durch Inhalt.

## Umsetzung
1. **Feste professionelle Breite erhöhen**
   - `FIXED_LIBRARY_PANEL_WIDTH` von `280px` auf einen festen Wert um ca. `380px` setzen.
   - `width`, `minWidth` und `maxWidth` bleiben identisch, damit die Leiste nie verstellbar ist.

2. **Keinen linken Cut/Resize zurückbringen**
   - Der linke `PanelDivider` bleibt entfernt.
   - Es gibt keine Drag-Logik, keine gespeicherte linke Breite und keinen Collapse für die linke Leiste.
   - Nur der rechte Inspector darf weiterhin resizebar bleiben.

3. **Sidebar-Inhalt an feste 10-cm-Spalte anpassen**
   - Die innere Icon-Leiste bleibt fix.
   - Der Inhaltsbereich bekommt klare Breiten-/Overflow-Regeln (`min-w-0`, `max-w-full`, `overflow-hidden`).
   - Buttons und Reihen im Schnitt-Panel werden so angepasst, dass sie innerhalb der 380px sauber umbrechen oder in zwei Zeilen laufen statt abgeschnitten zu wirken.

4. **Konkretes Verschiebungsproblem im Screenshot beheben**
   - Der große Button „Am Playhead teilen“ und die danebenliegenden Aktionsbuttons werden nicht mehr über die Spalte hinausgedrückt.
   - Action-Zeilen im `CutPanel` werden responsive innerhalb der linken Leiste angeordnet, nicht horizontal aus der Leiste heraus.

5. **Verifikation**
   - Director's Cut öffnen.
   - Prüfen: linke Leiste bleibt konstant breit, nicht ziehbar, kein abgeschnittener Button, Preview beginnt sauber rechts daneben.
   - Langer Text/Untertitel darf nur vertikal wachsen oder umbrechen, aber die Leiste nie verbreitern.