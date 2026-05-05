## Problem

Im angehefteten Floating-Chat öffnet der Button **„Im Studio öffnen"** zwar `/ai-text-studio`, aber die Seite startet mit leerem `conversationId` (initial `useState(null)`). Der angeheftete Chat wird also nicht geladen → Verlauf wirkt „gelöscht".

In `PinnedChatWindow.tsx` (Zeile 286):
```ts
onClick={() => navigate("/ai-text-studio")}
```
→ keine Conversation-ID übergeben.

In `AITextStudio.tsx` gibt es keinen Code, der einen angeheftete Chat oder URL-Parameter beim Mount übernimmt.

Daten sind nicht weg — sie liegen weiter in `text_studio_messages`. Es ist reine UI-Wiederaufnahme.

## Fix

**1. `PinnedChatWindow.tsx`** — Conversation-ID via URL-Parameter übergeben:
```ts
onClick={() => navigate(`/ai-text-studio?conversation=${pinned.conversationId}`)}
```

**2. `src/pages/AITextStudio.tsx`** — beim Mount Conversation aus URL **oder** aus `pinned` (Context) laden:
- `useSearchParams()` lesen → `conversation` Parameter
- Falls vorhanden: `loadConversation(id)` triggern (lädt Messages + setzt Model aus History)
- Fallback: wenn kein URL-Param aber `pinned?.conversationId` existiert → ebenfalls laden
- Damit das auch klappt, wenn `history` noch nicht geladen ist: `loadConversation` so anpassen, dass das Model notfalls direkt aus der DB (`text_studio_conversations` Single-Row-Query) geholt wird, statt nur aus dem `history`-State
- Nach dem Laden den `?conversation=` Param aus der URL entfernen (`setSearchParams({}, { replace: true })`), damit Reload nicht in einer Schleife landet

**3. Sanity:** Der bestehende „Loslösen"-Button soll weiter funktionieren — keine Änderung nötig, nur sicherstellen, dass beim Eintritt ins Studio `pinned` **nicht** automatisch ge-unpinnt wird (ist aktuell auch nicht der Fall).

## Out of scope

- Keine DB-Änderungen
- Keine neuen Komponenten
- Keine Änderung an `PinnedChatContext`

## Files

- `src/components/text-studio/PinnedChatWindow.tsx` (1 Zeile)
- `src/pages/AITextStudio.tsx` (~15 Zeilen: useSearchParams + Mount-Effect + kleine Anpassung in `loadConversation`)
