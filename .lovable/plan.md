

## Instagram-Disconnect: Permissions bei Meta widerrufen → voller Dialog beim Reconnect

### Warum Facebook „funktioniert" und Instagram nicht

Du hast den entscheidenden Unterschied richtig erkannt: Beim Facebook-Reconnect siehst du den vollen Permission-Dialog. Das liegt daran, dass Facebook-Verbindungen über `pages/me/permissions` sauber widerrufen werden (oder du es manuell in deinen FB-Settings entfernt hast). Bei Instagram löscht unser „Disconnect" aktuell **nur die DB-Row** — Meta merkt nichts davon und zeigt beim nächsten Connect „Continue as Samuel" statt des vollen Dialogs.

### Was wir ändern (3 Punkte)

#### 1. Instagram-Disconnect ruft Meta DELETE-Endpoint auf
**Datei:** `supabase/functions/oauth-disconnect/index.ts` (oder dort wo Disconnect liegt — falls die Logik in `ConnectionsTab.tsx` direkt sitzt, neue Edge Function `instagram-oauth-revoke`)

Vor dem Löschen der `social_connections`-Row:
```ts
DELETE https://graph.facebook.com/v24.0/{user-id}/permissions?access_token={user_token}
```

Das widerruft **alle App-Permissions** für diesen User bei Meta. Beim nächsten Connect erscheint zwingend der volle Permission-Dialog — exakt wie beim Facebook-Flow, ohne dass irgendwelche speziellen OAuth-Parameter nötig sind.

Falls der Token bereits abgelaufen ist (oder Meta den Call verweigert): Wir loggen die Warnung, löschen aber trotzdem die DB-Row. So bleibt Disconnect immer funktionsfähig.

#### 2. `account_type`-Bug im Callback fixen
**Datei:** `supabase/functions/oauth-callback/index.ts` (Zeile ~617)

Meta Graph API v24 akzeptiert `account_type` nicht mehr → Profil-Fetch crasht → Verbindung wird nie gespeichert → UI zeigt nichts an.

```ts
// Vorher (crasht):
?fields=id,username,profile_picture_url,account_type,media_count,followers_count

// Nachher:
?fields=id,username,profile_picture_url,media_count,followers_count
```

`account_type` setzen wir hartcodiert auf `'BUSINESS'` in den Metadaten (alle IG-Accounts via FB Pages sind per Definition Business/Creator).

#### 3. Echte Fehlermeldung ans Frontend
**Datei:** `supabase/functions/oauth-callback/index.ts` (Zeile ~222)

Damit du beim nächsten Fehler sofort die Ursache siehst statt „OAuth connection failed":
```ts
&message=${encodeURIComponent(errorMessage)}
```

### Was du danach erlebst (genau wie bei Facebook)

1. Klick auf „Disconnect Instagram" → Permissions werden bei Meta widerrufen + DB-Row gelöscht
2. Klick auf „Connect Instagram" → **Voller Permission-Dialog** mit allen 5 Scopes erscheint (perfekt für Screencast)
3. „Allow" → Redirect zurück
4. Card zeigt: Profilbild, `@username`, Follower-Count, „Connected" ✅

Genauso wie beim Facebook-Reconnect.

### Bonus für Meta App Review

Mit diesem Fix kannst du im Screencast **live demonstrieren**:
- „Hier disconnecte ich" → Permissions werden bei Meta gelöscht
- „Hier connecte ich neu" → Voller Dialog erscheint reproduzierbar
- Reviewer sieht: User hat **echte Kontrolle** über die App-Permissions (Meta-Policy-Anforderung)

### Risiko & Aufwand

- **Risiko: minimal.** Ein zusätzlicher API-Call vor dem DB-Delete + 2 Field-String-Korrekturen. Falls Meta-Revoke fehlschlägt, läuft Disconnect trotzdem durch (graceful fallback).
- **Aufwand:** ~5 Min Code, 3 Dateien (`oauth-disconnect`/Disconnect-Handler, `oauth-callback`).

### Nach dem Deploy

Direkt testbar: Disconnecten → Reconnecten → voller Dialog. Falls dein aktueller Token (vom kaputten Versuch) noch existiert: einmalig in deinen [Facebook App-Settings](https://www.facebook.com/settings?tab=applications) entfernen, danach läuft alles automatisch.

