# Meta-Fix ist live — kein Fehler bei /legal/terms

## Befund (live geprüft, mit Metas Crawler-Kennung)

| URL | Status | `og:url` im statischen Head | `fb:app_id` |
|---|---|---|---|
| `https://useadtool.ai/privacy` | 200 | entfernt | vorhanden |
| `https://useadtool.ai/legal/privacy` | 200 | entfernt | vorhanden |
| `https://useadtool.ai/legal/terms` | 200 | entfernt | vorhanden |

Die Route `/legal/terms` existiert im Router (`/legal/:page`) und liefert live sauber 200 aus.

## Warum die Screenshots so aussehen

- **`/legal/terms`: „This URL hasn't been shared on Facebook before."** Das ist kein Fehler, sondern schlicht: Meta hat diese Adresse noch nie abgerufen. Ein Klick auf **Fetch new information** legt den ersten Scrape an.
- **`/privacy`: Canonical zeigt jetzt auf `/legal/privacy`.** Das ist korrekt und gewollt — `/privacy` ist die Kurzform, die kanonische Adresse der Datenschutzerklärung ist `/legal/privacy`. Der frühere Fehlerfall (Canonical = Startseite) ist damit weg.
- Der ältere `/privacy`-Screenshot mit „42 Minuten" stammt noch aus der Zeit vor dem Deploy.

## Empfehlung für die Meta-App-Einstellungen

In den App-Grunddaten als **Datenschutz-URL** direkt die kanonische Adresse eintragen:
`https://useadtool.ai/legal/privacy`
und als Nutzungsbedingungen:
`https://useadtool.ai/legal/terms`

So folgt Meta keiner Umleitung mehr und die Validierung greift sofort.

## Schritte

1. Im Sharing Debugger `https://useadtool.ai/legal/terms` → **Fetch new information**.
2. `https://useadtool.ai/legal/privacy` → **Scrape Again**.
3. In der Meta-App die beiden kanonischen URLs speichern.
4. Letzter echter Blocker für den Facebook-Login bleibt: **App Review → Permissions and Features → `public_profile` → Request advanced access**.

## Technische Details

Keine Code-Änderung geplant — die relevanten Fixes sind bereits live:

- `index.html`: statisches `og:url` entfernt, `fb:app_id` = `1769514810345813`
- `src/config/seo.ts`: `getCanonicalUrl` gibt absolute URLs unverändert zurück
- `src/components/SEO.tsx`: `canonical`, `og:url`, `twitter:url` aus derselben Quelle

Optional, falls gewünscht: `/privacy` und `/terms` serverseitig auf `/legal/...` umleiten, damit es nur je eine öffentliche Adresse gibt. Das ist Kosmetik, kein Blocker.
