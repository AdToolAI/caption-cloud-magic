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

# Meta „Broken URL detected“ trotz erreichbarer Website

## Do I know what the issue is?

Ja, bis zur zuständigen Systemgrenze: Der **App-Review-Validator** hält `https://useadtool.ai/` weiterhin als defekt fest. Die Website selbst ist aktuell nicht defekt.

Frisch geprüft:

- IPv4: HTTP 200
- IPv6: HTTP 200
- `facebookexternalhit`: HTTP 200
- `meta-externalagent`: HTTP 200
- keine Weiterleitung, gültiges HTTPS, `text/html`
- `robots.txt` erlaubt den Zugriff
- auch `https://www.useadtool.ai/` antwortet direkt mit HTTP 200

Damit liegt der Fehler nicht mehr in Canonical, Legal-Routen oder App-Code. Wahrscheinlich hält Metas separater Prüfstatus noch den früher beobachteten 418/Timeout fest; alternativ wird ein einzelner Meta-Prüfabruf am vorgeschalteten Schutz gelegentlich anders behandelt. Welcher dieser beiden externen Fälle zutrifft, lässt sich aus dem Meta-Dialog nicht unterscheiden.

## Erledigt

- App-Modus steht auf **Live** (war nie der Blocker).
- **Required actions**: einziger Eintrag „Submit Data Use Checkup" ist **Completed** — hier ist nichts mehr offen.
- Site URL wurde neu gespeichert.

## Nächster Versuch: frischen Host validieren

1. Unter **App settings → Basic → Website → Site URL** statt der gecachten Apex-Adresse exakt `https://www.useadtool.ai/` eintragen und speichern. `www` ist live geprüft und liefert ebenfalls direkt 200, wird von Meta aber als neuer Host separat validiert.
2. Danach sofort wieder unter **App Review → Permissions and Features → `public_profile` → Request advanced access** klicken.
3. Wenn der Dialog nicht mehr erscheint, `www` als Site URL belassen. Die eigentliche App und alle Legal-URLs können weiterhin unter `useadtool.ai` laufen.

## Danach: App Review für `public_profile`

Das ist jetzt der einzige echte Blocker für fremde Nutzer. Ohne Advanced Access können sich nur Personen einloggen, die in **App roles → Roles/Test users** eingetragen sind — alle anderen sehen „Feature nicht verfügbar".

1. Bei „Provide testing instructions" eine kurze Anleitung hinterlegen: Testkonto, Weg zu **Verbindungen → Facebook verbinden**, was danach passiert.
2. **Facebook Login → Einstellungen → Gültige OAuth-Redirect-URIs** gegenprüfen — der Soll-Wert steht mit Kopier-Button im Diagnose-Panel unter Verbindungen.
3. Grunddaten mit den kanonischen Adressen abschließen:
   - Datenschutz: `https://useadtool.ai/legal/privacy`
   - Nutzungsbedingungen: `https://useadtool.ai/legal/terms`
   - Datenlöschung: `/delete-data`

## Wenn Meta auch `www` ablehnt

Dann keine weiteren Website-Änderungen vornehmen. Mit den Sharing-Debugger-Screenshots und den aktuellen 200-Prüfungen den Meta Developer Support um Zurücksetzen der gespeicherten URL-Compliance bitten. Parallel Lovable Support den früheren 418-Response nennen und um Prüfung bitten, ob Meta-Crawler am vorgeschalteten Bot-Schutz zeitweise herausgefordert werden. Weitere Änderungen an Canonical oder Legal-Routen wären kontraproduktiv.

## Falls Schritt 3 dauert

Bis Advanced Access bewilligt ist, kannst du dein eigenes Konto unter **App-Rollen → Tester/Administratoren** hinzufügen und die Verbindung damit vollständig testen. Instagram- und Seiten-Berechtigungen sind bereits genehmigt.

## Technische Details

Keine Code-Änderung geplant. Live und verifiziert:

- `index.html`: statisches `og:url` entfernt, `fb:app_id` = `1769514810345813`
- `src/config/seo.ts`: `getCanonicalUrl` verhindert Domain-Verdopplung
- `src/components/SEO.tsx`: `canonical`, `og:url`, `twitter:url` aus einer Quelle

Optional später: `/privacy` und `/terms` dauerhaft auf `/legal/...` umleiten, damit es je nur eine öffentliche Adresse gibt — Kosmetik, kein Blocker.
