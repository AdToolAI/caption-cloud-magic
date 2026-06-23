Ja, das lässt sich genau so umsetzen. Aktuell spielt die Sequenz (`StageWelcomeMoment`) bei jedem Aufruf von `/video-composer`, der kein Browser-Reload ist – der `SESSION_KEY` ist im Code zwar definiert, wird aber gar nicht geprüft.

## Was geändert wird

1. **Trigger nur beim Klick im „Erstellen“-Hub**  
   Auf der `/hub/erstellen`-Seite wird beim Klick auf die Motion-Studio-Kachel (Route `/video-composer`) ein kurzlebiges Flag in `sessionStorage` gesetzt:  
   `motion-studio:intro-trigger = "1"`.  
   Andere Wege nach `/video-composer` (Direktlink, Reload, Rücksprung aus Sub-Seiten, Navigationswechsel zwischen Plattform und Lovable) setzen dieses Flag nicht.

2. **Max. 1×/Tag**  
   `StageWelcomeMoment` prüft beim Mount:
   - Existiert das Trigger-Flag aus Schritt 1? Falls nein → Intro wird sofort übersprungen.
   - Wurde heute bereits abgespielt? Vergleich mit `localStorage["motion-studio:intro-last-date"]` (YYYY-MM-DD). Falls heute → übersprungen.
   - Sonst: Intro abspielen, danach **Datum von heute** in `localStorage` schreiben und Trigger-Flag konsumieren (löschen).

3. **Skip/ESC/Klick** verhalten sich wie bisher, markieren das Intro aber ebenfalls als „heute gesehen“, damit es bei einem weiteren Wechsel am gleichen Tag nicht erneut kommt.

4. **Browser-Reload-Schutz** (bereits vorhanden via `isPageReload()`) bleibt erhalten.

## Akzeptanztests (manuell)

- Klick in der Sidebar auf „Erstellen“ → Kachel „Motion Studio“ → Intro spielt 1× ab.  
- Direkt danach von Motion Studio z. B. zu `/home` und wieder über Sidebar → Erstellen → Motion Studio → **kein** Intro.  
- Direkter Aufruf `/video-composer` (Bookmark, F5, Lovable-Preview-Wechsel) → **kein** Intro.  
- Am nächsten Tag erneut über Sidebar → Erstellen → Motion Studio → Intro spielt wieder einmal.

## Betroffene Dateien

- `src/components/video-composer/stage/StageWelcomeMoment.tsx` (Daily-Gate + Trigger-Flag-Konsum)
- `src/pages/HubPage.tsx` (Set Trigger-Flag im `onClick` der Motion-Studio-Kachel des „Erstellen“-Hubs)