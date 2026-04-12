

## Plan: Localize Gaming Hub (EN/DE/ES)

### Problem
The entire Gaming Hub module (8 files) has ~150 hardcoded German strings visible in the English UI.

### Files to edit (9 files)

| File | German strings (~count) |
|------|------------------------|
| `src/lib/translations.ts` | Add ~150 `gaming.*` keys (EN/DE/ES) |
| `src/pages/GamingHub.tsx` | ~2 — SEO description |
| `src/components/gaming/GamingHubHeroHeader.tsx` | ~4 — subtitle, connection status text |
| `src/components/gaming/StreamDashboard.tsx` | ~35 — "Twitch verbinden", "Stream vorbereiten", "Stream-Titel", "Kategorie", "Tags (kommagetrennt)", "Speichern", "Abbrechen", "Trennen", "Bearbeiten", "Zuschauer", "Pre-Stream Checkliste", "Titel gesetzt", "Kategorie gewählt", "OBS bereit/öffnen", "Offline", "Kein aktiver Stream", toasts, dialog labels |
| `src/components/gaming/ClipCreator.tsx` | ~12 — "Verbinde zuerst...", "Clip erstellen", "Neueste", "Meiste Views", "Längste", "Noch keine Clips", "Öffnen", "Als Short", date locale |
| `src/components/gaming/GamingContentStudio.tsx` | ~15 — "KI Thumbnail Generator", "Erstelle professionelle...", "Zum KI Picture Studio", "Going Live Auto-Posts", "Einrichten", "Stream-Kalender", "Kein Stream-Kalender konfiguriert", "Keine Custom Rewards konfiguriert", date locale |
| `src/components/gaming/StreamAnalytics.tsx` | ~8 — "Verbinde zuerst...", "Clips gesamt", "Clip-Views gesamt", "Top Clips nach Views", "Noch keine Clips vorhanden", "Kanal-Info", "Keine Beschreibung" |
| `src/components/gaming/ChatManager.tsx` | ~25 — "Verbinde zuerst...", "Verbunden/Verbindet...", "Warte auf Nachrichten...", "Kanal ist offline...", "Nachricht senden...", "Positiv/Neutral/Negativ", "Nachrichten analysiert", "Viewer & Interaktion", "Viewer-Liste", "Poll erstellen", "Prediction erstellen", "Frage...", "Dauer (Sekunden)", "Abbrechen", "Erstellen", toasts |
| `src/components/gaming/DiscordIntegration.tsx` | ~30 — "Automatische Benachrichtigungen...", "Verbunden/Nicht verbunden", "Webhook einrichten", "So findest du die Webhook-URL", instructions, "Test senden", "Speichern", "Benachrichtigungen", "Go-Live Benachrichtigung", "Stream-Ende Benachrichtigung", "Clips teilen", "Embed-Inhalte", "Zuschauerzahl", "Embed-Vorschau", "Aktionen & Statistik", "Go-Live senden", "Stream-Ende senden", "Clip teilen", toasts, date locale |
| `src/components/gaming/YouTubeLiveTab.tsx` | ~25 — "YouTube Live verbinden", "Verbinde deinen YouTube-Kanal...", "Broadcast erstellen", "Beschreibung", "Zeitplan", "Sichtbarkeit", "Öffentlich/Nicht gelistet/Privat", "Stream-Key", "Erstellen", "Broadcasts", "Keine Broadcasts vorhanden", "Live-Chat", "Chat starten", "Kein aktiver Live-Chat", "Warte auf Nachrichten...", "Drücke 'Chat starten'", "Nachricht senden...", "Test starten", "Stream binden", "Live gehen", "Stream beenden", date locale |

### Approach
1. Add `gaming.*` namespace to `translations.ts` with all keys in EN/DE/ES. DE values = exact current hardcoded strings.
2. Add `useTranslation` hook to all 8 component files, replace strings with `t()` calls.
3. Switch date locale dynamically (`toLocaleDateString` / `toLocaleString` using language-appropriate locale string).
4. German UI remains identical -- no visual changes for DE users.
5. Single batch edit of all files.

