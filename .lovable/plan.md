# Gefunden: unsere `og:url` schickt Meta von /privacy auf die Startseite

## Was die neuen Screenshots zeigen

`https://useadtool.ai/privacy`:

| Prüfpunkt | Ergebnis |
|---|---|
| Response Code | **200** — die Seite ist erreichbar |
| Fetched URL | `https://useadtool.ai/privacy` |
| **Canonical URL** | **`https://useadtool.ai/`** ← das ist das Problem |
| Redirect Path | `Input URL → /privacy`, **`og:url Meta Tag → https://useadtool.ai/`** |
| Warnung | `Missing Properties: fb:app_id` |

Meta folgt dem `og:url`-Tag wie einer Weiterleitung. Für Meta ist `https://useadtool.ai/privacy` deshalb **dieselbe Seite wie die Startseite** — also keine eigenständige Datenschutzerklärung. Genau das quittiert Meta mit „Invalid Privacy Policy URL". Erreichbarkeit war nie das Problem.

## Ursache im Code (verifiziert)

- In `index.html` steht fest verdrahtet `<meta property="og:url" content="https://useadtool.ai" />`. Dieses Tag gilt für **jede** URL der Seite.
- Die routenspezifischen Tags kommen aus `src/components/SEO.tsx` über react-helmet — die werden aber **erst im Browser per JavaScript** gesetzt. Metas Scraper führt kein JavaScript aus und sieht deshalb immer nur den Startseiten-Wert.
- `fb:app_id` fehlt komplett — kommt in beiden Debugger-Läufen als Warnung.

## Umsetzung

**1. `og:url` aus `index.html` entfernen**
Ohne dieses Tag nimmt Meta die tatsächlich abgerufene URL. `/privacy` wird dann als eigene Seite gewertet, `/legal/terms` ebenfalls. Das ist der eigentliche Fix.

**2. `fb:app_id` ergänzen**
Statisch in den Head, damit die Warnung verschwindet und Meta Website und App verknüpft. Dafür brauche ich deine **Meta App-ID**.

**3. `twitter:url`-Verdopplung bereinigen**
Im vorherigen Debug-Lauf stand `https://useadtool.ai/https://useadtool.ai/`. Die URL wird in `SEO.tsx` doppelt mit der Domain verkettet — künftig genau einmal absolut auflösen.

**4. Doppelte Social-Tags reduzieren**
Titel, Description, Card und Image tauchten je zweimal auf (statisch + Helmet). Auf der Startseite künftig nur eine Quelle, damit der Debugger je Property genau einen Wert sieht.

**5. Diagnose-Panel ehrlich machen** (weiterhin offen)
- Meta-Berechtigungen mit Zugriffslevel (Advanced/Standard) anzeigen, inkl. Klartext-Blocker „`public_profile` braucht Advanced Access".
- `category`/`app_type` nicht mehr als fehlende Pflichtfelder werten.
- TikTok-Fehlalarm beheben (`tiktok-oauth-callback` statt `oauth-callback`).

## Deine Schritte danach

1. Nach dem Deploy im Sharing Debugger `https://useadtool.ai/privacy` → **Scrape Again**. Die Canonical URL muss dann `…/privacy` sein, nicht mehr die Startseite.
2. Dasselbe für `https://useadtool.ai/legal/terms`.
3. App Mode auf **Live** stellen — der „Invalid Privacy Policy URL"-Dialog sollte weg sein.
4. **App Review → Permissions and Features → `public_profile` → Request advanced access**. Das bleibt der letzte echte Blocker für den Facebook-Login.

## Technische Details

- `index.html`: Zeile mit `og:url` entfernen; `<meta property="fb:app_id" content="<App-ID>" />` ergänzen; Startseiten-Duplikate der og/twitter-Tags bereinigen.
- `src/components/SEO.tsx`: `url` über `getCanonicalUrl()` einmalig absolut auflösen und für `og:url`, `twitter:url` und `<link rel="canonical">` dieselbe Quelle nutzen (aktuell nutzt `canonical` den Rohwert, `og:url` den aufgelösten — daher die Domain-Verdopplung).
- `supabase/functions/oauth-config-check/index.ts`: Permissions-Übersicht via Graph (`meta_permissions: [{ permission, status }]`), bereinigte Pflichtfeldliste, `expected_redirect` je Provider.
- `src/components/performance/ConnectionDiagnostics.tsx`: Abschnitt „Meta-Berechtigungen" mit Ampel je Permission und Soll-Redirect je Kanal.
- `src/lib/translations.ts`: neue Texte DE/EN/ES.
- Keine Änderung an der OAuth-Logik selbst.

Hinweis: Weil die Seite eine reine Browser-App ohne Server-Rendering ist, sehen Social-Crawler grundsätzlich nur den statischen Head. Deshalb ist der Fix in `index.html` der entscheidende — routenspezifische Vorschauen für Crawler bräuchten Server-Rendering ([was der Umstieg bringt](https://lovable.dev/blog/building-apps-using-tanstack-start)).
