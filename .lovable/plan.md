

## Plan: News Hub Quellenlinks, Medien & Design-Upgrade

### Probleme identifiziert

1. **Quellenlinks**: Perplexity liefert nur Domain-Root-URLs (`socialmediatoday.com`) statt echte Artikel-URLs. Alle "Quelle"-Links führen zur gleichen Seite.
2. **Bilder/Videos**: Alle `image_url` und `video_url` in der Datenbank sind `null` — Perplexity liefert diese Felder nicht zuverlässig.
3. **Design**: Ohne Medien wirken die Cards flach und unprofessionell.

### Lösung

**1. Edge Function `fetch-news-hub` — Prompt & Quellen verbessern**
- Perplexity-Prompt verschärfen: explizit nach **vollständigen Artikel-URLs** verlangen (nicht Domains)
- Die `citations`-Response von Perplexity nutzen — diese enthalten die echten Quell-URLs und können als Fallback für `source_url` dienen
- Für Bilder: Nach dem Perplexity-Call einen zweiten Schritt hinzufügen — pro Artikel ein thematisch passendes Bild via **Pexels API** abrufen (kostenlos, hochwertig, passt zum "James Bond 2028"-Stil)
- Video-URLs: YouTube-Such-Links generieren basierend auf der Headline (`https://www.youtube.com/results?search_query=...`)

**2. Pexels API für Artikelbilder**
- Neues Secret: `PEXELS_API_KEY` (kostenlos, https://www.pexels.com/api/)
- Pro Artikel: `GET https://api.pexels.com/v1/search?query={headline_keywords}&per_page=1`
- Liefert hochwertige, lizenzfreie Bilder als `image_url`

**3. Bestehende Artikel aktualisieren**
- Ein einmaliger Re-Fetch-Mechanismus: beim nächsten Aktualisieren werden Artikel ohne `image_url` nachträglich mit Pexels-Bildern angereichert

**4. NewsHub.tsx — Visuelles Upgrade**
- **Featured Article**: Der neueste Artikel wird als großer Hero-Card mit Vollbild-Hintergrund dargestellt
- **Cards mit Gradient-Overlay**: Bilder bekommen ein cineastisches Gradient-Overlay (dunkel nach unten) mit Text darüber
- **Glassmorphismus-Header**: Der Hero-Bereich bekommt subtile Scanline-Effekte und Glow
- **Hover-Effekte**: Scale-Transform, Border-Glow, sanftes Bild-Zoom
- **Video-Badge**: Statt Play-Button ein elegantes "▶ Video" Badge auf der Card
- **Source-Link-Styling**: Deutlicher als klickbarer Link mit Pfeil-Icon

### Betroffene Dateien

| Aktion | Datei |
|--------|-------|
| Edit | `supabase/functions/fetch-news-hub/index.ts` — Citations nutzen, Pexels-Integration, YouTube-Links |
| Edit | `src/pages/NewsHub.tsx` — Featured Hero, Glassmorphismus, bessere Cards |
| Secret | `PEXELS_API_KEY` — muss vom User eingegeben werden |

### Was sich nicht ändert
- DB-Schema bleibt (Spalten `image_url`, `video_url` existieren bereits)
- Hook `useNewsHub.ts` bleibt unverändert
- Kategorie-Filter, Suche, Deep-Linking bleiben erhalten
- News Radar Ticker unverändert

