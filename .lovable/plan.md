# Zwei Bugs im AI Text Studio fixen

## Bug 1 — GPT-5.5 Pro Provider-Fehler (404)
Provider sagt: *„This is not a chat model and thus not supported in the v1/chat/completions endpoint"*. Der Identifier `openai/gpt-5.5-pro` existiert in der Lovable-AI-Gateway-Doku nicht als Chat-Modell — verfügbar sind `openai/gpt-5.5` und `openai/gpt-5.5-pro` als Reasoning-Variante (nur über andere Endpoint).

**Fix in `src/lib/text-studio/models.ts`:**
- `apiModel` von `openai/gpt-5.5-pro` → `openai/gpt-5.5`
- Label „GPT-5.5 Pro" → „GPT-5.5"
- (Pricing bleibt — wir können später auf `gpt-5.5-pro` zurück, falls Lovable das als Chat-Modell exposed.)

## Bug 2 — Branch wird nicht erstellt, Chat bleibt im selben Verlauf
Aktuelle Bedingung: `if (messages.length === 0 || !conversationId) { setModel(next); return; }`
→ Beim ersten Modellwechsel **nach einer Antwort** kann `conversationId` durchaus gesetzt sein, aber wenn der User direkt nach dem allerersten Reload das Modell wechselt, ist `conversationId` `null` und der Branch-Dialog erscheint nicht — stattdessen wird einfach das Modell gewechselt und derselbe Verlauf gegen den neuen Provider geschickt.

**Fix in `src/pages/AITextStudio.tsx`:**

1. **`handleModelChange` lockern**: Auch wenn nur `messages.length > 0` (ohne `conversationId`), Branch-Dialog zeigen. Falls noch keine `conversationId` existiert (Verlauf wurde z.B. aus History geladen aber nicht persistiert), legen wir die Wurzel-Konversation **on-the-fly** an, bevor wir den Branch erzeugen.

2. **Branch-Erstellung garantiert frische conversationId**: `createBranch` insertet zuerst die Wurzel-Conv falls nötig, dann den Branch mit `parent_conversation_id = root.id`.

3. **`loadConversation` setzt das Modell automatisch** auf das Modell der geladenen Konversation, damit Branch-Wechsel sichtbar ist.

4. **Branch-Switcher always-on**: Auch bei nur 1 Branch (Wurzel allein) zeigen wir die Leiste mit „+ Branch erstellen", damit der User sieht, dass das Feature existiert.

5. **Aktualisierung der History sofort nach Branch-Insert** (state-update statt useEffect-Refetch warten).

## Out of scope
- Pricing/UI-Wording bleibt unverändert.
- Keine DB-Migration nötig.
