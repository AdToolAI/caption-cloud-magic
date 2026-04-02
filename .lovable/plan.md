

## Google Search Console Indexierungs-Probleme beheben

Die Email zeigt 4 Probleme. Hier ist die Analyse und der Fix:

### Problem-Analyse

| GSC-Meldung | Ursache im Code |
|---|---|
| **Page with redirect** | `/` leitet eingeloggte User auf `/home` weiter. Mehrere Routen wie `/prompt-wizard`, `/videos`, `/voice-library` sind reine Redirects — diese sollten nicht in der Sitemap stehen. |
| **Alternate page with proper canonical tag** | Die Sitemap und hreflang-Tags verweisen auf `/en/...` und `/es/...` URLs (z.B. `useadtool.ai/en/pricing`), aber diese Routen existieren gar nicht in `App.tsx`. Es gibt kein URL-basiertes i18n-Routing. |
| **Blocked by robots.txt** | `/account`, `/billing`, `/auth` etc. sind absichtlich blockiert — das ist korrekt und kein Problem. |
| **Duplicate without user-selected canonical** | Inkonsistente Canonical-URLs: manche Seiten setzen relative Pfade (`/faq`), andere absolute URLs (`https://useadtool.ai`). Manche App-Seiten (hinter Auth) haben gar keine Canonical-Tags. |

### Lösung

**1. Sitemap bereinigen (`public/sitemap.xml` + `scripts/generate-sitemap.js`)**
- Alle hreflang-Verweise auf `/en/...` und `/es/...` entfernen — diese Routen gibt es nicht
- App-Seiten entfernen, die hinter Auth liegen: `/hook-generator`, `/planner`, `/calendar`, `/analytics`
- Nur wirklich öffentliche Seiten behalten: `/`, `/home`, `/pricing`, `/faq`, `/features`, `/support`, `/legal/*`, `/terms`, `/privacy`, `/delete-data`
- `lastmod` aktualisieren auf aktuelles Datum

**2. Canonical-URLs konsistent machen**
- In jeder Seite die `canonical`-Prop als vollständige absolute URL setzen (`https://useadtool.ai/...`)
- FAQ: `canonical="https://useadtool.ai/faq"` statt `"/faq"`
- Pricing: `canonical="https://useadtool.ai/pricing"` statt `"/pricing"`
- Homepage (`/`): Canonical auf `https://useadtool.ai/` setzen (nicht `/home`)

**3. hreflang komplett entfernen (SEO.tsx)**
- Da es kein URL-basiertes i18n gibt (Sprache wird per State/Query umgeschaltet), sind hreflang-Tags falsch und irreführend
- Die hreflang-Generierung in `SEO.tsx` entfernen
- `supportedLanguages` in `seo.ts` kann bleiben, wird aber nicht mehr für hreflang verwendet

**4. robots.txt leicht anpassen**
- `Crawl-delay` entfernen (wird von Google ignoriert und kann bei anderen Crawlern Probleme machen)
- Redirect-Pfade explizit blocken, damit Crawler sie nicht erst laden und dann dem Redirect folgen müssen

### Betroffene Dateien

- `public/sitemap.xml` — bereinigen, hreflang entfernen, App-Seiten raus
- `scripts/generate-sitemap.js` — hreflang-Logik entfernen, Route-Liste bereinigen
- `src/components/SEO.tsx` — hreflang-Block entfernen
- `src/pages/Index.tsx` — canonical fix
- `src/pages/Home.tsx` — canonical fix
- `src/pages/FAQ.tsx` — canonical als absolute URL
- `src/pages/Pricing.tsx` — canonical als absolute URL
- `src/pages/IndexLegacy.tsx` — canonical fix
- `public/robots.txt` — Crawl-delay entfernen

