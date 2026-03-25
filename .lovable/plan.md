

## Creator Community Hub — Messaging-Icon + Kommunikationsdienst

### Uebersicht
Ein 4. Icon (MessageSquare) im Header neben der Glocke, das ein vollstaendiges Creator-Community-System oeffnet. Channels, Nachrichten, Tags, Moderation, Mentoring-Slots und Spotlight-Rotation — alles dynamisch konfigurierbar.

### Architektur

```text
Header:  [☀️] [💬 NEU] [🔔] [👤]
                 │
                 └─→ /community (neue Seite)
                       ├── Channel-Liste (links)
                       ├── Nachrichten-Feed (mitte)
                       ├── Spotlight + Mentoring (rechts)
                       └── Tag-Filter (oben)
```

### Datenbank-Tabellen (6 neue)

| Tabelle | Zweck |
|---|---|
| `community_channels` | id, name, topic, allowed_user_ids (uuid[]), moderation_rules (jsonb), created_by, workspace_id |
| `community_messages` | id, channel_id, user_id, content, tags (text[]), is_spotlight, moderated_at, moderation_status, created_at |
| `community_message_tags` | Normalisierte Tags fuer Filterung |
| `mentor_slots` | id, mentor_user_id, channel_id, slot_time, duration_min, booked_by, status (open/booked/completed) |
| `spotlight_rotation` | id, channel_id, current_post_id, rotated_at, rotation_interval_days |
| `community_audit_log` | id, user_id, action, entity_type, entity_id, metadata (jsonb), created_at — DSGVO-konform |

RLS-Policies:
- Nachrichten lesen: alle authentifizierten Channel-Mitglieder
- Nachrichten posten: nur wenn `auth.uid() = ANY(channel.allowed_user_ids)`
- Mentor-Slots buchen: authentifizierte User, nicht der Mentor selbst
- Audit-Log: nur Service-Role schreibt, User liest eigene Eintraege

### Edge Functions (3 neue)

1. **`community-moderate`** — Prueft neue Nachrichten gegen Moderationsregeln (Wortfilter, Laenge, Spam-Erkennung via AI). Wird per DB-Trigger bei INSERT auf `community_messages` aufgerufen.

2. **`community-notify`** — Sendet Echtzeit-Benachrichtigungen bei:
   - Spotlight-Post ausgewaehlt
   - Mentor-Slot gebucht
   - Nachricht in Channel mit Mention
   Schreibt in bestehende `app_events`-Tabelle fuer NotificationBell-Integration.

3. **`community-spotlight-rotate`** — Cron-Job (woechentlich), waehlt neuen Spotlight-Post pro Channel basierend auf Engagement/Tags. Aktualisiert `spotlight_rotation`.

### Frontend-Komponenten

| Datei | Inhalt |
|---|---|
| `src/pages/Community.tsx` | Hauptseite mit Channel-Liste, Message-Feed, Spotlight-Panel, Mentoring-Buchung |
| `src/components/community/ChannelList.tsx` | Kanal-Navigation mit Topic-Anzeige |
| `src/components/community/MessageFeed.tsx` | Nachrichten mit Tag-Badges, Spotlight-Markierung, Moderation-Status |
| `src/components/community/TagFilter.tsx` | Multi-Select Tag-Filter fuer Nachrichten |
| `src/components/community/SpotlightCard.tsx` | Aktueller Spotlight-Post mit Countdown bis Rotation |
| `src/components/community/MentorSlotBooking.tsx` | Verfuegbare Slots anzeigen + buchen |
| `src/components/community/MessageComposer.tsx` | Nachricht verfassen mit Tag-Auswahl (nur wenn User berechtigt) |
| `src/hooks/useCommunityMessages.ts` | Realtime-Subscription auf `community_messages` |
| `src/hooks/useMentorSlots.ts` | CRUD fuer Mentor-Slots |

### Header-Integration

- **`src/components/Header.tsx`**: Neues `MessageSquare`-Icon neben NotificationBell, mit Unread-Badge (Anzahl ungelesener Nachrichten in allen Channels). Link zu `/community`.
- **`src/config/hubConfig.ts`**: Community-Eintrag im "team"-Hub hinzufuegen.
- **Router**: Neue Route `/community` → `Community.tsx`.

### Moderation

Moderationsregeln pro Channel als JSON:
```json
{
  "max_length": 2000,
  "blocked_words": ["spam", "..."],
  "require_tags": true,
  "auto_approve": false,
  "ai_check": true
}
```

Bei `ai_check: true` wird der Content per Lovable AI (gemini-2.5-flash) auf Toxizitaet geprueft.

### DSGVO-Audit-Log

Jede Aktion (Nachricht senden, loeschen, Slot buchen, Moderation) wird in `community_audit_log` protokolliert mit User-ID, Zeitstempel und Aktion — ohne personenbezogene Inhalte im Log selbst (nur Referenz-IDs).

### Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mentor_slots;
```

### Implementierungsreihenfolge

1. DB-Tabellen + RLS erstellen
2. Community-Seite + Channel/Message-Komponenten
3. Header-Icon + Routing
4. Edge Functions (Moderation, Notify, Spotlight-Rotation)
5. Mentoring-Slot-Buchung
6. Tag-Filter + Realtime
7. Audit-Logging

