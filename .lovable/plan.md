## Diagnose

Das aktuelle Problem liegt nicht mehr am Bundle oder an den neuen Datenbank-Spalten. Die leeren Felder im Screenshot kommen aus dem normalen KI-Briefing-Flow (`compose-video-storyboard`):

- Die Felder werden im UI aus `scene.sceneActionUser` und `characterShots[].actionUser` gelesen.
- Diese Werte werden nur vom separaten `SceneDirectorBox` gesetzt.
- Der KI-Briefing-/Storyboard-Generator erzeugt aktuell aber nur `aiPrompt`, `characterShot(s)`, TextOverlay, Transition usw. — keine `sceneActionUser/En` und keine `actionUser/actionEn` pro Character-Shot.
- Deshalb bleiben die Felder nach einem neuen Briefing leer, obwohl der Prompt selbst bereits die Action enthält.

## Plan

1. **Storyboard Edge Function erweitern**
   - In `compose-video-storyboard` das Tool-Schema pro Szene um folgende Felder erweitern:
     - `sceneActionEn`: kurze englische Zusammenfassung dessen, was allgemein in der Szene passiert.
     - `sceneActionLocalized`: gleiche Aktion in UI-Sprache (`DE/EN/ES`).
     - `characterShots[].actionEn`: was genau diese Person in der Szene tut, Englisch.
     - `characterShots[].actionUser`: gleiche Aktion in UI-Sprache.
   - Den Systemprompt so ergänzen, dass diese Werte aus demselben Inhalt wie `aiPrompt` abgeleitet werden müssen, nicht neu erfunden werden.

2. **Serverseitige Normalisierung/Fallbacks hinzufügen**
   - Nach dem AI-Response jedes Scene-Objekt normalisieren:
     - Wenn `sceneActionEn` fehlt, aus dem `aiPrompt` eine kurze Action-Zeile extrahieren/ableiten.
     - Wenn `sceneActionLocalized` fehlt, auf `sceneActionEn` zurückfallen.
     - Für jeden sichtbaren `characterShot` sicherstellen, dass `actionEn/actionUser` existieren.
     - Bei Charakteren: falls die AI keine separate Aktion liefert, aus dem Prompt rund um den Namen oder aus der allgemeinen Szene eine sinnvolle Kurzaktion erzeugen.
   - Wichtig: Auch die bestehenden Character-Floor/Cap-Reparaturen müssen beim Hinzufügen neuer Character-Slots direkt `actionEn/actionUser` setzen, sonst würden auto-reparierte Slots wieder leer bleiben.

3. **Prompt-Marker beim Storyboard-Output direkt setzen**
   - Beim Mapping in `compose-video-storyboard` die neuen Felder in die zurückgegebenen `ComposerScene`s schreiben:
     - `sceneActionUser`, `sceneActionEn`
     - `characterShots` inklusive `actionUser/actionEn`
   - Optional direkt `applyActionsToPrompt`-äquivalente Marker serverseitig in `aiPrompt` voranstellen oder clientseitig über den vorhandenen SceneCard-Effekt einfügen lassen. Ich würde clientseitig nutzen, weil diese Logik bereits existiert.

4. **Akzeptanz prüfen**
   - Neues KI-Briefing erzeugt Szenen.
   - Im Storyboard sind die allgemeinen und pro-Person-Action-Felder sofort befüllt.
   - Der allgemeine Action-Text stimmt mit dem sichtbaren Prompt-Inhalt überein.
   - Nach Reload bleiben die Werte erhalten, weil die Persistence dafür bereits vorbereitet ist.