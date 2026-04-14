
## Plan: Category-Mapping in Edge Functions vervollständigen

### Problem
Die UI sendet jetzt die 4 neuen Kategorien (`corporate-ad`, `product-ad`, `storytelling`, `custom`), aber die Edge Functions haben kein Mapping dafür:

1. **`universal-video-consultant`**: Kennt `advertisement`, `product-video`, `corporate` etc. — aber NICHT `corporate-ad` oder `product-ad`. Resultat: Fällt auf `custom` zurück → falsche Interview-Fragen
2. **`auto-generate-universal-video`**: `VALID_CATEGORIES` enthält nur alte Render-Kategorien. `corporate-ad` wird zu `social-reel` (Fallback) → komplett falscher Video-Typ

### Lösung
Ein Mapping-Layer am Anfang jeder Edge Function, der die neuen UI-Kategorien auf die internen Pipeline-Keys mappt.

### Änderungen

**1. `supabase/functions/universal-video-consultant/index.ts`**
- Mapping-Funktion am Anfang hinzufügen:
  ```
  corporate-ad → advertisement
  product-ad → product-video
  storytelling → storytelling (bleibt)
  custom → custom (bleibt)
  ```
- Im Request-Handler die `category` sofort mappen, bevor sie an `getBlock1Phases`, `getBlock2Phases`, `getCategoryConfig`, `getCategorySystemPrompt`, Quick Replies etc. weitergereicht wird

**2. `supabase/functions/auto-generate-universal-video/index.ts`**
- Gleiche Mapping-Funktion hinzufügen
- `briefing.category` am Anfang mappen, damit:
  - `categoryStyleHints` die richtigen Werte findet
  - `isStorytelling`-Check korrekt funktioniert
  - `validateEnum(briefing.category, VALID_CATEGORIES, 'social-reel')` nicht auf Fallback fällt
- Die finale `inputProps.category` muss ein gültiger Render-Kategorie-Wert sein (z.B. `brand-story` statt `corporate-ad`)

**3. `supabase/functions/generate-universal-script/index.ts`**
- Prüfen ob `getCategoryKey()` bereits `corporate-ad` und `product-ad` mappt → Ja, `generate-script-inline.ts` hat es, aber die standalone Version in `generate-universal-script/index.ts` (Zeile 304-328) hat es möglicherweise NICHT → muss ergänzt werden

**4. Edge Functions deployen**
- Alle 3 Functions deployen und testen

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/universal-video-consultant/index.ts` | Mapping `corporate-ad` → `advertisement`, `product-ad` → `product-video` |
| `supabase/functions/auto-generate-universal-video/index.ts` | Gleiches Mapping + korrekte Render-Kategorie |
| `supabase/functions/generate-universal-script/index.ts` | `getCategoryKey()` um neue Keys ergänzen |

### Ergebnis
- `corporate-ad` Videos bekommen Werbe-Interview-Fragen und professionellen Render-Stil
- `product-ad` Videos bekommen Produkt-spezifische Fragen und Produkt-fokussierten Render
- `storytelling` behält seine narrative Pipeline
- Keine Fallback-auf-`social-reel` mehr
