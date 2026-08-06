# TikTok-Verbindung: Fehler `non_sandbox_target` lösen

## Was der Screenshot sagt

TikTok bricht den Login mit dem Entwickler-Hinweis **`non_sandbox_target`** ab. Bedeutung: Die TikTok-App läuft noch im **Sandbox-Modus**, und das Konto, mit dem du dich anmelden willst, ist **kein eingetragener Sandbox-Tester**. Im Sandbox-Modus lässt TikTok ausschließlich explizit hinterlegte Testkonten zu — alle anderen werden genau so abgewiesen.

Das ist kein Code-Fehler: Die Autorisierungs-URL ist korrekt aufgebaut (Client Key, `response_type=code`, Scopes `user.info.basic`, `video.upload`, `video.publish`, Redirect-URI, State).

Auffällig ist allerdings die Redirect-URI in der URL:
`https://api.useadtool.ai/api/oauth/tiktok/callback` — die muss im TikTok-Developer-Portal **zeichengenau** so eingetragen sein und auf unseren Callback zeigen. Das prüfen wir mit.

## Lösungsweg

### Option A — Sofort testen (Sandbox-Tester eintragen)
Im TikTok Developer Portal → deine App → **Sandbox** → dein TikTok-Konto als Target/Tester hinzufügen und die Einladung im TikTok-Konto bestätigen. Danach funktioniert der Login für dieses Konto sofort. Für echte Kunden reicht das nicht.

### Option B — Produktivbetrieb (nötig für Kunden)
Im Developer Portal die App zur **Review einreichen** (Produkte „Login Kit" und „Content Posting API" mit den drei Scopes). Voraussetzungen: verifizierte Domain `useadtool.ai`, gültige Datenschutz-/AGB-URLs (`/legal/privacy`, `/legal/terms`) und ein Demo-Video des Post-Flows. Erst nach Freigabe kann sich jedes TikTok-Konto verbinden.

### Redirect-URI gegenprüfen
Die im Portal hinterlegte Redirect-URI muss exakt dem Wert entsprechen, den unsere Verbindung sendet. Ich prüfe die serverseitig konfigurierte URI und melde, falls sie vom Portal-Eintrag abweicht.

## Was ich im Code ändern würde

Nur eine Verbesserung der Fehleranzeige — die eigentliche Lösung liegt im TikTok-Portal:

1. Im TikTok-Callback die Fehlercodes von TikTok (`non_sandbox_target`, `invalid_redirect_uri` usw.) auslesen und im Verbindungen-Bereich als **klaren deutschen Hinweistext** anzeigen statt eines generischen Fehlers.
2. Im Diagnose-Panel für TikTok den Sandbox-Status sichtbar machen (`TIKTOK_ENV`) inkl. Hinweis „nur eingetragene Testkonten können sich verbinden" und die aktuell konfigurierte Redirect-URI zum Abgleich anzeigen.

## Technische Details

- Betroffen: `supabase/functions/_shared/tiktok*.ts` (Auth-URL-Bau, Scopes), `supabase/functions/tiktok-oauth-start/index.ts`, TikTok-Callback-Funktion, `src/components/workspace/social/ConnectionDiagnostics.tsx`.
- Keine Änderung an der Auth-URL selbst nötig — sie ist korrekt.
- Facebook/Instagram sind davon nicht betroffen und laufen weiter.
