Ich würde den Nutzer nicht zwingend die Stimmen selbst hinzufügen lassen. Das System muss Stimmen automatisch korrekt setzen, wenn Charaktere und Sprecher-IDs im Plan vorhanden sind. Ein manueller Schritt ist aber sinnvoll als Sicherheitsnetz, wenn ein Plan keine eindeutige Sprecher-UUID enthält.

## Ziel
Beim Übernehmen eines Production Plans darf `Lip-Sync-Szene ohne Voice-ID` nur noch auftreten, wenn wirklich keine Stimme zugewiesen werden kann. Die Zuordnung läuft strikt über IDs, nicht über Vornamen, Mention-Slugs oder Fuzzy-Matching.

## Plan

1. **Client-seitigen Apply-Resolver härten**
   - In `useApplyProductionPlan.ts` die Voice-Zuordnung zentralisieren:
     - `dialogTurns[].speakerCharacterId` ist die einzige Sprecherquelle.
     - `cast[].characterId` ist die einzige Charakterquelle.
     - `dialog_voices` wird für jede Sprecher-UUID befüllt.
   - Wenn ein Charakter keine Default-Stimme hat, wird automatisch eine eindeutige Pool-Stimme zugewiesen.
   - Kein Rückfall auf Vornamen, `@samuel`, Slugs oder ähnliche Textvergleiche.

2. **Fehlende `speakerCharacterId` vor Apply sauber behandeln**
   - Wenn ein Dialog-Turn keine `speakerCharacterId` hat, wird der Plan nicht stillschweigend falsch übernommen.
   - Stattdessen zeigt die UI vor dem Übernehmen einen kleinen Pflicht-Schritt:
     - Sprecherzeile / Turn
     - Charakter-Auswahl aus dem Scene-Cast
     - Stimme automatisch vorgeschlagen, aber editierbar
   - Die Auswahl speichert echte `speakerCharacterId`-UUIDs in den Plan.

3. **Stimmen-Review im Production Plan ergänzen**
   - Im Plan-Modal unter der Szene einen kompakten Bereich anzeigen:
     - `Laura → Voice: Sarah`
     - `Samuel → Voice: George`
     - etc.
   - Bei fehlender Stimme: klare Warnung direkt am Sprecher, nicht erst als roter Toast nach Apply.
   - Nutzer kann die Stimme manuell überschreiben, muss es aber normalerweise nicht.

4. **Verify-Logik korrigieren**
   - Nach dem Speichern wird nicht nur geprüft, ob irgendeine Voice existiert.
   - Es wird geprüft:
     - alle `speakerCharacterId`s aus `dialogTurns` sind in `dialog_voices` vorhanden
     - sichtbare Nicht-Sprecher im Ensemble lösen keine Warnung aus
   - Wenn etwas fehlt, zeigt die Meldung konkret: welcher Sprecher-ID / Slot keine Voice hat.

5. **Bestehende Pläne im Modal reparierbar machen**
   - Für bereits geöffnete oder ältere Production Plans mit fehlenden `speakerCharacterId`s:
     - nicht per Namen erraten
     - stattdessen Mapping-Step anzeigen
   - Für neu analysierte Pläne sollte der Server die IDs bereits liefern; der Mapping-Step erscheint dann nicht.

## Ergebnis
- Neue Briefing-Pläne laufen automatisch mit ID-only Voice-Binding.
- Alte/kaputte Pläne werden nicht mehr falsch angewendet, sondern sauber zur Sprecher- und Stimmenzuordnung aufgefordert.
- Der Nutzer bekommt Kontrolle über Stimmen, aber die Plattform bleibt weiterhin automatisch nutzbar.