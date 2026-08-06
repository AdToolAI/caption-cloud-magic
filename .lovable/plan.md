# Meta meldet die Root-URL noch als defekt — externe Prüfung ist sauber

## Verifizierter Stand

| URL | Response | Canonical | Bewertung |
|---|---|---|---|
| `https://useadtool.ai/legal/terms` | 200 | `…/legal/terms` | korrekt, eigenständige Seite |
| `https://useadtool.ai/privacy` | 200 | `…/legal/privacy` | korrekt, zeigt auf die kanonische Datenschutzseite |

Der ursprüngliche Fehler (jede Unterseite wurde als Startseite gewertet) ist damit weg. `fb:app_id` ist gesetzt. Von der Website-Seite ist alles erledigt.

Zusätzlich wurde die von Meta jetzt ausdrücklich beanstandete Root-URL `https://useadtool.ai/` live mit vier Kennungen geprüft:

| Abruf | Status | Weiterleitungen |
|---|---:|---:|
| `facebookexternalhit/1.1` | 200 | 0 |
| `Facebot` | 200 | 0 |
| `meta-externalagent/1.1` | 200 | 0 |
| normaler Browser | 200 | 0 |

Die Antwort ist `text/html`, HTTPS ist gültig und die Startseite wird ohne Redirect ausgeliefert. Der Screenshot widerspricht damit dem aktuell messbaren Zustand: Metas **Basic-Settings-Validator hält noch einen alten „Broken URL“-Status fest**. Das ist jetzt kein Legal-/Canonical-Fehler mehr.

## Nächster Schritt: Site URL in Meta neu validieren

Wichtig vorweg: Die App steht laut Screenshot bereits auf **Live** — das war nie das Problem und muss auch nicht umgeschaltet werden. Der Live-Schalter und der „Broken URL"-Validator sind zwei getrennte Dinge.

1. Dialog schließen und unter **App settings → Basic → Website → Site URL** den aktuellen Wert `https://useadtool.ai/` vollständig löschen und **Save changes** klicken.
2. Danach exakt `https://useadtool.ai/` wieder eintragen und erneut **Save changes** klicken. Dadurch wird nicht nur der Sharing-Cache, sondern Metas separater Basic-Settings-Validator neu angestoßen.
3. In **Required actions** nachsehen, ob dort noch eine konkrete URL-Prüfung offen ist, und diese erneut ausführen.
4. Als weitere Grunddaten direkt die kanonischen Adressen verwenden:
   - Datenschutzerklärung: `https://useadtool.ai/legal/privacy`
   - Nutzungsbedingungen: `https://useadtool.ai/legal/terms`
   - Datenlöschung: die vorhandene `/delete-data`-Seite
5. Danach **Facebook Login → Einstellungen → Gültige OAuth-Redirect-URIs** kontrollieren und **App Review → `public_profile` → Request advanced access** ausführen.

## Wenn Meta den Status danach weiterhin festhält

Dann ist der verbleibende Zustand ausschließlich auf Metas Seite: Screenshot des 200-Ergebnisses aus dem Sharing Debugger zusammen mit der App-ID an den Meta Developer Support geben. Weitere Änderungen an Website, Canonical oder Legal-Routen wären dann kontraproduktiv, weil diese aktuell korrekt antworten.

## Falls Schritt 3 dauert

Bis Advanced Access bewilligt ist, kannst du dein eigenes Konto unter **App-Rollen → Tester/Administratoren** hinzufügen und die Verbindung damit vollständig testen. Instagram- und Seiten-Berechtigungen sind bereits genehmigt.

## Technische Details

Keine Code-Änderung geplant. Live und verifiziert:

- `index.html`: statisches `og:url` entfernt, `fb:app_id` = `1769514810345813`
- `src/config/seo.ts`: `getCanonicalUrl` verhindert Domain-Verdopplung
- `src/components/SEO.tsx`: `canonical`, `og:url`, `twitter:url` aus einer Quelle

Optional später: `/privacy` und `/terms` dauerhaft auf `/legal/...` umleiten, damit es je nur eine öffentliche Adresse gibt — Kosmetik, kein Blocker.
