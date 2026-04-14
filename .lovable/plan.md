

## Plan: Sprachbasierte News Hub Feeds — DE/EN/ES individuelle Inhalte

### Problem
1. **Alle Artikel sind auf Englisch** — die Edge Function generiert nur englische Inhalte, obwohl eine `language`-Spalte existiert
2. **Quellenlinks zeigen auf dieselbe Seite** — Perplexity liefert Domain-Roots statt echte Artikel-URLs
3. **Kein Sprachfilter** — `useNewsHub` filtert nicht nach Sprache, zeigt alle Artikel gemischt

### Lösung

**1. Edge Function `fetch-news-hub` — Sprach-Parameter & lokalisierte Prompts**
- Einen `language`-Parameter (`de`/`en`/`es`) als Body-Parameter akzeptieren
- Prompt komplett lokalisieren: Deutsche UI → deutscher Prompt der nach deutschsprachigen Quellen/Artikeln fragt, EN → englische Quellen, ES → spanische Quellen
- Jede Sprache bekommt eigene Quellen-Empfehlungen (z.B. DE: t3n, OMR, Horizont; EN: TechCrunch, Social Media Today; ES: Marketing4eCommerce, Reason Why)
- `citations`-Array von Perplexity als primäre Quelle für `source_url` nutzen — diese sind die echten Artikel-URLs
- Cache-Check pro Sprache: nur Artikel der gleichen Sprache prüfen
- Duplikat-Check pro Sprache

**2. `useNewsHub.ts` — Sprachfilter**
- `useTranslation()` importieren und aktuelle Sprache lesen
- Alle Queries um `.eq("language", language)` erweitern
- Sprache an `refreshNews` → Edge Function als Body-Parameter übergeben
- Interface um `language` erweitern

**3. `NewsHub.tsx` — Lokalisierte UI-Texte**
- Alle hardcodierten deutschen Strings (`"Alle"`, `"Plattformen"`, `"Aktualisieren"`, `"Mehr laden"`, `"Artikel lesen"`, etc.) durch `t()`-Aufrufe ersetzen
- Kategorie-Labels lokalisieren
- `timeAgo()`-Funktion lokalisieren (EN: "2h ago", DE: "vor 2 Std.", ES: "hace 2h")

**4. Perplexity Prompt — Quellenlinks-Fix**
- Systemanweisung explizit: "source_url MUST be the direct link to the full article, NOT a homepage or domain root"
- Citations-Mapping: Jeder Artikel wird mit der passenden Citation-URL abgeglichen (Index-basiert + Keyword-Match als Fallback)
- Wenn keine gültige URL: `source_url` bleibt `null` statt eine falsche Domain zu zeigen

### Betroffene Dateien

| Aktion | Datei |
|--------|-------|
| Edit | `supabase/functions/fetch-news-hub/index.ts` — Sprach-Parameter, lokalisierte Prompts, Citation-Mapping |
| Edit | `src/hooks/useNewsHub.ts` — Sprachfilter, Sprache an Edge Function übergeben |
| Edit | `src/pages/NewsHub.tsx` — Alle UI-Strings lokalisieren |
| Edit | `src/lib/translations.ts` — News Hub Übersetzungen (EN/ES Kategorie-Labels, UI-Texte) |

### Was sich nicht ändert
- DB-Schema bleibt (Spalte `language` existiert bereits)
- Pexels-Bildintegration bleibt
- Deep-Linking vom Ticker bleibt
- Paginierung, Kategorie-Filter bleiben

### Ergebnis
- Deutsche UI → deutsche Artikel von deutschen Quellen (t3n, OMR, etc.)
- Englische UI → englische Artikel von TechCrunch, The Verge, etc.
- Spanische UI → spanische Artikel von spanischen Quellen
- Jede Sprache hat ihren eigenen, unabhängigen Feed
- Quellenlinks führen zu den echten Artikeln

