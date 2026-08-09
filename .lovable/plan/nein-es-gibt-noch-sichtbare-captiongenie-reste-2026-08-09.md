# Nein — es gibt noch sichtbare „CaptionGenie"-Reste

Die Startseite und der Head sind sauber. Aber ein Prüfer, der sich durch die App klickt, sieht die alte Marke weiterhin an mehreren Stellen. Belegt per Codesuche:

| Stelle | Was ein Reviewer sieht |
|---|---|
| `src/pages/GamingHub.tsx:56` | Browser-Tab-Titel „Gaming Hub \| CaptionGenie" |
| `src/pages/admin/Monitoring.tsx:16` | Tab-Titel „Performance Monitoring - CaptionGenie" |
| `src/components/gaming/DiscordIntegration.tsx:358` | Vorschau-Text „CaptionGenie Gaming Hub" |
| `src/components/gaming/YouTubeLiveTab.tsx:266` | Erstellt einen YouTube-Stream mit Titel „CaptionGenie Stream" — landet echt auf YouTube |
| `supabase/functions/instagram-publish/index.ts:162` | Standard-Caption „Posted via CaptionGenie 🚀" — steht öffentlich unter jedem Post ohne eigene Caption |
| `supabase/functions/discord-webhook/index.ts:77-125` | Discord-Nachrichten mit Titel/Footer „CaptionGenie" |
| `supabase/functions/ai-companion/index.ts:165,176` | Anleitungstext verweist auf `caption-cloud-magic.lovable.app` statt `useadtool.ai` |
| `supabase/functions/connect-instagram-performance/index.ts:73,102` | Demo-Konto `@captiongenie_socialmanager` |
| `src/pages/admin/CacheHealth.tsx:272` | Beispieltext nennt `captiongenie.app` |

Für die Google-Beanstandung („App-Name stimmt nicht mit der Homepage überein") sind vor allem die **Seitentitel** und die **öffentlich sichtbare Instagram-Standard-Caption** relevant — genau die Signale, die ein automatisierter oder manueller Check aufgreift.

## Umsetzung

**1. Sichtbare Titel und Texte umstellen**
Alle oben gelisteten Nutzer-Texte auf „AdTool AI" ändern. Der YouTube-Stream-Titel wird „AdTool AI Stream", die Instagram-Standard-Caption „Posted via AdTool AI".

**2. Alte Domains ersetzen**
`caption-cloud-magic.lovable.app` und `captiongenie.app` in Anleitungs- und Beispieltexten auf `useadtool.ai` umstellen. Die Redirect-Origin-Liste in `send-verification-email` behält `caption-cloud-magic.lovable.app` als technisch gültigen Origin — die bleibt bewusst stehen, sonst brechen bestehende Verifizierungslinks.

**3. Demo-Konto umbenennen**
`@captiongenie_socialmanager` → `@adtoolai_socialmanager`; die Prüfung in `ConnectionsTab.tsx:1077` wird mitgezogen, damit die Demo-Erkennung weiter greift.

**4. Marken-Wächter**
Ein Test, der das gesamte `src/`- und `supabase/functions/`-Verzeichnis nach „CaptionGenie" / „caption-cloud-magic" durchsucht und fehlschlägt, wenn etwas zurückkommt. Danach kann die alte Marke nicht unbemerkt wieder einziehen.

## Ehrliche Einschätzung zum Review

Diese Änderungen entfernen den nachweisbaren Widerspruch. Eine Garantie für die Freigabe ist das nicht — die Google-Prüfung vergleicht den **Consent-Screen-Namen** mit der **hinterlegten Application home page**. Das musst du in der Konsole selbst prüfen:

- App-Name im Zustimmungsbildschirm exakt `AdTool AI`
- Application home page exakt `https://useadtool.ai/`
- Datenschutz- und Nutzungsbedingungen-URLs auf derselben Domain

Stimmt eines davon nicht, hilft kein Code-Fix.

## Technische Details

- Reine String-Änderungen in den oben genannten Dateien, keine Logikänderung.
- Betroffene Edge Functions (`instagram-publish`, `discord-webhook`, `ai-companion`, `connect-instagram-performance`) werden neu deployt.
- Neuer Test unter `tests/` als Marken-Regressionsschutz.
