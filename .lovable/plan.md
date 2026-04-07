

## Plan: Professionelle Discord-Integration im Gaming Hub

### Was gebaut wird

Ein vollständiger 6. Tab "Discord" im Gaming Hub mit Webhook-basierter Discord-Integration: Go-Live-Notifications, Clip-Sharing, Stream-Ende-Zusammenfassungen und Embed-Vorschau — alles im James Bond 2028 Design.

### Architektur

```text
Frontend (DiscordIntegration.tsx)
  ↓ supabase.functions.invoke('discord-webhook')
Edge Function (discord-webhook)
  ↓ POST
Discord Webhook API
```

### Schritt 1: DB-Migration — `gaming_discord_settings`

```sql
CREATE TABLE gaming_discord_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  webhook_url TEXT NOT NULL,
  auto_notify_live BOOLEAN DEFAULT true,
  auto_notify_offline BOOLEAN DEFAULT false,
  notify_on_clip BOOLEAN DEFAULT false,
  custom_go_live_message TEXT,
  custom_offline_message TEXT,
  embed_color INTEGER DEFAULT 9520895,
  include_viewer_count BOOLEAN DEFAULT true,
  include_category BOOLEAN DEFAULT true,
  include_thumbnail BOOLEAN DEFAULT true,
  last_notification_at TIMESTAMPTZ,
  notification_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE gaming_discord_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own discord settings"
  ON gaming_discord_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### Schritt 2: Edge Function `discord-webhook`

- `supabase/functions/discord-webhook/index.ts`
- Unterstützt 4 Notification-Typen: `go_live`, `stream_end`, `new_clip`, `test`
- Baut Rich Embeds mit konfigurierbarer Farbe, Thumbnail, Feldern
- Validiert Webhook-URL (muss `discord.com/api/webhooks/` enthalten)
- Speichert `last_notification_at` und inkrementiert `notification_count`

### Schritt 3: Neue Komponente `DiscordIntegration.tsx`

Premium-Glassmorphism-Komponente mit 4 Bereichen:

**a) Webhook-Setup**
- Input für Discord-Webhook-URL mit Validierung
- "Verbindung testen"-Button der Test-Embed sendet
- Anleitung: "Server-Einstellungen → Integrationen → Webhooks → Neu"
- Verbindungsstatus-Badge (verbunden/nicht verbunden)

**b) Notification-Einstellungen**
- Toggle: Auto-Notify bei Go-Live (mit Custom Message)
- Toggle: Auto-Notify bei Stream-Ende (mit Custom Message)
- Toggle: Neue Clips automatisch teilen
- Toggle: Zuschauerzahl anzeigen / Kategorie anzeigen / Thumbnail anzeigen
- Farbwähler für Embed-Akzentfarbe

**c) Live-Embed-Vorschau**
- Zeigt eine Echtzeit-Vorschau des Discord-Embeds wie es in Discord aussehen wird
- Aktualisiert sich live wenn Einstellungen geändert werden
- Dunkler Discord-Hintergrund (#36393f) für Authentizität

**d) Notification-Historie**
- Zähler: "X Notifications gesendet"
- Letzte Notification: Zeitstempel
- "Jetzt Go-Live senden"-Button (manueller Trigger)
- "Clip teilen"-Button

### Schritt 4: GamingHub.tsx anpassen

- 6. Tab "Discord" hinzufügen (Icon: `MessageCircle` oder Discord SVG)
- TabsList auf `grid-cols-6` ändern
- `DiscordIntegration` importieren und als TabsContent rendern

### Schritt 5: Content-Tab Discord-Status

- In `GamingContentStudio.tsx`: Discord-Einrichten-Button zeigt grünen Badge wenn verbunden
- "Einrichten"-Button wechselt zum Discord-Tab

### Dateien

| Aktion | Datei |
|--------|-------|
| Neu | `src/components/gaming/DiscordIntegration.tsx` |
| Neu | `supabase/functions/discord-webhook/index.ts` |
| Migration | `gaming_discord_settings` Tabelle |
| Edit | `src/pages/GamingHub.tsx` (6. Tab) |
| Edit | `src/components/gaming/GamingContentStudio.tsx` (Status-Badge) |

### Design

Konsistent mit dem Gaming Hub James Bond 2028 Stil:
- `backdrop-blur-xl bg-card/60 border border-white/10`
- Purple/Violet Gradient-Texte und Glow-Shadows
- Framer Motion staggered reveals und hover-lifts
- Discord-spezifische Akzente (#5865F2 Blurple)

