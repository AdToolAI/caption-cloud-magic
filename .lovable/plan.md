<final-text>
Problem bestätigt:
- Der Fehler liegt nicht im Frontend-Routing, sondern in den gespeicherten Quellen-Links.
- `NewsHub.tsx` öffnet einfach `source_url` als externen Link.
- In den aktuellen Daten sind mehrere Links falsch oder halluziniert:
  - ein `t3n`-Artikel zeigt auf `zdfheute.de`
  - mehrere OMR/CHIP-Links führen auf 404-Seiten
- Aktuell existieren außerdem nur DE-News in der Datenbank; EN/ES sind noch nicht neu aufgebaut.

Plan

1. Link-Erzeugung in `fetch-news-hub` sauber neu aufbauen
- Ich entferne die Abhängigkeit von modell-generierten `source_url`-Feldern.
- Der Flow wird in 2 Schritte getrennt:
  1. Artikelinhalt generieren: `headline`, `summary`, `category`, `source`
  2. URL separat auflösen: pro Artikel gezielte, quellgebundene Suche wie `site:chip.de`, `site:omr.com`, `site:t3n.de` mit Headline-Keywords
- So kommen die Links nicht mehr aus erfundenen Slugs, sondern aus echten Suchtreffern.

2. Nur verifizierte URLs speichern
- Jede gefundene URL wird vor dem Speichern geprüft:
  - keine Root-Domain
  - Domain passt wirklich zur Quelle
  - HTTP-Response ist keine 404-/Fehlerseite
  - Seitentitel/Inhalt passt grob zur Headline
- Wenn nichts Verlässliches gefunden wird, speichere ich `source_url = null` statt einen kaputten Link.

3. Source-Matching härten
- Quellen-Normalisierung für Namen wie `W&V`, `CHIP`, `Gründerszene`, `OnlineMarketing.de`, `AllFacebook.de` usw.
- Cross-Source-Mismatches werden hart verworfen
  - z. B. `source: "t3n"` darf niemals auf `zdfheute.de` zeigen
- Eindeutige Links bleiben wichtig, aber Korrektheit hat Vorrang vor erzwungener Einzigartigkeit.

4. Bad Data + Cache bereinigen
- Die aktuell fehlerhaften `news_hub_articles` werden per Migration bereinigt und frisch erzeugt.
- Manueller Refresh bekommt einen Cache-Bypass, damit falsche Daten nicht weitere 4 Stunden festhängen.
- Sprachfeeds bleiben getrennt: DE/EN/ES werden unabhängig neu befüllt.

5. UI robust machen
- In `NewsHub.tsx` wird „Artikel lesen“ nur noch gezeigt, wenn eine verifizierte URL vorhanden ist.
- Falls kein valider Link existiert, bleibt nur die Quelle sichtbar oder ein kleiner neutraler Fallback.
- So führt kein Klick mehr auf tote Seiten.

6. Performance/Stabilität absichern
- Falls die zusätzliche URL-Prüfung die Funktion zu langsam macht, erhöhe ich gezielt das Timeout für `fetch-news-hub` oder splitte die Generierung in zwei Backend-Pässe.
- Wichtig ist: lieber etwas mehr Aufwand im Backend als nochmals unzuverlässige Links im UI.

Betroffene Bereiche
- `supabase/functions/fetch-news-hub/index.ts`
- `src/pages/NewsHub.tsx`
- Datenbereinigung für `news_hub_articles`
- optional `supabase/config.toml` für Funktions-Timeout

Ergebnis
- Keine 404-Quellenlinks mehr im News Hub
- Keine falschen Quellen-Domains mehr
- Nur echte, erreichbare Artikelseiten werden klickbar
- Saubere Basis für getrennte DE/EN/ES-Feeds
</final-text>