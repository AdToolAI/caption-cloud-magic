# Meta-Validator blockiert den Data-Handling-Dialog

## Was der neue Screenshot beweist

Der neue Fehler nennt jetzt ausdrücklich `https://www.useadtool.ai/`. Genau diese Adresse war nur der alternative Versuch, Metas alten Cache zu umgehen. Der Versuch hat **nicht funktioniert** und wird zurückgenommen.

Beide Domains wurden unmittelbar nach dem Screenshot erneut mit Metas echten Crawler-Kennungen geprüft:

| URL | `meta-externalagent` | `facebookexternalhit` |
|---|---:|---:|
| `https://www.useadtool.ai/` | 200, HTML | 200, HTML |
| `https://useadtool.ai/` | 200, HTML | 200, HTML |

Damit ist bestätigt: **Nicht das Formular ist eingefroren und nicht die Website ist kaputt.** Der modale „Broken URL“-Blocker liegt über dem Formular und Meta hält intern einen falschen URL-Prüfstatus. Deshalb reagiert **Submit** dahinter nicht.

## Jetzt exakt so vorgehen — kein weiterer Domain-Wechsel

1. Im Fehlerfenster **Close** klicken.
2. Im Data-Handling-Dialog **Cancel** klicken. Die Antworten sind laut Screenshot bereits automatisch gespeichert; nicht weiter auf den ausgegrauten Submit-Button klicken.
3. Unter **App settings → Basic → Website** den `www`-Versuch entfernen und dauerhaft wieder exakt `https://useadtool.ai/` eintragen, dann **Save changes**.
4. Nicht erneut zwischen `www` und ohne `www` wechseln. Die kanonische Hauptdomain bleibt `https://useadtool.ai/`.
5. Den Data-Handling-Dialog neu öffnen. Falls Meta denselben Blocker erneut zeigt, direkt unten im Dialog **Direct Support** öffnen und den Fall als fehlerhaften URL-Validator melden.

## Text für den Meta-Support

```text
Our app is already in Live mode, but the App Review Data Handling submission is blocked by “Broken URL detected” for https://useadtool.ai/.

The URL returns HTTP 200 with text/html and no redirect to both Meta crawler user agents, meta-externalagent/1.1 and facebookexternalhit/1.1. The canonical privacy and terms pages also return HTTP 200 and were successfully refreshed in Meta Sharing Debugger:
https://useadtool.ai/legal/privacy
https://useadtool.ai/legal/terms

Please clear or re-run the cached Basic Settings URL validation for app ID 1769514810345813. The blocking modal also prevents submitting the auto-saved Data Handling form.
```

Beilegen: den aktuellen „Broken URL detected“-Screenshot sowie die beiden erfolgreichen Sharing-Debugger-Screenshots. **Keine weiteren Website- oder DNS-Änderungen** — der Fehler liegt nachweislich hinter Metas Validator-Grenze.

---

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

Keine weiteren Domain-Wechsel oder Website-Änderungen. Die Hauptdomain bleibt `https://useadtool.ai/`; der Fall geht mit den erfolgreichen Sharing-Debugger-Nachweisen an **Direct Support**.

## Technische Details

Live und verifiziert, keine Code-Änderung geplant:

- `index.html`: statisches `og:url` entfernt, `fb:app_id` = `1769514810345813`
- `src/config/seo.ts`: `getCanonicalUrl` verhindert Domain-Verdopplung
- `src/components/SEO.tsx`: `canonical`, `og:url`, `twitter:url` aus einer Quelle
