

## Plan: Stream-Steuerung & Voreinstellungen im Gaming Hub

### Wichtiger Hinweis
Twitch erlaubt es **nicht**, einen Stream per API zu starten — dafür braucht man Streaming-Software (OBS, Streamlabs etc.). Was wir **können**: Alle Voreinstellungen direkt aus dem Gaming Hub konfigurieren, sodass man nur noch in OBS auf "Start" drücken muss.

### Was gebaut wird

**1. Stream-Einstellungen Panel (im Offline-State)**
Statt nur "Offline" anzuzeigen, ein Formular mit:
- **Stream-Titel** bearbeiten
- **Kategorie/Spiel** auswählen (mit Suchfeld via Twitch `GET games`)
- **Stream-Sprache** setzen
- **Tags** hinzufügen/entfernen
- **Speichern**-Button → `PATCH channels` API

**2. Quick-Setup beim Live-State**
Auch während des Streams Titel und Kategorie änderbar (wie im Twitch-Dashboard).

**3. Stream-Checkliste**
Eine visuelle Checkliste vor dem Stream:
- Titel gesetzt?
- Kategorie gewählt?
- "Going Live"-Posts aktiviert?
- Chat-Regeln konfiguriert?
- Link zu OBS/Streaming-Software öffnen

### Technische Umsetzung

**Schritt 1: Twitch-Scopes erweitern**
Die aktuelle Verbindung hat nicht die nötigen Berechtigungen. Reconnect mit:
- `channel:manage:broadcast` (Titel, Kategorie, Tags ändern)
- `channel:manage:schedule` (Stream-Zeitplan)

**Schritt 2: Neue Edge Function `twitch-channel-update`**
- `PATCH channels?broadcaster_id={id}` → Titel, game_id, tags, language setzen
- `GET games?name={query}` → Spiele/Kategorien suchen (für Autocomplete)

**Schritt 3: Edge Function `twitch-games-search`**
- `GET games?name={query}` für das Kategorie-Suchfeld

**Schritt 4: StreamDashboard erweitern**
- **Offline-State**: Formular mit Titel, Kategorie (Autocomplete), Sprache, Tags + Speichern-Button + Checkliste
- **Live-State**: Inline-Edit für Titel und Kategorie + "Auf Twitch ansehen"-Button
- Neuer Button "Stream starten" der erklärt, dass man OBS öffnen muss (mit Deep-Link wenn möglich)

**Schritt 5: useTwitch Hook erweitern**
- `updateChannel(title, gameId, tags)` Funktion hinzufügen
- `searchGames(query)` Funktion hinzufügen

### Ergebnis
- Alle Stream-Voreinstellungen direkt im Gaming Hub konfigurierbar
- Kategorie-Suche mit Autocomplete
- Titel und Tags vor und während des Streams änderbar
- Klare Checkliste vor dem Go-Live

