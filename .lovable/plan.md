# Meta Data Handling Questions — was eintragen

Der „Broken URL"-Block ist überwunden: Meta lässt jetzt den Advanced-Access-Antrag für `public_profile` zu und fragt nur noch die Data-Handling-Fragen ab. Die Einstellungen sind fast vollständig — zwei Punkte würde ich anpassen.

## Empfohlene Antworten

**Datenverarbeiter: Ja** — richtig so. Im Code verifiziert: Der OAuth-Callback speichert Meta-Tokens und Account-Infos in der Datenbank (`social_connections`). Es gibt also echte Auftragsverarbeiter.

Einzutragen sind alle, die Meta-Daten (Meta-User-ID, Access-Token, Profilangaben) tatsächlich sehen:

| Eintrag | Rolle |
|---|---|
| `Supabase Inc.` | Datenbank und Backend-Funktionen, speichert Tokens und Account-IDs |
| `Cloudflare, Inc.` | CDN/Edge vor der Website, verarbeitet den Traffic |

**Anpassung 1:** Der bestehende Eintrag lautet „Supabase Inc." — korrekt ist **Supabase Inc.** Bitte über **Edit** die Schreibweise prüfen und korrigieren. Ein falsch geschriebener Verarbeiter ist ein häufiger Ablehnungsgrund.

**Anpassung 2:** `Cloudflare, Inc.` als zweiten Verarbeiter über **Add data processor or service provider** ergänzen.

Reine Rendering- oder KI-Dienste (AWS Lambda, Replicate, ElevenLabs) gehören **nicht** in die Liste — dort landen keine Meta-Daten, sondern nur eigene Medien.

## Die übrigen Felder

- **Verantwortliche Stelle:** „Samuel Dusatko" + „Germany" passt, sofern kein eingetragenes Unternehmen dahintersteht. Gibt es eine Firmierung, muss dort der exakte Firmenname stehen — identisch mit dem Impressum.
- **Nationale Sicherheitsanfragen:** „No" ist korrekt.
- **Policies:** Die drei gesetzten Haken passen. Zusätzlich empfehle ich „Provisions for challenging these requests if they are considered unlawful" anzuhaken, sofern rechtswidrige Anfragen tatsächlich angefochten würden — das ist der übliche Standard.

Danach **Submit**.

## Danach

1. Bei „Provide testing instructions" eine kurze Anleitung hinterlegen: Testkonto, Weg zu **Verbindungen → Facebook verbinden**, was danach passiert.
2. **Facebook Login → Einstellungen → Gültige OAuth-Redirect-URIs** gegenprüfen — der Soll-Wert steht mit Kopier-Button im Diagnose-Panel unter Verbindungen.
3. Grunddaten mit den kanonischen Adressen abschließen:
   - Datenschutz: `https://useadtool.ai/legal/privacy`
   - Nutzungsbedingungen: `https://useadtool.ai/legal/terms`
   - Datenlöschung: `/delete-data`

---

# Vorgeschichte: „Broken URL detected"

## Verifizierter Stand der Website

| Abruf | Status | Weiterleitungen |
|---|---:|---:|
| `facebookexternalhit/1.1` | 200 | 0 |
| `meta-externalagent/1.1` | 200 | 0 |
| IPv4 / IPv6 | 200 | 0 |
| `www.useadtool.ai` | 200 | 0 |

| URL | Response | Canonical |
|---|---|---|
| `https://useadtool.ai/legal/terms` | 200 | `…/legal/terms` |
| `https://useadtool.ai/privacy` | 200 | `…/legal/privacy` |

`fb:app_id` ist gesetzt, das statische `og:url` entfernt, `robots.txt` erlaubt den Zugriff. Von der Website-Seite ist alles erledigt; der frühere Dialog kam aus Metas eigenem, gecachtem Prüfstatus.

## Falls der Dialog zurückkommt

Statt der Apex-Adresse einmalig `https://www.useadtool.ai/` als Site URL eintragen und speichern — `www` ist live geprüft, liefert ebenfalls 200 und wird von Meta als neuer Host separat validiert. Danach sofort erneut **Request advanced access** klicken.

Wenn auch das abgelehnt wird: keine weiteren Website-Änderungen, sondern mit den Sharing-Debugger-Screenshots an den Meta Developer Support.

## Technische Details

Live und verifiziert, keine Code-Änderung geplant:

- `index.html`: statisches `og:url` entfernt, `fb:app_id` = `1769514810345813`
- `src/config/seo.ts`: `getCanonicalUrl` verhindert Domain-Verdopplung
- `src/components/SEO.tsx`: `canonical`, `og:url`, `twitter:url` aus einer Quelle
