

## Vollen Permission-Dialog erzwingen — `auth_type=rerequest` + Browser-Cache umgehen

### Was du gerade siehst (und warum)

```
┌────────────────────────────────────────────────┐
│ You previously logged into AdTool AI           │
│ Integration with Facebook.                      │
│ Would you like to continue?                     │
│  [ Continue as Samuel ]                         │
│  [ Cancel ]                                     │
└────────────────────────────────────────────────┘
```

Das ist Metas **„Re-Login Screen"**, nicht der Permission-Dialog. Er erscheint, weil:

1. Du hast vorher **nicht auf Disconnect geklickt** → unsere Revoke-Function lief nie (Logs sind leer)
2. Selbst wenn du disconnected hättest: Meta zeigt diesen Screen für jede App, die der User schon mal autorisiert hat, **es sei denn** wir setzen `auth_type=rerequest` → dann zeigt Meta zwingend die volle Scope-Liste

### Fix: 2 OAuth-Parameter, die Meta zum vollen Dialog zwingen

**Datei:** `supabase/functions/instagram-oauth-start/index.ts` (vor Zeile 110, beim Bauen der `authUrl`)

```ts
authUrl.searchParams.set('auth_type', 'rerequest');
authUrl.searchParams.set('display', 'page');
```

- **`auth_type=rerequest`** → Meta-offizieller Parameter, der **immer** den Permission-Dialog mit allen 5 Scopes zeigt (auch wenn der User schon zugestimmt hat). Genau dafür gemacht: Apps, die im Review-Prozess sind, nutzen diesen Parameter
- **`display=page`** → erzwingt die volle Permission-Seite statt des kompakten „Continue as"-Popups

### Was du danach siehst (perfekt für Screencast)

```
┌──────────────────────────────────────────────────────┐
│  AdTool AI Integration is requesting access to:      │
│                                                      │
│  ✓ View your Facebook Pages                          │
│  ✓ View your Instagram account profile               │
│  ✓ Publish content on your behalf                    │
│  ✓ Read engagement on your Pages                     │
│  ✓ Manage your business assets                       │
│                                                      │
│              [ Allow ]    [ Cancel ]                 │
└──────────────────────────────────────────────────────┘
```

Genau dieser Screen ist das, was Meta im Review-Video sehen muss.

### Workflow für die Screencast-Aufnahme

1. **Im Cloud-Browser:** auf „Disconnect Instagram" klicken (jetzt funktioniert die Revoke-Function sauber)
2. **Optional zur Sicherheit:** in den [Facebook App-Settings](https://www.facebook.com/settings?tab=applications) die App-Verbindung manuell entfernen
3. Aufnahme starten → „Connect Instagram" → **voller Permission-Dialog erscheint**
4. „Allow" → Card zeigt Profilbild + Username + Followers ✅

### Risiko & Aufwand
- **Risiko: keines.** 2 zusätzliche URL-Parameter im OAuth-Start. Ändert nichts am Token-Tausch oder der DB.
- **Aufwand:** ~30 Sekunden Code, 1 Datei, 2 Zeilen.

### Nach dem Deploy
Direkt testbar: Disconnect → Connect → voller Dialog garantiert.

