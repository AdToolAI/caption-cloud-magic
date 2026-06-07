## Ziel
Die Action-Felder dürfen nicht mehr alle denselben Charakter/Text übernehmen. Das allgemeine Feld soll die Szene insgesamt beschreiben; jedes Charakter-Feld soll nur die Aktion des jeweiligen Charakters enthalten.

## Plan
1. **Root Cause im Storyboard-Fallback beheben**
   - Die aktuelle Fallback-Logik sucht im Prompt nach einem Namen und fällt sonst auf die allgemeine Szene zurück.
   - Dadurch wird bei mehreren Charakteren dieselbe Aktion (z. B. Sarah) in Matthew/Samuel/Kailee kopiert.
   - Ich ersetze das durch eine cast-bewusste Logik: Nur wenn der Prompt wirklich eine eigene Klausel für diesen Charakter enthält, wird sie übernommen; sonst wird kein fremder Charaktertext kopiert.

2. **Allgemeines Szenenfeld bereinigen**
   - `sceneActionEn/User` soll aus dem allgemeinen Szeneninhalt kommen, aber keine Cast-/Character-Beschreibung wie „A professional modern woman…“ übernehmen.
   - Falls der Prompt mit Cast-/Featuring-Blöcken startet, werden diese vor der Szenen-Zusammenfassung sicher entfernt.

3. **Per-Character-Fallbacks korrekt erzeugen**
   - Für jeden `characterShots[]` Slot wird die Aktion anhand des passenden Charakternamens und der passenden Prompt-Klausel abgeleitet.
   - Wenn keine klare eigene Aktion vorhanden ist, wird eine neutrale, charakterbezogene Kurzform erzeugt, aber nicht die Aktion eines anderen Charakters kopiert.
   - Server-Floor-Auto-Reparaturen bekommen dieselbe Logik, damit automatisch eingefügte Charaktere nicht wieder falsche Aktionen erhalten.

4. **Frontend-Kompatibilität absichern**
   - Die Client-Fallbacks in `BriefingTab.tsx` werden an dieselbe Regel angepasst, damit alte/cached Edge-Function-Antworten ebenfalls korrigiert werden.
   - `SceneCard.tsx` bleibt beim Prompt-Injection-Verhalten, schreibt aber nur noch die bereinigten Werte in `[CastActions]`.

## Betroffene Dateien
- `supabase/functions/compose-video-storyboard/index.ts`
- `src/components/video-composer/BriefingTab.tsx`

## Akzeptanzkriterien
- Neues KI-Briefing mit mehreren Charakteren füllt nicht mehr alle Charakterfelder mit Sarah/Matthew/etc.
- Das allgemeine Feld beschreibt die Szene, nicht einen einzelnen Cast-Slot.
- `[CastActions]` im Prompt enthält pro Charakter unterschiedliche/korrekte Aktionen oder lässt unklare Aktionen weg statt falsche zu kopieren.