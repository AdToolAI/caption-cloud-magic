## Ziel
Die linke Director's-Cut-Leiste wird endgültig stabil und deutlich breiter: ca. 13–14 cm statt 10 cm. Sie bleibt nicht ziehbar, verschiebt die Preview nicht durch Inhalt und schneidet keine Controls, Texte oder Buttons mehr ab.

## Umsetzung
1. **Fixbreite auf 13–14 cm erhöhen**
   - Die linke Studio-/Bibliothek-Leiste wird auf einen festen Wert im Bereich ca. `520px` gesetzt.
   - `width`, `minWidth` und `maxWidth` bleiben identisch, damit die Leiste nie verstellbar ist.
   - Der linke Resize/Cut bleibt vollständig entfernt.

2. **Layout-Spalten stabilisieren**
   - Die Haupt-Shell bekommt weiterhin eine feste linke Spalte und eine flexible Preview-Spalte.
   - Inhalte in der linken Leiste dürfen die Spalte nicht verbreitern.
   - Preview und Timeline starten sauber rechts neben der fixen Leiste, ohne Überlagerung.

3. **Alle Sidebar-Inhalte gegen Abschneiden absichern**
   - Tabs, Scrollbereiche, Formulare, Selects, Button-Reihen und Panels bekommen konsequent `min-w-0`, `max-w-full` und passende Overflow-Regeln.
   - Lange Labels, Hinweise und deutsche Texte umbrechen vertikal statt horizontal aus dem Panel zu laufen.
   - Bei nicht sinnvoll umbrechbaren Bereichen wird horizontaler Inhalt innerhalb des Panels vermieden oder intern gescrollt, nicht abgeschnitten.

4. **Konkrete sichtbare Problemstellen aus dem Screenshot beheben**
   - Untertitel-/Text-Panel: Position, Schriftgröße, Farbfelder, Font-Select, Max-Zeilen, Umrandung und CTA-Button passen vollständig in die breitere Leiste.
   - Button-Zeilen laufen bei Bedarf in mehrere Zeilen.
   - Keine halb abgeschnittenen rechten Buttons/Controls mehr.

5. **Regression verhindern**
   - Den linken `PanelDivider` nicht zurückbringen.
   - Keine gespeicherte linke Panelbreite, keine Drag-Logik, kein Collapse für diese Leiste.
   - Nur der rechte Inspector darf resizebar bleiben.

6. **Verifikation**
   - Director's Cut im Browser öffnen.
   - Prüfen: linke Leiste ist fest ca. 520px breit, nicht ziehbar, keine abgeschnittenen Inhalte im gezeigten Untertitel-Panel, Preview beginnt sauber rechts daneben.
   - Zusätzlich mit langem Text prüfen: Inhalt bricht um oder scrollt vertikal, aber die Leiste verbreitert sich nicht und nichts wird rechts abgeschnitten.