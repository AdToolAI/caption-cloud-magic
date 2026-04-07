

## Plan: Gaming Hub 2026 Upgrade — Vollausstattung für Twitch-Streamer

### Aktueller Stand
Der Gaming Hub hat 5 Tabs (Stream, Clips, Content, Analytics, Chat), aber vieles ist Platzhalter oder statische Dummy-Daten. Mit den jetzt aktivierten Scopes können wir alles mit echten Daten füllen.

### Aktivierte Scopes (alle verfügbar)
`channel:manage:broadcast`, `channel:manage:schedule`, `channel:manage:polls`, `channel:manage:predictions`, `channel:manage:redemptions`, `clips:edit`, `moderator:read:chatters`, `channel:read:hype_train`, `analytics:read:games`, `bits:read`, `channel:read:vips`, `channel:read:polls`, `channel:read:predictions`

---

### 1. Stream-Tab: Vollständiges Stream-Cockpit

**Offline-State → Stream-Vorbereitung:**
- Formular: Titel, Kategorie (Autocomplete via `GET games?name=`), Sprache, Tags
- Speichern-Button → `PATCH channels` via neue Edge Function `twitch-channel-update`
- Pre-Stream-Checkliste (Titel gesetzt? Kategorie gewählt? OBS bereit?)
- "OBS öffnen"-Button (Deep-Link `obsproject://`)

**Live-State → Live-Steuerung:**
- Titel & Kategorie inline editierbar (auch während des Streams)
- Quick-Clip erstellen (`POST clips` via `twitch-clip-create` Edge Function)
- Hype-Train-Widget (Live-Anzeige via Polling `GET hypetrain/events`)

**Neue Edge Functions:**
- `twitch-channel-update` — PATCH channels (Titel, game_id, tags)
- `twitch-games-search` — GET games?name= (Autocomplete)
- `twitch-clip-create` — POST clips (Clip erstellen)
- `twitch-hype-train` — GET hypetrain/events

### 2. Clips-Tab: Echte Clip-Erstellung

**Aktuell:** Nur Anzeige existierender Clips
**Neu:**
- "Clip erstellen"-Button (nur sichtbar wenn Live) → `POST clips` API
- Clip-Filter: Nach Datum, Views, Dauer sortieren
- "Als Short exportieren"-Button → Weiterleitung zum AI Video Studio mit Clip-URL als Referenz
- Clip-Statistiken (Views, Shares pro Clip)

### 3. Chat-Tab: Interaktive Chat-Tools

**Aktuell:** Nur-Lese-Chat + einfache Sentiment-Analyse
**Neu:**
- **Chat senden** via REST API (`POST chat/messages`, Scope `user:write:chat`)
- **Viewer-Liste** live anzeigen (`GET chat/chatters`, Scope `moderator:read:chatters`)
- **Polls erstellen & verwalten** — Poll-Panel mit Create/End (`POST polls`, `PATCH polls`)
- **Predictions erstellen** — Wetten für Zuschauer (`POST predictions`)
- **Hype-Train-Anzeige** — Live-Widget wenn ein Hype Train läuft

**Neue Edge Functions:**
- `twitch-send-chat` — POST chat/messages
- `twitch-chatters` — GET chat/chatters
- `twitch-polls` — POST/GET/PATCH polls
- `twitch-predictions` — POST/GET/PATCH predictions

### 4. Analytics-Tab: Echte Daten statt Platzhalter

**Aktuell:** Hardcoded Dummy-Zahlen
**Neu:**
- Echte Follower-Zahl via `GET channels/followers?broadcaster_id=` (Count)
- Subscriber-Zahl via `GET subscriptions`
- Viewer-Verlauf aus gespeicherten Stream-Sessions (DB-Tabelle `stream_sessions`)
- Bits-Einnahmen via `GET bits/leaderboard`
- Top-Clips der Woche nach Views
- Stream-Historie: Vergangene Streams mit Dauer, Peak-Viewers, Kategorie

**Neue Edge Functions:**
- `twitch-followers` — GET channels/followers (count)
- `twitch-bits` — GET bits/leaderboard

**DB-Migration:**
- Tabelle `stream_sessions` (user_id, started_at, ended_at, peak_viewers, avg_viewers, game_name, title) — wird automatisch befüllt wenn Stream-Status wechselt

### 5. Content-Tab: Automatisierung aktivieren

**Aktuell:** Nur UI-Platzhalter
**Neu:**
- **Going-Live Auto-Posts** tatsächlich verknüpfen: Wenn Stream-Status auf "live" wechselt → automatisch Posts auf verbundenen Plattformen (Instagram, TikTok, X)
- **Stream-Kalender** aus Twitch synchronisieren via `GET schedule` und editierbar via `PATCH schedule/segment`
- **Thumbnail-Generator** mit dem bestehenden KI Picture Studio verknüpfen (Gaming-Preset)

**Neue Edge Functions:**
- `twitch-schedule` — GET/POST/PATCH schedule

### 6. Neuer Tab: Channel Points & Rewards

**Neues Feature:**
- Channel-Point-Rewards anzeigen und verwalten (`GET/POST/PATCH channel_points/custom_rewards`)
- VIP-Liste anzeigen (`GET channels/vips`)
- Subscriber-Liste

**Neue Edge Function:**
- `twitch-rewards` — GET/POST/PATCH channel_points/custom_rewards

---

### Technische Zusammenfassung

| Bereich | Neue Edge Functions | DB-Änderungen |
|---------|-------------------|---------------|
| Stream | `twitch-channel-update`, `twitch-games-search`, `twitch-clip-create`, `twitch-hype-train` | — |
| Chat | `twitch-send-chat`, `twitch-chatters`, `twitch-polls`, `twitch-predictions` | — |
| Analytics | `twitch-followers`, `twitch-bits` | `stream_sessions` Tabelle |
| Content | `twitch-schedule` | — |
| Rewards | `twitch-rewards` | — |

**Hook-Erweiterung (`useTwitch.ts`):**
- `updateChannel()`, `searchGames()`, `createClip()`, `sendChat()`, `getViewerList()`, `createPoll()`, `createPrediction()`

### Empfohlene Reihenfolge
1. Edge Functions deployen (Stream-Steuerung zuerst)
2. StreamDashboard mit Einstellungs-Panel + Live-Edit
3. Chat-Tab mit Senden, Polls, Predictions
4. Analytics mit echten Daten + stream_sessions
5. Content-Tab Automatisierung
6. Channel Points Tab

