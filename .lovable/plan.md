

## Google Search Console Indexierungsprobleme — Analyse & Fix

### Status der 4 gemeldeten Probleme

| GSC-Meldung | Ursache | Status |
|---|---|---|
| **Page with redirect** | `/` leitet eingeloggte User auf `/home` weiter. Google crawlt als nicht-eingeloggt, sieht aber trotzdem das Redirect-Pattern. | Noch nicht behoben |
| **Alternate page with proper canonical tag** | `Home.tsx` hat canonical `https://useadtool.ai/home` und `IndexLegacy.tsx` ebenfalls — beides zeigt auf `/home`, das per robots.txt blockiert ist | Noch nicht behoben |
| **Blocked by robots.txt** | `/home` ist in robots.txt blockiert, wird aber als canonical referenziert. `/support` und `/features` sind in der Sitemap, `/features` existiert als Route gar nicht | Teilweise behoben |
| **Duplicate without user-selected canonical** | `/support` hat keinen canonical-Tag und keine SEO-Komponente | Noch nicht behoben |

### Was zu tun ist

**1. `Home.tsx` — Canonical von `/home` auf `/` ändern**
- Zeile 498: `canonical="https://useadtool.ai/home"` → `canonical="https://useadtool.ai/"`
- `/home` ist die App-Ansicht, `/` ist die öffentliche Landing Page — Google soll nur `/` indexieren

**2. `IndexLegacy.tsx` — Canonical von `/home` auf `/` ändern**
- Zeile 57: `canonical="https://useadtool.ai/home"` → `canonical="https://useadtool.ai/"`

**3. `public/sitemap.xml` — Nicht existierende/blockierte Seiten entfernen**
- `/support` entfernen (hat keine SEO-Komponente, keine canonical)
- `/features` entfernen (Route existiert gar nicht in `App.tsx`)
- `/delete-data` kann bleiben (hat canonical)

**4. `scripts/generate-sitemap.js` — Route-Liste bereinigen**
- `/support` und `/features` aus der Route-Liste entfernen

**5. `src/pages/Support.tsx` — Optional: SEO-Komponente + `noindex` hinzufügen**
- Falls Support eine interne Seite ist, `noindex` setzen
- Falls öffentlich: canonical hinzufügen und in Sitemap lassen

### Betroffene Dateien

1. `src/pages/Home.tsx` — canonical fix
2. `src/pages/IndexLegacy.tsx` — canonical fix
3. `public/sitemap.xml` — `/support` und `/features` entfernen
4. `scripts/generate-sitemap.js` — Routes bereinigen

### Antwort für Google

Du musst Google nicht direkt "antworten" — die Fixes werden automatisch erkannt. Nach dem Deployment:

1. **Google Search Console** öffnen → "Indexierung" → betroffene URLs prüfen
2. Für jede geänderte URL auf **"Indexierung beantragen"** klicken
3. Google re-crawlt die Seiten innerhalb von 1–3 Tagen
4. Die Warnungen verschwinden automatisch im nächsten Report

Die Email ist nur eine Benachrichtigung, kein Formular das beantwortet werden muss.

