## Ziel
Neue KI-Briefings sollen bei Szenen mit mehreren Charakteren nicht mehr nur eine Person fokussieren. Wenn mehrere Charaktere in einer Szene vorkommen, müssen alle sichtbar sein, jeweils eine eigene Handlung haben und die Szene muss für Lip-Sync nutzbar sein: entweder Dialog miteinander oder klarer Turn zur Kamera.

## Plan
1. **Storyboard-Regeln härten**
   - In `compose-video-storyboard` die Multi-Character-Regeln von „co-presence optional“ auf „Lip-Sync-safe group scene“ ändern.
   - Für 2+ sichtbare Charaktere erzwingen: wide/medium group framing, all faces visible, no cropped/hidden/back-only/POV cast slots, clear left-to-right placement, no single-character close-up.
   - `sceneActionEn` darf nicht mehr nur Sarah/den ersten Charakter beschreiben, sondern muss die gemeinsame Szene beschreiben.

2. **Dialog-/Kamera-Regel ergänzen**
   - Für jede Multi-Character-Szene muss der Prompt klar sagen: die Charaktere sprechen entweder miteinander oder nacheinander in die Kamera.
   - `characterShots[].actionEn/actionUser` bekommt pro Charakter eine eigene, sichtbare Aktion inklusive Blick-/Sprechrichtung.
   - Wenn nur ein Charakter sinnvoll im Fokus steht, darf `characterShots` auch nur diesen einen Charakter enthalten — keine „ghost cast“-Einträge.

3. **Serverseitige Reparatur ersetzen**
   - Die aktuelle Floor-Reparatur fügt fehlende Charaktere nachträglich in beliebige Szenen ein, ohne den Prompt wirklich umzubauen. Das erzeugt genau die Screenshots: Cast-Liste enthält mehrere Personen, Prompt beschreibt aber nur Sarah.
   - Stattdessen: Wenn ein Charakter per Floor hinzugefügt wird, wird auch der Prompt deterministisch zu einer Gruppenszene erweitert: alle Namen, alle Signature Items, klare sichtbare Positionen und eigene Aktionen.
   - Multi-Charakter-Slots mit ungeeigneten ShotTypes (`pov`, `detail`, `back`, `silhouette`) werden für Lip-Sync-Szenen auf `full`/`profile` normalisiert.

4. **Client-Fallback angleichen**
   - In `BriefingTab.tsx` dieselbe Logik für alte/cached Edge-Function-Antworten ergänzen, damit neue Szenen im UI sofort bereinigt werden.
   - Keine fremde Aktion mehr kopieren; wenn mehrere Charaktere im Cast sind, wird die allgemeine Szene zu einer gemeinsamen Gruppenszene, nicht zu einem Einzelpersonen-Prompt.

5. **Finaler Prompt im SceneCard stabilisieren**
   - `applyActionsToPrompt`/Cast-Injektion so erweitern, dass `[CastActions]` bei mehreren Charakteren nicht als Zusatz über einem Einzelpersonen-Prompt stehen bleibt, sondern eine klare Gruppenszenen-Anweisung ergänzt.
   - Ziel: Der finale KI-Prompt enthält keine widersprüchliche Struktur wie „Featuring Matthew/Samuel/Kailee: Sarah sits alone…“.

## Technische Prüfungen
- Betroffene Dateien: `supabase/functions/compose-video-storyboard/index.ts`, `src/components/video-composer/BriefingTab.tsx`, wahrscheinlich `src/lib/motion-studio/applyActionsToPrompt.ts` oder `applyCastToPrompt.ts`.
- Nach Umsetzung: gezielt die Prompt-Erzeugung prüfen, ob bei 2–4 Charakteren alle Namen im Aktionskörper vorkommen, alle Actions eindeutig sind und keine Szene mit Multi-Cast nur einen Charakter beschreibt.