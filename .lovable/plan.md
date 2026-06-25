## Problem
Die Outfit-Auswahl im Production-Plan hängt aktuell an der geladenen Mention-Library. Wenn der Plan ein `outfitLookId` enthält, aber die Outfit-Library beim Öffnen/Neu-Generieren noch nicht vollständig geladen ist oder das Look-Objekt nicht sauber gemappt wird, fällt die UI auf einen falschen/unklaren Label-Zustand zurück. Deshalb wirkt es inkonsistent: einmal korrekt, beim nächsten Generieren wieder „Unbekannt“/falsch.

## Ziel
Outfits müssen im Plan-Dialog stabil angezeigt werden, auch wenn Daten asynchron laden oder der Plan aus einer älteren/anderen Resolver-Version kommt. Charakter-ID und Outfit-ID bleiben getrennt, damit die Lip-Sync-Pipeline nicht beeinflusst wird.

## Umsetzung
1. **Outfit-Library robuster laden**
   - In `useUnifiedMentionLibrary` die gespeicherten Outfit-Looks inklusive Avatar-Namen stabil abfragen/mappen.
   - Defensives Labeling: niemals `undefined`, `null` oder „Unbekannt“, sondern klare Fallbacks wie `Standard-Look` oder der gespeicherte Look-Name.

2. **Plan-Dialog resilient machen**
   - In `ProductionPlanSheet` einen globalen `outfitById`-Index ergänzen.
   - Wenn `c.outfitLookId` gesetzt ist, aber nicht in `outfitsByCharacter.get(baseId)` auftaucht, wird der Look trotzdem als auswählbare Option angezeigt statt falsch/leer zu wirken.
   - Wenn `characterId` fehlt, aber `outfitLookId` vorhanden ist, wird die Base-Character-ID aus dem Outfit-Meta automatisch rekonstruiert.

3. **Auto-Resolve erweitern**
   - Beim Auto-Resolve nicht nur Charaktere, sondern auch Outfit-Hinweise (`c.outfit`, Look-Name, Mention-Name) gegen gespeicherte Looks matchen.
   - Treffer setzen `characterId` und `outfitLookId` getrennt.

4. **Server-Resolver ergänzen**
   - `briefing-deep-parse` bekommt die gespeicherten Outfit-Looks in die Library-Snapshot-Daten.
   - Nach Pass B wird lokal sichergestellt: wenn ein Cast ein Outfit beschreibt oder ein Look eindeutig matcht, wird `outfitLookId` gesetzt, ohne `characterId` mit `outfit:` zu vermischen.

5. **Sicherheitsgrenze für Lip-Sync beibehalten**
   - Keine Änderungen an Sync-/Lip-Sync-Core-Funktionen.
   - `characterId` bleibt immer Base-Avatar-ID; `outfitLookId` bleibt optionales Zusatzfeld für Anchor/Prompt.

## Ergebnis
Der Production-Plan zeigt Outfits stabil und nachvollziehbar an, auch nach erneutem Generieren oder verzögertem Laden. Die Storyboard-Anwendung übernimmt dann Charakter + Outfit sauber getrennt.