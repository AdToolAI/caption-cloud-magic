

## Plan: Fix News Hub — Deutsche Inhalte & echte Quellenlinks

### Probleme identifiziert

1. **Alle DE-Artikel sind auf Englisch**: Die 14 bestehenden Artikel wurden VOR dem Sprach-Fix erstellt. Sie sind englisch, aber mit `language: "de"` getaggt. Der 4-Stunden-Cache verhindert ein Neu-Laden.

2. **Quellenlinks identisch**: Perplexity's `citations`-Array ist NICHT 1:1 den Artikeln zugeordnet. `citations[i]` für Artikel `i` ergibt zufällige oder falsche URLs. Die Keyword-Suche findet meist nichts Passendes, weil die Citation-URLs selten Headline-Wörter enthalten.

### Lösung

**1. DB-Bereinigung (Migration)**
- Alle bestehenden `news_hub_articles` löschen (nur 14 Stück, alle fehlerhaft). Das erzwingt einen frischen Fetch mit den korrekten lokalisierten Prompts.

**2. Edge Function — Quellenlinks grundlegend verbessern**
- Statt `citations[i]` (falsche Zuordnung): Die Perplexity-Antwort enthält im Text oft Referenzen wie `[1]`, `[2]` neben den Quellenangaben. Diese werden zum Citation-Mapping genutzt.
- Besserer Ansatz: Die `source_url` direkt im Prompt stärker einfordern UND die `citations` intelligent durchsuchen — nicht nach Index, sondern nach Source-Name-Match (z.B. wenn `source: "t3n"` → suche eine Citation die `t3n.de` enthält).
- Zusätzlich: `search_recency_filter: "day"` an Perplexity übergeben, damit nur aktuelle Quellen zurückkommen.

**3. Prompt-Verbesserung**
- Explizit anweisen: "Each source_url must be a UNIQUE, DIFFERENT URL pointing to the specific article. Do NOT reuse the same URL for multiple articles."
- Das gleiche auf Deutsch/Spanisch

### Betroffene Dateien

| Aktion | Datei |
|--------|-------|
| Migration | `DELETE FROM news_hub_articles` — alle alten fehlerhaften Daten entfernen |
| Edit | `supabase/functions/fetch-news-hub/index.ts` — Citation-Mapping nach Source-Name statt Index, `search_recency_filter`, Prompt-Verschärfung |

### Ergebnis
- Nach dem Fix: "Aktualisieren" klicken → frische deutsche Artikel von deutschen Quellen mit individuellen Quellenlinks

