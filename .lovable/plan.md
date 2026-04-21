

# Plan: TikTok Production Verbindung finalisieren

Die neuen Production-Credentials sind aktiv (`awnc***5aqg`, kein Sandbox-Prefix mehr). Jetzt müssen wir nur noch alte Sandbox-Verbindungen aufräumen und end-to-end testen.

## Schritte

### 1. Edge Functions neu deployen
Damit die neuen Secrets garantiert geladen werden, deploye ich folgende Functions neu:
- `tiktok-oauth-start`
- `tiktok-oauth-callback`
- `tiktok-sync`
- `tiktok-disconnect`
- `publish-to-tiktok`
- `health-tt`
- `tiktok-health`

### 2. Alte Sandbox-Verbindungen aufräumen
Alle bestehenden Einträge in `social_connections` mit `provider = 'tiktok'` enthalten verschlüsselte Sandbox-Tokens, die in Production nicht mehr gültig sind. Ich erstelle eine Migration, die diese Einträge löscht — User müssen sich einmalig neu verbinden (1 Klick „Connect TikTok").

### 3. End-to-End-Test
- Health-Check: `health-tt` → muss `ok: true` liefern
- OAuth-Start aus dem UI (Performance → Connections → „Connect TikTok") → echter TikTok-Login (kein Sandbox-Banner)
- Nach erfolgreicher Verbindung: `tiktok-sync` zieht Profil-Daten aus echter TikTok API

### 4. Dokumentation aktualisieren
Memory-Eintrag `mem://constraints/social-integrations/platform-portal-and-review-requirements` aktualisieren: TikTok ist nicht mehr „Sandbox", sondern „Production approved".

## Was du danach tun musst

Nach dem Deploy einmalig im UI:
1. Gehe zu **Performance → Connections**
2. Falls noch ein TikTok-Account verbunden angezeigt wird → **Disconnect** klicken
3. **Connect TikTok** klicken → mit deinem echten TikTok-Account einloggen
4. Test-Video posten (kann auch ein 5-Sekunden-Test sein)

## Risiken / Hinweise

- **Bestehende Test-User-Verbindungen werden invalidiert** — das ist gewollt, weil Sandbox-Tokens in Production nicht funktionieren. Falls du das Aufräumen nicht willst, sag Bescheid, dann lassen wir die alten Einträge stehen (sie würden beim nächsten Sync-Versuch sowieso fehlschlagen und User würden zur Neuverbindung aufgefordert).
- **Scopes**: Falls beim ersten OAuth-Versuch ein Scope-Fehler auftaucht, prüfen wir im TikTok Portal nochmal, ob `user.info.basic`, `video.upload` und `video.publish` alle drei freigegeben sind.

