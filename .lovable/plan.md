# TikTok-Verbindung: Fehler `non_sandbox_target` trotz genehmigter App

## Links zum TikTok Developer Portal

- Portal-Start: https://developers.tiktok.com/
- Deine Apps (Manage apps): https://developers.tiktok.com/apps/
- App-Übersicht/Login-Kit-Einstellungen: über „Manage apps" → App auswählen → **Login Kit** / **Content Posting API**
- Sandbox-Verwaltung: https://developers.tiktok.com/apps/ → App → **Sandbox**
- Fehlercode-Doku: https://developers.tiktok.com/doc/login-kit-web

## Warum der Fehler trotz Freigabe kommt

Die Meldung `non_sandbox_target` heißt: Die Autorisierungsanfrage wird von TikTok noch einer **Sandbox-App** zugeordnet, das anmeldende Konto ist dort aber kein Tester.

Wenn die produktive App genehmigt ist, gibt es dafür fast immer eine dieser Ursachen:

1. **Falscher Client Key hinterlegt.** Sandbox und Produktion haben je einen eigenen Client Key/Secret. Der bei uns gespeicherte Key stammt vermutlich noch aus der Sandbox (in der URL sichtbar: `sbawkr611uvritkdty` — das Präfix `sb` deutet stark auf „sandbox" hin).
2. **Redirect-URI gehört zur Sandbox-Konfiguration.** Gesendet wird `https://api.useadtool.ai/api/oauth/tiktok/callback`; diese muss zeichengenau in der **produktiven** App eingetragen sein.
3. Die Umgebungs-Kennzeichnung auf unserer Seite (`TIKTOK_ENV`) steht noch auf Sandbox.

## Vorgehen

### Schritt 1 — Produktive Zugangsdaten holen
Im Developer Portal die genehmigte App öffnen und unter **App details / Credentials** den **Client Key** und **Client Secret** der Produktions-App kopieren. Prüfen, ob der Key mit dem in der Fehler-URL (`sbawkr611uvritkdty`) übereinstimmt — wenn nicht, ist genau das die Ursache.

### Schritt 2 — Redirect-URI abgleichen
In der produktiven App unter **Login Kit → Redirect URI** muss exakt die URI stehen, die wir senden. Ich zeige dir den serverseitig konfigurierten Wert zum 1:1-Abgleich an.

### Schritt 3 — Zugangsdaten bei uns aktualisieren
Sobald die produktiven Werte vorliegen, hinterlege ich sie als Secrets (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`) und setze `TIKTOK_ENV` auf `production`. Danach direkt ein Verbindungstest mit deinem Konto.

### Schritt 4 — Fehlermeldungen verständlich machen
Im TikTok-Callback die TikTok-Fehlercodes (`non_sandbox_target`, `invalid_redirect_uri`, …) auslesen und im Verbindungen-Bereich als klaren deutschen Hinweis anzeigen statt eines generischen Fehlers. Im Diagnose-Panel zusätzlich Umgebung (Sandbox/Produktion), Client-Key-Präfix und konfigurierte Redirect-URI sichtbar machen.

## Technische Details

- Betroffen: `supabase/functions/_shared/tiktok*.ts` (baut die Auth-URL aus `TIKTOK_CLIENT_KEY` und `TIKTOK_REDIRECT_URI`), `supabase/functions/tiktok-oauth-start/index.ts` (liest `TIKTOK_ENV`), TikTok-Callback-Funktion, `src/components/workspace/social/ConnectionDiagnostics.tsx`.
- Die gesendeten Scopes (`user.info.basic`, `video.upload`, `video.publish`) passen bereits zur genehmigten Freigabe — daran ist nichts zu ändern.
- Facebook und Instagram sind nicht betroffen.
