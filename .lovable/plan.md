## Problem

Der "Anheften"-Button im AI Text Studio ist **disabled** (graues `pointer-events: none`), obwohl bereits Nachrichten ausgetauscht wurden. Ursache: Der Button ist an `conversationId` gebunden, aber `conversationId` bleibt im Frontend immer `null`.

## Root Cause

Die Edge Function `text-studio-chat` gibt die neue Conversation-ID per Response-Header `X-Conversation-Id` zurück:

```ts
"X-Conversation-Id": conversationId!
```

Das Frontend liest sie via `resp.headers.get("X-Conversation-Id")`. **Aber:** Bei CORS-Streaming-Responses sind benutzerdefinierte Header standardmäßig **nicht** für den Browser sichtbar. Es fehlt:

```
Access-Control-Expose-Headers: X-Conversation-Id
```

Folge: `resp.headers.get("X-Conversation-Id")` liefert `null` → `setConversationId(...)` wird nie aufgerufen → Button bleibt für immer disabled.

## Fix

**1. `supabase/functions/text-studio-chat/index.ts`** — `corsHeaders` ergänzen:

```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Conversation-Id",
};
```

**2. `src/pages/AITextStudio.tsx`** — Button-Disabling lockern als zusätzliche Absicherung: statt `disabled={!conversationId}` auf `disabled={!conversationId && messages.length === 0}` umstellen und im `onClick` notfalls `conversationId` aus dem aktuellen Stream/letzter History-Conv rekonstruieren. Hauptsächlich aber Punkt 1 (das ist der echte Bug).

**3. Sanity-Check:** Console-Log nach erstem Send entfernen / Toast wenn Header weiterhin fehlt, damit künftig sichtbar.

## Out of scope

Keine DB-Migration, keine UI-Refactors. Reine 2-Zeilen-Korrektur.