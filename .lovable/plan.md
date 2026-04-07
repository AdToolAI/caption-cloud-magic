

## Plan: YouTube Live / YouTube Gaming Integration im Gaming Hub

### Was gebaut wird

Ein 7. Tab **"YouTube Live"** im Gaming Hub — parallel zum Twitch-Tab, aber für YouTube-Livestreaming. Nutzt die bereits vorhandenen YouTube-Credentials (GOOGLE_CLIENT_ID/SECRET + OAuth social_connections) und die YouTube Data API v3 Live Streaming Endpoints.

### Architektur

```text
Frontend (YouTubeLiveTab.tsx)
  ↓ supabase.functions.invoke('youtube-live')
Edge Function (youtube-live)
  ↓ YouTube Data API v3
  ↓ liveBroadcasts, liveStreams, liveChatMessages
```

### Schritt 1: Edge Function `youtube-live`

**`supabase/functions/youtube-live/index.ts`** — Proxy für YouTube Live API mit folgenden Actions:

| Action | YouTube API Endpoint | Funktion |
|--------|---------------------|----------|
| `get_broadcast` | `liveBroadcasts.list` | Aktuellen/geplanten Broadcast abrufen |
| `create_broadcast` | `liveBroadcasts.insert` | Neuen Broadcast erstellen (Titel, Beschreibung, Zeitplan, Privacy) |
| `update_broadcast` | `liveBroadcasts.update` | Titel/Beschreibung während des Streams ändern |
| `transition_broadcast` | `liveBroadcasts.transition` | Status wechseln (testing → live → complete) |
| `get_stream` | `liveStreams.list` | Stream-Key und Ingestion-URL abrufen |
| `create_stream` | `liveStreams.insert` | Neuen Stream-Key erstellen |
| `bind_stream` | `liveBroadcasts.bind` | Stream an Broadcast binden |
| `get_chat` | `liveChatMessages.list` | Live-Chat lesen |
| `send_chat` | `liveChatMessages.insert` | Chat-Nachricht senden |
| `get_analytics` | `videos.list` (statistics) | Concurrent Viewers, Likes etc. |

Token-Refresh über verschlüsselte `social_connections`-Tokens (bestehendes Pattern).

### Schritt 2: Hook `useYouTubeLive`

**`src/hooks/useYouTubeLive.ts`** — React-Hook mit:
- `broadcasts` — Liste geplanter/aktiver Broadcasts
- `currentBroadcast` — Aktuell laufender Stream
- `streamKey` / `ingestionUrl` — Für OBS/Streaming-Software
- `chatMessages` — Live-Chat mit Polling
- `createBroadcast(title, description, scheduledAt, privacy)`
- `updateBroadcast(id, title, description)`
- `transitionBroadcast(id, status)` — testing/live/complete
- `sendChatMessage(liveChatId, message)`
- `isYouTubeConnected` — Prüft social_connections für youtube

### Schritt 3: Komponente `YouTubeLiveTab.tsx`

**`src/components/gaming/YouTubeLiveTab.tsx`** — Premium-Glassmorphism-Komponente mit 4 Bereichen:

**a) Broadcast-Steuerung (Hauptbereich)**
- Formular: Titel, Beschreibung, Zeitplan (Datum/Uhrzeit), Privacy (public/unlisted/private)
- "Broadcast erstellen"-Button
- Aktiver Broadcast mit Live-Indikator (rot pulsierend)
- Status-Transitions: "Test starten" → "Live gehen" → "Stream beenden"
- Stream-Key anzeigen (verborgen, copy-to-clipboard)
- Ingestion-URL für OBS

**b) Live-Dashboard (während Stream)**
- Concurrent Viewers (animiert, CountUp)
- Likes, Chat-Rate
- Stream-Dauer (live Timer)
- Thumbnail-Preview

**c) Live-Chat**
- Chat-Feed mit Auto-Scroll
- Nachricht senden
- Moderations-Badges (Owner, Moderator)

**d) Geplante Broadcasts**
- Liste geplanter Streams mit Edit/Delete
- Countdown zum nächsten geplanten Stream

### Schritt 4: GamingHub.tsx anpassen

- 7. Tab "YouTube" hinzufügen (YouTube-Icon, rot)
- TabsList auf `grid-cols-7`
- `YouTubeLiveTab` importieren und rendern

### Schritt 5: YouTube-Verbindungsstatus

- Prüft `social_connections` für `provider = 'youtube'`
- Falls nicht verbunden: Setup-Anleitung mit OAuth-Flow-Button
- Nutzt bestehenden OAuth-Callback-Flow

### Dateien

| Aktion | Datei |
|--------|-------|
| Neu | `supabase/functions/youtube-live/index.ts` |
| Neu | `src/hooks/useYouTubeLive.ts` |
| Neu | `src/components/gaming/YouTubeLiveTab.tsx` |
| Edit | `src/pages/GamingHub.tsx` (7. Tab) |

### Design

Konsistent mit Gaming Hub — James Bond 2028:
- `backdrop-blur-xl bg-card/60 border border-white/10`
- YouTube-spezifische Rot-Akzente (#FF0000) statt Twitch-Violet
- Framer Motion staggered reveals
- Live-Indikator: rot pulsierend mit Glow
- Stream-Key-Feld: Masked Input mit Copy-Button

### Ergebnis
YouTube-Streamer können direkt aus dem Gaming Hub Broadcasts erstellen, Stream-Keys abrufen, live gehen und den Chat moderieren — parallel zur Twitch-Integration.

