## Problem

Du siehst noch dieselben 5 Mixkit-Sounds, obwohl die Edge Function jetzt echte Freesound-Ergebnisse liefert (per `curl` verifiziert).

**Ursache:** In der Tabelle `sfx_library_cache` liegen 9 alte Einträge mit `source = 'fallback'`, die **vor** dem Hinzufügen des `FREESOUND_API_KEY` gespeichert wurden — mit 24h TTL. Die UI trifft beim Laden den Cache und bekommt die alten Mixkit-Fallbacks zurück, ohne überhaupt Freesound/Pixabay anzufragen.

```
sfx:whoosh||10            | mixed    | 5 results
sfx:explosion||24         | fallback | 0 results   ← Müll
sfx:|footsteps|30         | fallback | 0 results   ← Müll
sfx:|ambient|30           | fallback | 0 results   ← Müll
sfx:|ui click|30          | fallback | 1 result    ← Müll
... usw.
```

## Lösung

### 1. Alten Fallback-Cache löschen (Migration)
Alle Zeilen mit `source = 'fallback'` aus `sfx_library_cache` entfernen, damit beim nächsten Aufruf wirklich Freesound/Pixabay gefragt werden.

### 2. Edge Function härten (`search-sfx-library/index.ts`)
- **Fallback nicht mehr cachen** — nur `mixed`/`pixabay`/`freesound` Resultate in die DB schreiben. So vergiftet ein temporärer API-Ausfall nie wieder den Cache für 24h.
- **Leere Default-Suche fixen:** Beim Page-Load ohne Query/Kategorie wird aktuell `searchTerm = ''` an Pixabay/Freesound geschickt → wenig brauchbare Ergebnisse. Default auf einen kuratierten Term setzen (z.B. `"sound effect"`) oder ein zufälliges Kategorie-Tag aus der Tag-Bar.

### 3. UI-Hinweis
Im Ergebniscount eine kleine Quellen-Pill anzeigen (`Pixabay + Freesound` vs. `Fallback`), damit du sofort siehst ob echte oder gecachte Mixkit-Daten kommen.

## Erwartetes Ergebnis

Nach Reload der `/sfx-library`-Seite:
- Ergebnisse zeigen Sounds von Freesound (mit echten Usernamen als „Artist") statt 5x „Mixkit"
- Bei jeder Suche wirst du dutzende echte Treffer sehen
- Cache enthält nur noch valide `mixed`-Einträge
