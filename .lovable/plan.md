
Ziel: Nicht die Sidebar ändern, sondern den echten verbleibenden Scroll-Owner sauber bestimmen. Die äußere Scrollbar zu entfernen ist technisch möglich, aber sehr wahrscheinlich nicht die richtige Lösung.

Kurzantwort auf deine Frage:
- Ja, man kann die äußere Scrollbar entfernen.
- Sinnvoll ist das nur, wenn du bewusst ein App-Shell-Scrolling willst.
- Für dein Problem würde das die Ursache eher verstecken als lösen.

Befund aus dem Code:
- `AppSidebar.tsx` nutzt bereits kein `SidebarContent` mehr und hat aktuell keinen offensichtlichen eigenen Vertikal-Scroll mehr.
- Im Screenshot ist jetzt die Hub-Seite „Erstellen“ betroffen, also nicht nur Home.
- `Home.tsx` und `HubPage.tsx` erzeugen selbst keinen klaren Full-Height-Scrollcontainer.
- Damit sitzt die zweite Scrollbar sehr wahrscheinlich höher im App-Shell/Layout und nicht mehr in der linken Icon-Leiste.

Was ich als Nächstes umsetzen würde:
1. Exakten Scroll-Owner im laufenden Preview identifizieren
   - Per DOM-Inspektion das Element finden, das die innere rechte Scrollbar wirklich trägt.
   - Entscheidend sind `overflow-y`, `clientHeight` und `scrollHeight` des betroffenen Wrappers.

2. Standardlösung bevorzugen: äußere Scrollbar behalten
   - Die äußere Browser-/Dokument-Scrollbar ist normalerweise die richtige.
   - Danach den zusätzlichen inneren Scrollcontainer im App-Shell entfernen.
   - Wahrscheinliche Zielstellen:
     - `src/App.tsx`
     - `src/components/ui/sidebar.tsx` (Provider-/Wrapper-Verhalten)
     - ggf. `src/index.css` für globale Overflow-/Height-Normalisierung

3. Nur wenn ausdrücklich gewünscht: äußere Scrollbar entfernen
   - Dann würde ich `html/body` bzw. den Root so umstellen, dass die Seite selbst nicht mehr scrollt.
   - Stattdessen scrollt nur noch der Hauptcontent-Bereich.
   - Das ist ein bewusst anderes Navigationsmodell und kann Sticky-Header, Ticker, Stepper, Modals und Mobile-Verhalten beeinflussen.

Empfohlene Umsetzung:
- Nicht die äußere Scrollbar entfernen.
- Stattdessen den verbliebenen inneren Scroll-Container auf App-Shell-Ebene entfernen, sodass genau eine Scrollbar übrig bleibt.

Technische Zielregel:
```text
Erlaubt:
- genau 1 vertikale Scrollbar für normale Seiten

Nur ausnahmsweise:
- zusätzliche Scrollbars in Dialogen, Drawern, Chat-/Editor-Panels

Nicht erlaubt:
- normale Seiten oder App-Shell mit zweitem sichtbaren Vertikal-Scroll
```

Betroffene Dateien für den Fix:
- `src/App.tsx`
- eventuell `src/components/ui/sidebar.tsx`
- eventuell `src/index.css`

Erwartetes Ergebnis:
- Die linke Sidebar bleibt exakt wie sie ist.
- Es bleibt nur eine vertikale Scrollbar sichtbar.
- Falls du ausdrücklich das Gegenteil willst, kann alternativ die äußere Scrollbar entfernt und der Hauptcontent zum einzigen Scrollbereich gemacht werden.
