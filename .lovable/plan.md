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

## Erledigt

- App-Modus steht auf **Live** (war nie der Blocker).
- **Required actions**: einziger Eintrag „Submit Data Use Checkup" ist **Completed** — hier ist nichts mehr offen.
- Site URL wurde neu gespeichert.

## Nächster Schritt: App Review für `public_profile`

Das ist jetzt der einzige echte Blocker für fremde Nutzer. Ohne Advanced Access können sich nur Personen einloggen, die in **App roles → Roles/Test users** eingetragen sind — alle anderen sehen „Feature nicht verfügbar".

1. **App Review → Permissions and Features** öffnen, nach `public_profile` suchen und **Request advanced access** klicken.
2. Bei „Provide testing instructions" (im Website-Block) eine kurze Anleitung hinterlegen: Testkonto, Weg zu **Verbindungen → Facebook verbinden**, was danach passiert. Meta lehnt sonst ohne Prüfung ab.
3. **Facebook Login → Einstellungen → Gültige OAuth-Redirect-URIs** gegenprüfen — der Soll-Wert steht mit Kopier-Button im Diagnose-Panel unter Verbindungen.
4. Grunddaten mit den kanonischen Adressen abschließen:
   - Datenschutz: `https://useadtool.ai/legal/privacy`
   - Nutzungsbedingungen: `https://useadtool.ai/legal/terms`
   - Datenlöschung: `/delete-data`

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
