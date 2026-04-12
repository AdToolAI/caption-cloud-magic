

## Plan: Localize Creator Community (EN/DE/ES)

### Problem
The entire Community module (~12 files) has ~80 hardcoded German strings visible in the English UI.

### Files to edit (12 files)

| File | German strings (~count) |
|------|------------------------|
| `src/lib/translations.ts` | Add ~80 `community.*` keys (EN/DE/ES) |
| `src/pages/Community.tsx` | ~5 — subtitle, tab labels ("Nachrichten", "Kollaborationen") |
| `src/components/community/MessagesTab.tsx` | ~2 — "Direktnachrichten", "Plattform-Updates" |
| `src/components/community/DirectMessages.tsx` | ~4 — "Noch keine Konversationen", "Starte einen Chat", "Nachricht schreiben...", date locale |
| `src/components/community/PlatformAnnouncements.tsx` | ~3 — "Keine Ankündigungen vorhanden", "Wichtig", date locale |
| `src/components/community/CommunityTab.tsx` | ~1 — "Wähle einen Channel aus" |
| `src/components/community/ChannelList.tsx` | ~2 — "Noch keine Channels vorhanden", "Channels" header |
| `src/components/community/MessageFeed.tsx` | ~3 — "Noch keine Nachrichten", "Sei der Erste", "Anonym", "Moderiert", date locale |
| `src/components/community/MessageComposer.tsx` | ~4 — "Nachricht schreiben...", "Du bist nicht berechtigt", "Mindestens ein Tag erforderlich", "Tag..." |
| `src/components/community/SpotlightCard.tsx` | ~2 — "Spotlight Post", "Nächste Rotation:", date locale |
| `src/components/community/TagFilter.tsx` | ~1 — "Alle zurücksetzen" |
| `src/components/community/MentoringTab.tsx` | ~15 — "Eigenen Mentor-Slot anbieten", "Slot erstellen", "Erstellen", "Verfügbare Slots", "Meine angebotenen Slots", "Meine gebuchten Sessions", "Gebucht", "Offen", "Buchen", date locale |
| `src/components/community/CollaborationsTab.tsx` | ~18 — "Alle", "Offen", "Vergeben", "Geschlossen", "Neuer Post", "Titel der Kollaboration", "Beschreibe dein Projekt...", "Skill hinzufügen", "Hinzufügen", "Abbrechen", "Veröffentlichen", "Keine Kollaborationen gefunden", "Als vergeben markieren", "Schließen", "Anonym", date locale |
| `src/components/community/MentorSlotBooking.tsx` | ~4 — "Peer-Mentoring Slots", "Keine offenen Slots verfügbar", "Buchen", date locale |

### Approach
1. Add `community.*` namespace to `translations.ts` with all keys in EN/DE/ES. DE values = exact current hardcoded strings.
2. Add `useTranslation` hook to all 12 component files, replace strings with `t()` calls.
3. Switch `date-fns` locale dynamically based on current language (import `en` and `es` locales alongside `de`).
4. German UI remains identical.
5. Single batch edit of all files.

### Technical details
- Date formatting: create a helper `getDateLocale(language)` that returns the correct `date-fns` locale
- Status labels ("Offen", "Vergeben", "Geschlossen", "Gebucht") mapped via `t()` calls
- Filter buttons in CollaborationsTab use `t()` for display while keeping English status values for logic

