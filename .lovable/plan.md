# Meta-Setup: Seiten sind sauber — nächster Schritt ist App Review

## Stand nach dem erneuten Scrape

| URL | Response | Canonical | Bewertung |
|---|---|---|---|
| `https://useadtool.ai/legal/terms` | 200 | `…/legal/terms` | korrekt, eigenständige Seite |
| `https://useadtool.ai/privacy` | 200 | `…/legal/privacy` | korrekt, zeigt auf die kanonische Datenschutzseite |

Der ursprüngliche Fehler (jede Unterseite wurde als Startseite gewertet) ist damit weg. `fb:app_id` ist gesetzt. Von der Website-Seite ist alles erledigt.

## Nächste Schritte in der Meta-App (keine Code-Änderung nötig)

1. **App-Einstellungen → Grunddaten**: als URLs direkt die kanonischen Adressen eintragen und speichern:
   - Datenschutzerklärung: `https://useadtool.ai/legal/privacy`
   - Nutzungsbedingungen: `https://useadtool.ai/legal/terms`
   - Datenlöschung: die vorhandene `/delete-data`-Seite
   Der Dialog „Invalid Privacy Policy URL" muss jetzt durchgehen.
2. **Facebook Login → Einstellungen → Gültige OAuth-Redirect-URIs**: prüfen, dass exakt die Backend-Callback-URL eingetragen ist (steht im Diagnose-Panel unter Verbindungen im Klartext mit Kopier-Button).
3. **App Review → Permissions and Features → `public_profile` → Request advanced access.** Das ist der letzte echte Blocker: ohne Advanced Access können sich nur App-Rollen (Admin/Tester) einloggen, alle anderen bekommen „Feature nicht verfügbar".
4. Danach im eingeloggten Zustand unter **Verbindungen → Diagnose** einmal prüfen und den Facebook-Login testen.

## Falls Schritt 3 dauert

Bis Advanced Access bewilligt ist, kannst du dein eigenes Konto unter **App-Rollen → Tester/Administratoren** hinzufügen und die Verbindung damit vollständig testen. Instagram- und Seiten-Berechtigungen sind bereits genehmigt.

## Technische Details

Keine Code-Änderung geplant. Live und verifiziert:

- `index.html`: statisches `og:url` entfernt, `fb:app_id` = `1769514810345813`
- `src/config/seo.ts`: `getCanonicalUrl` verhindert Domain-Verdopplung
- `src/components/SEO.tsx`: `canonical`, `og:url`, `twitter:url` aus einer Quelle

Optional später: `/privacy` und `/terms` dauerhaft auf `/legal/...` umleiten, damit es je nur eine öffentliche Adresse gibt — Kosmetik, kein Blocker.
