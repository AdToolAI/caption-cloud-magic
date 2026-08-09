# Prüfung: Sieht Google noch „CaptionGenie"?

## Befund (live abgerufen wie ein Crawler)

Startseite `https://useadtool.ai/` ist sauber:

- `<title>`: „AdTool AI — Ein Creator. Ein ganzes Studio."
- `og:title`, `twitter:title`, `description`, `author`: alle „AdTool AI"
- `manifest.json`: name „AdTool AI - AI Social Media Manager"
- `llms.txt`: „AdTool AI"
- `captiongenie.app` → 301 auf `useadtool.ai`
- `caption-cloud-magic.lovable.app`: Titel ebenfalls „AdTool AI …"
- Kein einziges Vorkommen von „CaptionGenie" im ausgelieferten HTML der Startseite

Deine Einschätzung stimmt also: Googles Beanstandung passt nicht zur Homepage.

## Aber: es gibt echte Altlasten in der App (nicht auf der Startseite)

Ein Reviewer klickt sich durch die App, und dort steht die alte Marke noch:

- `src/pages/Integrations.tsx` — Seitentitel lautet wörtlich `… | CaptionGenie`. Das ist ausgerechnet die Integrations-/Verbindungsseite, also genau der Bereich, den ein OAuth-Reviewer bei YouTube-Scopes ansieht.
- `src/components/performance/FacebookPageSelectDialog.tsx` — Dialogtext „… die du mit CaptionGenie verbinden möchtest."
- `supabase/functions/send-verification-email/index.ts` — erlaubte Redirect-Origins enthalten noch `captiongenie.app`-Domains.
- `supabase/functions/auth-email-hook/index.ts` — Beispiel-URL `caption-cloud-magic.lovable.app`.
- Diverse interne Dokumente (`SECURITY.md`, `PRODUCTION_SETUP.md`, Docs) — nicht öffentlich, aber unsauber.

Zusätzlich fehlt im Head zwei Dinge, die Googles Abgleich „App-Name ↔ Homepage" stützen würden: `og:site_name` und ein `Organization`-JSON-LD mit `name: "AdTool AI"`.

Nicht überprüfbar von hier aus: welchen Wert dein Google-Cloud-Projekt als **Application home page** im Zustimmungsbildschirm hinterlegt hat. Das Projekt heißt intern `captiongenie-integration` — der Projektname ist für die Prüfung irrelevant, die hinterlegte Homepage-URL nicht.

## Vorschlag

**1. Sichtbare Altlasten entfernen**
`| CaptionGenie` im Integrations-Seitentitel und der CaptionGenie-Satz im Facebook-Seiten-Dialog werden auf „AdTool AI" umgestellt.

**2. Markenidentität im Head verstärken**
`og:site_name` = „AdTool AI" und ein `Organization`-JSON-LD (`name`, `url`, `logo`) in `index.html`, damit der automatisierte Abgleich den Namen eindeutig von der Homepage liest.

**3. Backend-Reste aufräumen**
Alte `captiongenie.app`-Origins und die Beispiel-URL in den Mail-Funktionen auf `useadtool.ai` umstellen (Redirect nach `captiongenie.app` bleibt via 301 ohnehin funktionsfähig).

**4. Vor der Antwort an Trust & Safety**
Du prüfst im Zustimmungsbildschirm, ob „Application home page" exakt `https://useadtool.ai/` ist (nicht die alte Domain, nicht die Lovable-URL). Danach antwortest du mit Verweis auf die aktualisierten Seiten und bittest um erneute Prüfung.

## Technische Details

- `src/pages/Integrations.tsx:89` — Titel-Suffix auf `AdTool AI`.
- `src/components/performance/FacebookPageSelectDialog.tsx:263` — Text DE/EN/ES ohne alte Marke.
- `index.html` — `og:site_name` plus `application/ld+json` Organization-Block.
- `supabase/functions/send-verification-email/index.ts:33-35` und `auth-email-hook/index.ts:51` — Domains aktualisieren; Funktionen neu deployen.
- Keine Änderung an OAuth- oder Publishing-Logik.
