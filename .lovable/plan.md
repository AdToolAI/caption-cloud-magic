## Ausgangslage

- ✅ Workflow läuft jetzt **grün** (5/5 passed, 1 Retry beim Account-Test)
- ⚠ Der Flake bei `/account`: Im Code ist `/account` **nicht** mit `ProtectedRoute` umschlossen (siehe `App.tsx` Zeile 183). Account.tsx macht den Auth-Check intern und redirectet langsam — daher reichen 1500ms Wait nicht immer
- 🎯 Du willst breitere Abdeckung, um *wirklich* die meisten Bugs zu fangen

## Ziel

Von **5 Tests → ~25 stabile Smoke-Tests**, die alle 5 Min/täglich gegen Production laufen und folgende Schichten abdecken:

1. **Public Pages** (rendern, kein 500, keine JS-Errors)
2. **Auth-Flows** (Login-Form, Forgot-Password, Reset-Password)
3. **Geschützte Routen** (echte ProtectedRoute-Pfade)
4. **SEO & Meta** (Title, Meta-Description, OG-Tags, Sitemap, Robots)
5. **Legal & Compliance** (alle 4 Pflichtseiten DACH/TikTok)
6. **API-Health** (Supabase-Reachability, Edge-Function-Pings)
7. **Performance-Budgets** (LCP, Bundle-Size pro Page)
8. **Mobile-Responsiveness** (kein horizontaler Scroll auf 375px)
9. **404-Handling** (NotFound-Page rendert sauber)

## Konkrete Test-Suites

### Suite 1: `critical-journeys.spec.ts` (bestehend, FIX)

**Fix für Flake:** `/account` aus `protectedPaths` entfernen (ist gar nicht protected im Routing). Stattdessen nur **echte** `ProtectedRoute`-Pfade aus App.tsx:
- `/streak`, `/autopilot`, `/email-director`, `/brand-characters`, `/account/delete`

Plus: `waitForURL('**/auth**', { timeout: 8000 })` statt fixem `waitForTimeout` — das eliminiert Race-Conditions.

### Suite 2: `public-pages.spec.ts` (NEU — ~10 Tests)

Loop über alle Public-Routen, prüft pro Route:
- HTTP-Status < 400
- `<h1>` sichtbar binnen 5s
- Keine JS-Errors (page.on('pageerror'))
- Title-Tag nicht leer

Routen:
- `/`, `/pricing`, `/faq`, `/auth`, `/forgot-password`
- `/legal/privacy`, `/legal/terms`, `/legal/imprint`
- `/coming-soon`, `/delete-data`
- `/hub/content` (Hub-Page mit dynamischem Param)

### Suite 3: `seo-meta.spec.ts` (NEU — ~5 Tests)

- `/sitemap.xml` ist erreichbar und valides XML
- `/robots.txt` ist erreichbar
- Landing hat `<meta property="og:title">` + `og:image`
- Landing hat `<link rel="canonical">`
- `/manifest.json` ist gültiges JSON

### Suite 4: `auth-flows.spec.ts` (NEU — ~3 Tests, KEIN Login)

- `/auth` zeigt sowohl Email/Password-Form als auch (falls vorhanden) Google-Button
- `/forgot-password` zeigt Email-Eingabe + Submit
- `/reset-password` ohne Token → zeigt sinnvolle Error-Message (kein White-Screen)

### Suite 5: `api-health.spec.ts` (NEU — ~3 Tests)

Direkte Network-Calls (kein Browser nötig, schnell):
- `GET https://lbunafpxuskwmsrraqxl.supabase.co/rest/v1/` → 200/401 (nicht 5xx)
- `OPTIONS` auf eine bekannte Edge-Function → CORS-Header da
- Anon-Key kann eine public Tabelle lesen (z.B. `pricing_plans` falls existent)

### Suite 6: `performance-budgets.spec.ts` (NEU — ~3 Tests)

- Landing < 4s LCP (du hast schon einen — ausweiten)
- `/pricing` < 4s LCP
- `/auth` < 3s (sollte schlanker sein als Landing)

### Suite 7: `mobile-responsive.spec.ts` (NEU — ~2 Tests)

Viewport 375x667 (iPhone SE):
- Landing: kein horizontaler Scroll (`document.documentElement.scrollWidth <= 375`)
- `/pricing`: kein horizontaler Scroll

### Suite 8: `not-found.spec.ts` (NEU — ~1 Test)

- `/this-route-does-not-exist-xyz` zeigt NotFound-Page mit Link zurück zur Landing

## Workflow-Update

`.github/workflows/e2e-critical.yml` umbenennen zu **E2E Smoke Suite** und alle 8 Specs laufen lassen statt nur einer:

```yaml
- name: Run smoke suite
  run: npx playwright test tests/critical-journeys.spec.ts tests/public-pages.spec.ts tests/seo-meta.spec.ts tests/auth-flows.spec.ts tests/api-health.spec.ts tests/performance-budgets.spec.ts tests/mobile-responsive.spec.ts tests/not-found.spec.ts
```

Plus: `--workers=2` (statt 1) für Parallelisierung — sollte auf ~3-4 Min Gesamtlaufzeit kommen statt 8+ Min sequenziell.

Schedule auf alle **6h** (statt nur täglich), damit Regressionen früher auffallen — bei Public Repo kostenlos.

## Was bewusst NICHT getestet wird

- **Authentifizierte Flows** (Video-Generation, Composer, Studios) — bräuchten Test-User + Credits, würden bei jedem Run echtes Geld verbrennen. Dafür gibt es bereits `tests/e2e/*.spec.ts` mit Test-Users für gezielte manuelle Runs.
- **Visual Regression** — bereits in separatem Workflow (`visual-regression.yml`)
- **Load Tests** — bereits in `load-tests.yml`

Diese Smoke-Suite ist die **erste Verteidigungslinie**: schnell, kostenlos, deckt 80% der "ist die Website überhaupt online und nutzbar?"-Fragen ab.

## Erwartetes Ergebnis

- ~25 grüne Tests in ~3-4 Min
- Cockpit zeigt 25 Resultate alle 6h
- Wenn morgen jemand versehentlich `/pricing` killt, die OG-Tags entfernt, oder `/auth` zerschießt → roter Badge in <6h

## Technische Details (für später beim Implementieren)

- Helper-File `tests/helpers/page-checks.ts` mit `assertPageHealthy(page, path)` — prüft Status, h1, Errors, Title in einer Funktion
- Cockpit-Reporter funktioniert bereits — keine Änderung nötig
- BASE_URL bleibt `https://caption-cloud-magic.lovable.app`
- Custom-Domain (`useadtool.ai`) NICHT testen — die Auth-Redirect-Logik dort ist anders, würde Flakes produzieren

## Was du danach optional tun kannst

- Test-User mit Trial-Credits einrichten → dann können wir auch authentifizierte Smoke-Tests dazunehmen (Video-Composer öffnet, Composer-Brief speichert, Brand-Character laden)
- Slack/Discord-Webhook im Workflow → automatische Notification bei Fail
