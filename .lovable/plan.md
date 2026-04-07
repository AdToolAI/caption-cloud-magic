

## Plan: Twitch-Integration im Gaming Hub

### Architektur-Überblick

```text
Frontend (Gaming Hub)
  ↓ supabase.functions.invoke()
Edge Functions (twitch-*)
  ↓ Connector Gateway
Twitch Helix API
```

### Schritt 1: Twitch-Connector verbinden
- Den Lovable Twitch-Connector mit dem Projekt verknüpfen
- Stellt `TWITCH_API_KEY` und `LOVABLE_API_KEY` als Secrets bereit
- Kein manueller API-Key nötig

### Schritt 2: Twitch-Benutzername in der DB speichern
- **DB-Migration**: Spalte `twitch_username` zur `profiles`-Tabelle hinzufügen (oder neue Tabelle `twitch_connections`)
- Beim Verbinden gibt der User seinen Twitch-Benutzernamen ein
- Wird validiert via Helix API (`GET /users?login=...`)

### Schritt 3: Edge Functions erstellen

| Funktion | Zweck | Helix Endpoint |
|----------|-------|----------------|
| `twitch-user` | User-Info abrufen (Avatar, ID) | `GET /users` |
| `twitch-stream` | Live-Status, Viewer, Uptime | `GET /streams` |
| `twitch-clips` | Clips eines Channels laden | `GET /clips` |
| `twitch-channel` | Channel-Info (Titel, Game) | `GET /channels` |

Alle nutzen das Gateway-Pattern:
```
https://connector-gateway.lovable.dev/twitch/{endpoint}
```

### Schritt 4: StreamDashboard mit echten Daten
- **Verbindungs-Flow**: Button → Dialog für Twitch-Username → Validierung via `twitch-user` → Speichern in DB
- **Live-Status**: Polling alle 30s via `twitch-stream` — zeigt Viewer, Uptime, Game, Bitrate
- **Offline-State**: Wenn nicht live, letzten Stream anzeigen

### Schritt 5: ClipCreator mit echten Clips
- Clips des verbundenen Channels via `twitch-clips` laden
- Thumbnails, Titel, Views, Dauer anzeigen
- "Export"-Button: Clip-URL an AI Video Studio / Mediathek weiterleiten

### Schritt 6: ChatManager mit Live-Chat (WebSocket)
- Anonyme IRC-Verbindung zu `wss://irc-ws.chat.twitch.tv` (kein Auth nötig zum Lesen)
- Echte Chat-Nachrichten parsen und anzeigen
- Sentiment-Analyse via KI (Lovable AI Gateway)

### Was NICHT im ersten Schritt
- Chat-Nachrichten senden (braucht OAuth User-Token mit `user:write:chat`)
- Follower-Daten (braucht `moderator:read:followers` Scope)
- Stream starten/stoppen (Twitch API unterstützt das nicht)

### Reihenfolge
1. Twitch-Connector verknüpfen
2. DB-Migration + Edge Functions
3. StreamDashboard (Live-Status)
4. ClipCreator (echte Clips)
5. ChatManager (WebSocket-Chat)

### Ergebnis
- Echte Twitch-Daten statt Mock-Daten im Gaming Hub
- Live-Stream-Status mit Auto-Refresh
- Echte Clips mit Export-Möglichkeit
- Live-Chat-Feed mit Sentiment-Analyse

