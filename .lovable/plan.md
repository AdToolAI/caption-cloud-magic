

## Konzept: Gaming Hub — Livestream & Content Tools für Gamer

### Vision

Ein neuer **"Gaming" Hub** in der Sidebar, der Gamern und Streamern dedizierte Tools bietet — von Twitch-Integration über Clip-Management bis hin zu automatisierten Stream-Highlights und Gaming-Content-Erstellung.

### Features im Überblick

```text
┌─────────────────────────────────────────────────┐
│                  GAMING HUB                      │
├─────────────────────────────────────────────────┤
│                                                  │
│  1. STREAM DASHBOARD                             │
│     Live-Status, Chat, Viewer-Stats              │
│     Twitch-Konto verbinden & verwalten           │
│                                                  │
│  2. CLIP CREATOR                                 │
│     Automatische Highlight-Erkennung             │
│     Clips schneiden & als Shorts exportieren     │
│     TikTok/YouTube Shorts/Instagram Reels        │
│                                                  │
│  3. STREAM OVERLAY DESIGNER                      │
│     Alerts, Panels, Webcam-Frames gestalten      │
│     KI-generierte Overlay-Grafiken               │
│                                                  │
│  4. GAMING CONTENT STUDIO                        │
│     Thumbnails für Gaming-Videos (KI)            │
│     Stream-Ankündigungen für Social Media        │
│     "Going Live"-Posts automatisch posten        │
│                                                  │
│  5. STREAM ANALYTICS                             │
│     Viewer-Trends, Peak-Zeiten, Chat-Aktivität   │
│     Beste Clip-Momente nach Engagement           │
│     Wachstums-Tracking über Zeit                 │
│                                                  │
│  6. CHAT MANAGER                                 │
│     Live-Chat lesen & moderieren                 │
│     Chat-Highlights & Sentiment-Analyse          │
│     Auto-Antworten auf häufige Fragen            │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Echter Mehrwert für Gamer

- **Stream-to-Short Pipeline**: Stream läuft → KI erkennt Highlights → automatisch Clips geschnitten → direkt als TikTok/Reels/Shorts gepostet. Spart Stunden an Nachbearbeitung.
- **"Going Live" Automation**: Sobald der Stream startet, werden automatisch Posts auf allen verbundenen Kanälen veröffentlicht (mit Thumbnail, Titel, Link).
- **Chat-Insights**: Welche Momente hatten die meiste Chat-Aktivität? → Das sind die besten Clip-Kandidaten.
- **Cross-Platform Repurposing**: Ein Stream → 10+ Content-Pieces (Clips, Thumbnails, Ankündigungen, Highlights-Zusammenfassung).

### Technische Umsetzung

**Twitch-Integration**: Lovable hat bereits einen Twitch-Connector verfügbar. Über die Twitch Helix API können wir:
- Stream-Status & Viewer-Daten abrufen
- Clips erstellen und verwalten
- Channel-Infos und Follower-Daten lesen
- Live-Chat via WebSocket lesen

**Neue Dateien**:
- `src/pages/GamingHub.tsx` — Hauptseite mit Tab-Navigation
- `src/components/gaming/StreamDashboard.tsx` — Live-Status & Stats
- `src/components/gaming/ClipCreator.tsx` — Clip-Management & Export
- `src/components/gaming/OverlayDesigner.tsx` — Overlay-Editor
- `src/components/gaming/GamingContentStudio.tsx` — Thumbnails & Posts
- `src/components/gaming/StreamAnalytics.tsx` — Viewer-Analytics
- `src/components/gaming/ChatManager.tsx` — Chat-Monitoring
- `src/hooks/useTwitchConnection.ts` — Twitch API Hook
- Edge Functions für Twitch API Calls via Connector Gateway

**Hub-Config**: Neuer Hub "Gaming" in `hubConfig.ts` mit Gamepad-Icon

**Datenbank**: Tabellen für Stream-Sessions, Clips, Overlay-Presets, Stream-Schedules

### Empfohlener Start (Phase 1)

1. Gaming Hub Seite + Twitch-Verbindung
2. Stream Dashboard mit Live-Status
3. Clip Creator mit Export zu TikTok/Shorts
4. "Going Live" Auto-Posts

Spätere Phasen: Overlay Designer, Chat Manager, Stream Analytics, KI-Highlight-Erkennung

