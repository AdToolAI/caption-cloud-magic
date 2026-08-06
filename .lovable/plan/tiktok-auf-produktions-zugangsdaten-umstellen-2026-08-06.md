# TikTok auf Produktions-Zugangsdaten umstellen

## Befund

Dein Developer Portal zeigt die App **AdTool AI** als **Live seit 21.04.2026** in der **Production**-Umgebung. Wir senden aber weiterhin einen **Sandbox-Client-Key**: In der Fehler-URL und in der Projektkonfiguration steht `sbawkr611uvritkdty` — das Präfix `sb` steht für Sandbox. Genau deshalb antwortet TikTok mit `non_sandbox_target`.

Zusätzliche Unstimmigkeit bei der Rückleitungsadresse:
- In der Projektkonfiguration hinterlegt: `https://useadtool.ai/api/oauth/tiktok/callback`
- Tatsächlich gesendet laut Fehler-URL: `https://api.useadtool.ai/api/oauth/tiktok/callback`

Es gibt also zwei unterschiedliche Werte — einen im Frontend, einen serverseitig. Das muss auf **einen** Wert vereinheitlicht werden, der exakt so im TikTok-Portal unter Production hinterlegt ist.

## Vorgehen

### Schritt 1 — Zugangsdaten sicher eintragen
Nach Freigabe dieses Plans öffne ich ein **sicheres Eingabeformular** im Chat für:

- `TIKTOK_CLIENT_KEY` — Production-Client-Key (aus Portal → Production → App details → Credentials, Auge-Symbol zum Anzeigen)
- `TIKTOK_CLIENT_SECRET` — Production-Client-Secret

Die Werte gehst du dort ein; sie erscheinen nirgends im Chatverlauf und nicht im Code.

### Schritt 2 — Umgebung und Rückleitung setzen
Ich setze anschließend serverseitig:
- `TIKTOK_ENV` = `production`
- `TIKTOK_REDIRECT_URI` auf genau den Wert, der im Portal unter Production eingetragen ist

Dazu brauche ich von dir eine kurze Bestätigung, welche der beiden Adressen im TikTok-Portal steht (`useadtool.ai/...` oder `api.useadtool.ai/...`).

### Schritt 3 — Veraltete Frontend-Werte entfernen
Die Sandbox-Werte `VITE_TIKTOK_CLIENT_KEY` und `VITE_TIKTOK_REDIRECT_URI` fliegen aus dem Verbindungspfad — die Autorisierungs-URL wird ohnehin serverseitig gebaut. So gibt es künftig nur eine Wahrheit.

### Schritt 4 — Testen und Diagnose verbessern
- Direkt danach ein echter Verbindungsversuch mit deinem TikTok-Konto, inklusive Mitlesen der Server-Protokolle.
- Im Diagnose-Panel zeige ich künftig Umgebung (Produktion/Sandbox), Client-Key-Präfix und die aktive Rückleitungsadresse an, damit so eine Verwechslung sofort auffällt.
- Der TikTok-Callback übersetzt Fehlercodes wie `non_sandbox_target` in eine klare deutsche Meldung statt eines generischen Fehlers.

## Technische Details

- Secrets: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_ENV`.
- Betroffener Code: `supabase/functions/_shared/tiktok*.ts` (Auth-URL-Bau), `supabase/functions/tiktok-oauth-start/index.ts`, TikTok-Callback-Funktion, `src/components/performance/ConnectionsTab.tsx`, `src/components/workspace/social/ConnectionDiagnostics.tsx`.
- Scopes bleiben unverändert: `user.info.basic`, `video.upload`, `video.publish`.
- Facebook, Instagram und YouTube sind nicht betroffen.
