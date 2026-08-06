# Meta-Fix ist live — nur /privacy ist noch alt gescrapt

## Befund (live geprüft)

Abruf von `https://useadtool.ai/privacy` mit Metas Crawler-Kennung zeigt jetzt:

- `fb:app_id` = `1769514810345813` ist vorhanden
- **kein** `og:url` mehr im Head

Damit sind beide Ursachen behoben. Der Startseiten-Screenshot (12 Sekunden alt) ist sauber: Response 200, Canonical = `https://useadtool.ai/`, keine Weiterleitung.

Der `/privacy`-Screenshot ist **42 Minuten alt** — also noch aus der Zeit vor dem Deploy. Deshalb steht dort weiterhin `og:url Meta Tag → https://useadtool.ai/`. Das ist Metas Cache, kein Fehler mehr im Code.

## Was noch zu tun ist (keine Code-Änderung nötig)

1. Im Sharing Debugger `https://useadtool.ai/privacy` eingeben und **Scrape Again** klicken. Danach muss die Canonical URL `https://useadtool.ai/privacy` lauten und die Zeile „og:url Meta Tag" verschwinden.
2. Dasselbe für `https://useadtool.ai/legal/terms`.
3. In den Meta-App-Einstellungen die Datenschutz-URL erneut speichern — der Dialog „Invalid Privacy Policy URL" sollte jetzt durchgehen.
4. Letzter echter Blocker für den Facebook-Login bleibt: **App Review → Permissions and Features → `public_profile` → Request advanced access**.

## Hinweis

Falls beim Scrapen einmalig ein 418 oder „Curl Timeout" erscheint: das ist eine kurzzeitige Bot-Prüfung des CDN, kein Serverfehler. Einfach erneut „Scrape Again" klicken.

## Technische Details

Keine weiteren Änderungen geplant. Die relevanten Änderungen sind bereits live:

- `index.html`: statisches `og:url` entfernt, `fb:app_id` ergänzt
- `src/config/seo.ts`: `getCanonicalUrl` gibt absolute URLs unverändert zurück (keine Domain-Verdopplung)
- `src/components/SEO.tsx`: `canonical`, `og:url` und `twitter:url` nutzen dieselbe aufgelöste Quelle
