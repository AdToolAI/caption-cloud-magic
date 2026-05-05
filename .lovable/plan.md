## Ziel

Aktive Chat-Sitzung bleibt erhalten, auch wenn man das Modul verlässt, zurückkommt oder die Seite neu lädt — solange man nicht explizit auf "Neue Konversation" klickt. Bei Logout / komplettem Schließen landet der Chat (wie bisher) sauber in der History und kann dort wieder geöffnet werden.

## Was sich ändert

### 1. Letzte aktive Konversation merken (`src/pages/AITextStudio.tsx`)

- Neuer kleiner Helfer (gleiche Datei, kein neues File): liest/schreibt `text-studio-last-conversation` in `localStorage` (nur die ID, max ein paar Bytes).
- Beim `send()`: sobald `X-Conversation-Id` zurückkommt oder `conversationId` gesetzt wird → in localStorage speichern.
- Beim `loadConversation(id)`: ebenfalls speichern.
- Beim `newConversation()`: localStorage-Eintrag löschen (damit "Neue Konversation" wirklich resettet).
- Beim `deleteConversation(id)`: wenn es die aktive war → Eintrag löschen.

### 2. Auto-Resume beim Mount (`src/pages/AITextStudio.tsx`)

Bestehender Mount-Effect (Zeile 87–99) wird erweitert um eine dritte Quelle mit klarer Priorität:

1. URL-Param `?conversation=…` (von "Im Studio öffnen" aus dem Pinned Window)
2. `pinned.conversationId` (aktiver gepinnter Chat)
3. **NEU:** `localStorage["text-studio-last-conversation"]` (zuletzt benutzte Konversation)

Damit: Modul verlassen → zurückkommen → Chat ist noch da. Refresh (F5) → Chat ist noch da. Erst "Neue Konversation" leert ihn.

Sicherheitscheck: vor dem Laden prüfen, ob die Konversation dem eingeloggten User gehört (RLS macht das ohnehin, `loadConversation` liefert dann einfach leer und wir clearen die ID).

### 3. Auto-Resume auch im Pinned Window (`src/components/text-studio/PinnedChatWindow.tsx`)

Wenn das Pinned Window geöffnet ist und kein `pinned.conversationId` gesetzt ist, aber `localStorage` einen Wert hat → den Chat dort ebenfalls automatisch laden, damit Studio und Pinned Window konsistent dieselbe letzte Konversation zeigen.

### 4. UI-Klarheit

- Button "Neue Konversation" bekommt einen Tooltip: *"Setzt den aktuellen Chat zurück. Dein bisheriges Gespräch findest du jederzeit unter History."* — damit klar ist, dass es der explizite Refresh ist.
- Kein zusätzlicher Refresh-Button nötig (würde doppelt zur bestehenden "Neue Konversation"-Aktion sein). Falls gewünscht, kann ich daneben ein kleines RefreshCw-Icon ergänzen — sag bitte Bescheid, sonst lasse ich es weg.

## Was sich NICHT ändert

- DB-Schema / RLS / Edge Functions: nichts neu.
- History-Tab: funktioniert weiter wie gehabt (alle gespeicherten Konversationen). Nichts wird automatisch gelöscht — Logout/Close ändert nur, dass beim nächsten Login der Resume-Effekt feuert.
- Privat-Modus (`isPrivate`): bleibt respektiert (private Chats werden auch heute schon nicht in der DB persistiert; in dem Fall speichern wir auch keine `lastConversation`-ID).

## Geänderte Dateien

- `src/pages/AITextStudio.tsx` (Resume-Logik + localStorage Hooks im send/load/new/delete)
- `src/components/text-studio/PinnedChatWindow.tsx` (Resume aus localStorage, falls nichts gepinnt)
