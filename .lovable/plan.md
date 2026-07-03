## Ziel
Die linke Director's-Cut-Studio-Leiste wird professionell stabilisiert: feste Breite, kein Drag-Resize, kein horizontales Aufziehen durch lange Texte.

## Umsetzung
1. **Feste Breite statt verstellbarer Breite**
   - Die linke Studio-/Bibliotheksspalte bekommt eine feste Breite von ca. 7 cm Bildschirmmaß, technisch ca. `280px`.
   - `minWidth`, `maxWidth` und `width` werden identisch gesetzt, damit die Spalte nie breiter wird.

2. **Linken Drag-Handle entfernen**
   - Der Trenner zwischen linker Leiste und Preview wird entfernt.
   - Nutzer können die linke Leiste nicht mehr nach rechts ziehen.
   - Der rechte Inspector-Trenner bleibt unverändert, weil das nicht das gemeldete Problem betrifft.

3. **Keine wechselnde linke Spaltenbreite mehr**
   - Die bisherige gespeicherte `sidebarWidth`-Logik und `localStorage`-Breite für die linke Leiste wird entfernt oder nicht mehr genutzt.
   - Die linke Leiste bleibt im Studio konstant breit, statt je nach Session/Viewport anders zu starten.

4. **Overflow hart absichern**
   - Die linke Spalte und ihr Inhalt bekommen `overflow-hidden`, `min-w-0` und feste Containergrenzen.
   - Lange Texte innerhalb von Text-Overlay-, Untertitel- und Bibliothekslisten dürfen nur umbrechen oder vertikal wachsen, aber nie die Spalte verbreitern.

5. **Konkreter Screenshot-Fall**
   - Der lange Text im Text-/Untertitelbereich darf die Zeile nicht horizontal ausdehnen.
   - Wo Text editiert oder angezeigt wird, wird `whitespace-normal`, `break-words`/`overflow-wrap:anywhere` und bei Preview-Zeilen ggf. `line-clamp` genutzt.

## Betroffene Dateien
- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/components/directors-cut/studio/CapCutSidebar.tsx`
- ggf. betroffene Sidebar-Unterpanels, falls dort noch `whitespace-nowrap`, `truncate` oder horizontale Mindestbreiten die Spalte aufziehen.

## Verifikation
- In der linken Studio-Leiste sehr langen Text eingeben.
- Die Leiste bleibt konstant ca. 280px breit.
- Kein horizontaler Scrollbalken, kein Abschneiden über die Spaltengrenze, keine Drag-Möglichkeit nach rechts.
- Preview-/Timeline-Bereich verschiebt sich nicht durch Texteingabe.