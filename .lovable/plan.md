

## Community Hub: 4-Tab-Struktur mit Nachrichten, Channels, Mentoring & Kollaborationen

### Uebersicht

Die `/community`-Seite wird in 4 Tabs aufgeteilt. Das MessageSquare-Icon im Header fuehrt weiterhin dorthin.

```text
Community Hub
┌────────────────┬──────────────┬──────────────┬──────────────────┐
│  Nachrichten   │  Community   │  Mentoring   │  Kollaborationen │
└────────────────┴──────────────┴──────────────┴──────────────────┘
```

### Tab 1: Nachrichten

Zwei Unter-Bereiche, klar getrennt:
- **Creator/Kunden-DMs**: 1:1 Direktnachrichten zwischen Usern. Links eine Konversationsliste, rechts der Chat.
- **Plattform-Updates**: Nur-Lesen-Bereich fuer Ankuendigungen vom Betreiber (nur Admins koennen posten).

### Tab 2: Community

Bestehende Funktionalitaet — Channels, MessageFeed, TagFilter, SpotlightCard. Wird 1:1 hierher verschoben.

### Tab 3: Mentoring

Bestehende MentorSlotBooking wird zu einer vollwertigen Tab-Ansicht mit Slot-Uebersicht, eigenem Slot erstellen, und gebuchte Sessions.

### Tab 4: Kollaborationen

Marktplatz fuer Creator-Kooperationen: Posts mit Titel, Beschreibung, gesuchte Skills, Status (offen/vergeben). Creator koennen sich bewerben.

### Datenbank-Aenderungen (3 neue Tabellen)

| Tabelle | Spalten | Zweck |
|---|---|---|
| `direct_messages` | id, sender_id, receiver_id, content, read_at, created_at | 1:1 Nachrichten |
| `platform_announcements` | id, title, content, author_id, priority, created_at | Betreiber-Updates (nur Admin schreibt) |
| `collaboration_posts` | id, user_id, title, description, skills_needed (text[]), status (open/taken/closed), created_at | Collab-Marktplatz |

RLS:
- `direct_messages`: Lesen/Schreiben nur wenn sender_id oder receiver_id = auth.uid()
- `platform_announcements`: Lesen fuer alle auth User, Schreiben nur Admin (via has_role)
- `collaboration_posts`: Lesen alle auth User, Schreiben/Update nur eigene Posts

Realtime fuer `direct_messages` aktivieren.

### Frontend-Aenderungen

| Datei | Aenderung |
|---|---|
| `src/pages/Community.tsx` | Komplett umbauen: 4 Tabs (Radix Tabs). Jeder Tab laedt eigene Komponente. |
| `src/components/community/DirectMessages.tsx` | NEU — Konversationsliste + Chat-Ansicht fuer DMs |
| `src/components/community/PlatformAnnouncements.tsx` | NEU — Nur-Lesen Feed der Betreiber-Updates |
| `src/components/community/MessagesTab.tsx` | NEU — Wrapper mit Toggle zwischen DMs und Plattform-Updates |
| `src/components/community/CommunityTab.tsx` | NEU — Bestehende Channel/Feed/TagFilter-Logik hierher extrahiert |
| `src/components/community/MentoringTab.tsx` | NEU — Erweiterte Mentoring-Ansicht (Slots browsen, eigenen Slot anbieten, gebuchte Sessions) |
| `src/components/community/CollaborationsTab.tsx` | NEU — Collab-Posts erstellen, browsen, sich bewerben |
| `src/hooks/useDirectMessages.ts` | NEU — DM-Logik mit Realtime |
| `src/hooks/useCollaborations.ts` | NEU — CRUD fuer Collab-Posts |

### Implementierungsreihenfolge

1. DB-Migration: 3 neue Tabellen + RLS + Realtime
2. Community.tsx zu Tab-Layout umbauen
3. CommunityTab — bestehende Logik extrahieren
4. MentoringTab — bestehende Logik erweitern
5. MessagesTab mit DirectMessages + PlatformAnnouncements
6. CollaborationsTab mit Marktplatz-UI

