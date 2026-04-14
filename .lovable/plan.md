

## Plan: Artikel immer lesbar machen — Fallback-Links + Mismatch-Fix

### Problem
- **7 von 21 DE-Artikeln** haben `source_url = null` → kein "Lesen"-Link sichtbar
- **Ursache**: Perplexity liefert ~10-15 Citations für 40 Artikel. Die URL-Resolution läuft leer.
- **Mismatch-Problem**: Strategy 3+4 im Code vergeben Citations OHNE Domain-Check → z.B. Quelle "webnetz.de" bekommt einen absatzwirtschaft.de-Link

### Lösung

**1. Edge Function `fetch-news-hub/index.ts`**
- Strategy 3+4 entfernen (die ohne Domain-Match) — verhindert falsche Zuordnungen
- Neuer Fallback: Wenn keine passende Citation gefunden wird, generiere einen Google-Such-Link: `https://www.google.com/search?q=site:source.com+"headline keywords"` — führt direkt zum echten Artikel
- So hat **jeder Artikel** einen funktionierenden Link

**2. Frontend `NewsHub.tsx`**
- "Lesen"-Button immer anzeigen (source_url ist jetzt nie null)
- Keine Änderung nötig, da die Logik bereits `{article.source_url && ...}` nutzt und jetzt immer eine URL existiert

**3. DB bereinigen**
- Bestehende Artikel mit `source_url = null` oder Domain-Mismatch löschen
- Force-Refresh erzwingt neue Artikel mit korrekten Links

### Betroffene Dateien
| Datei | Änderung |
|-------|----------|
| `supabase/functions/fetch-news-hub/index.ts` | Strategy 3+4 entfernen, Google-Fallback |
| Migration | DELETE fehlerhafter Artikel |

