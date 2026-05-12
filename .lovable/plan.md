## Diagnose

- In der Datenbank existieren aktuell nur **16 fertige Wardrobe-Catalog-Bilder**.
- Erwartet sind **192 Bilder**: 96 Outfit-Slots × männlich/weiblich.
- Für den Screenshot-Bereich `Business → Travel → Male` gibt es daher schlicht keine Datensätze, deshalb zeigt die UI weiterhin „Not generated“.
- Die bisherige Seeder-Function gibt zu früh zurück und verlässt sich wieder auf Background-Arbeit; genau diese Background-Arbeit stirbt offenbar, bevor die Bilder fertig sind.

## Plan

1. **Seeder wirklich zuverlässig machen**
   - `seed-wardrobe-catalog` so umbauen, dass ein Aufruf nur einen kleinen Chunk synchron fertigstellt.
   - Kein `EdgeRuntime.waitUntil` mehr für die eigentliche Bildgenerierung.
   - Jeder Aufruf gibt erst zurück, wenn seine 2–4 Bilder wirklich gespeichert wurden.
   - Rückgabe enthält klar: `processed`, `failed`, `remaining`, `done`.

2. **Gezieltes Backfill für alle fehlenden Outfits laufen lassen**
   - Nach Deployment die Function wiederholt aufrufen, bis `done: true` kommt.
   - Dabei alle Themes/Subpacks/Geschlechter auffüllen: Lifestyle, Business, Historical, Fantasy, Sci-Fi, Sport.
   - Danach per Datenbankabfrage prüfen, dass pro `theme_pack + gender` jeweils 4 Bilder vorhanden sind.

3. **UI so ändern, dass sie keine „Not generated“-Kacheln mehr als Endzustand zeigt**
   - Solange ein Katalog-Batch noch fehlt: Skeleton/Loading-Kacheln anzeigen, nicht „Not generated“.
   - Für Wardrobe-Kataloge keinen Generate-/Use-my-face-Flow und keine manuelle CTA.
   - Sobald die DB-Daten kommen, erscheinen automatisch die fertigen generischen Model-Outfits.

4. **Kleine Sicherheitskorrektur für Preview-URLs prüfen**
   - Die gespeicherten URLs sind signierte Storage-URLs mit Ablaufzeit.
   - Falls nötig, auf stabile public/proxy-fähige URLs umstellen oder beim Laden neu signieren, damit die Bilder später nicht wieder verschwinden.

5. **Verifikation**
   - Prüfen, dass `Business → Travel → Male` sichtbar wird.
   - Stichprobe für Female und mehrere Bereiche: Lifestyle, Historical, Fantasy, Sci-Fi, Sport.
   - Sicherstellen, dass kein „Use my face“-Button und keine manuelle Generierung mehr im Wardrobe Sheet erscheint.