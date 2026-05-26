## Ziel
Die Kalender-Posts werden schlichter, edler und stärker wie „Star-Wars-Lichtschwerter“: dunkle Glas-Chips mit einer klaren, leuchtenden Klinge statt bunter Vollflächen. Zusätzlich wird die Warteschlange im Tagesfenster anklickbar, sodass jeder Post direkt im bestehenden Post-Composer geöffnet und bearbeitet werden kann.

## Umsetzung

1. **Post-Chips optisch veredeln**
   - `PostChip` von bunten Neon-Flächen auf einen dunklen Premium-Chip umbauen.
   - Pro Plattform nur noch eine dünne leuchtende „Lightsaber“-Linie/Edge verwenden: Instagram magenta, Facebook blau, LinkedIn cyan/blau, TikTok cyan/rose, YouTube rot, X silber.
   - Glow reduziert und hochwertiger: weniger Shimmer, keine überladene Vollgradient-Fläche, bessere Lesbarkeit.
   - Statuspunkt bleibt, aber dezenter und präziser.

2. **Klickproblem im Kalender beheben**
   - Aktuell werden einige editierbare Statuswerte als Mehrfachauswahl behandelt statt den Editor zu öffnen.
   - Post-Klicks sollen immer den Bearbeitungs-Drawer öffnen.
   - Mehrfachauswahl bleibt nur über die Toolbar-Aktion „alle auswählbaren Posts“ erhalten, nicht durch normalen Post-Klick.

3. **Warteschlange im Tagesfenster bearbeitbar machen**
   - `DayCockpitDialog` bekommt einen `onEventClick` Callback.
   - Jeder Eintrag in „Veröffentlichungs-Warteschlange“ wird als klar klickbarer Button dargestellt.
   - Beim Klick: Tagesfenster schließen und den Post im `EventDrawer` mit `PostComposerPanel` öffnen.
   - Dadurch kann man Caption, Briefing, Plattformen, Hashtags, Zeitpunkt und Auto-Publish direkt bearbeiten.

4. **Post-Composer alltagstauglicher machen**
   - „Auto-Publish“-Switch soll nicht nur visuell toggeln, sondern beim Aktivieren sinnvoll speichern bzw. beim finalen CTA den Status `scheduled` setzen.
   - Speichern bleibt als Entwurf möglich; „Bereit zum Auto-Publish“ validiert weiterhin Caption, Plattform und Zukunftszeitpunkt.

## Dateien
- `src/components/calendar/views/PostChip.tsx`
- `src/pages/Calendar.tsx`
- `src/components/calendar/DayCockpitDialog.tsx`
- optional klein: `src/components/calendar/PostComposerPanel.tsx`

## Ergebnis
Die Posts sehen edler und fokussierter aus, und alle Posts aus Kalender und Warteschlange lassen sich direkt öffnen, bearbeiten und für automatisches Publishing finalisieren.