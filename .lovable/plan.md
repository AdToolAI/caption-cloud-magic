

## Problem: Quick Replies sind um 1 Phase verschoben

### Root Cause

In `calculatePhaseInfo()` (Zeile 416):
```
const currentPhase = Math.min(userMessages + 1, 22);
```

Wenn der User seine 11. Nachricht sendet (Antwort auf Phase 10 "Emotionen"), wird `currentPhase = 12` berechnet. Die AI bekommt `currentPhase = 12` im Prompt und antwortet korrekt mit der Phase-11-Frage (Referenz-Videos). **Aber** die Quick Replies werden mit `generateQuickReplies(12)` geholt — das sind die Farb-Optionen von Phase 12.

Die AI fragt Phase 11 → Quick Replies zeigen Phase 12 Antworten. Immer um 1 verschoben.

### Fix

**Datei:** `supabase/functions/universal-video-consultant/index.ts`

Die Quick Replies müssen auf die Phase gemappt werden, die die AI **gerade fragt**, nicht auf die nächste. Zwei Optionen:

**Option A (sauberer):** Die `currentPhase` aus der AI-Response parsen (die AI gibt `currentPhase` im JSON zurück) und diese für Quick Replies verwenden.

**Option B (einfacher, zuverlässiger):** Die Quick Replies mit `currentPhase` generieren, aber die Phase-Map um 1 anpassen — d.h. wenn `currentPhase = 12`, zeige die Replies für die Frage die bei Phase 12 gestellt wird.

Das eigentliche Problem ist subtiler: `currentPhase` wird VOR dem AI-Call berechnet und repräsentiert "welche Phase kommt als nächstes". Der System-Prompt sagt der AI "Du bist in Phase 12", aber die AI formuliert erst die Frage für Phase 11 (weil sie die vorherige Antwort bestätigt + die neue Frage stellt). 

**Konkreter Fix:** `generateQuickReplies` mit `currentPhase` aufrufen ist korrekt — aber der System-Prompt muss konsistent sein. Das Problem liegt darin, dass der System-Prompt `Phase ${currentPhase}` sagt (z.B. 12), die AI aber noch Phase 11 fragt.

**Lösung:** Quick Replies mit `currentPhase - 1` generieren, da die Antwort der AI immer die Frage der aktuellen Phase stellt (nicht der nächsten):

```typescript
// Zeile 774: currentPhase → currentPhase (bleibt, da der System-Prompt Phase X sagt und die AI Phase X fragt)
// ABER: Die AI bestätigt die vorherige Antwort und stellt dann die Frage für currentPhase
// Die Quick Replies müssen zur GESTELLTEN Frage passen = currentPhase
```

Eigentlich muss ich nochmal genauer schauen. Der System-Prompt sagt "Du bist in Phase 12" und die Phases-Liste definiert Phase 11 als "Referenz-Videos". Das heißt `currentPhase = 12` aber `cat.phases[currentPhase - 1]` = Phase 12 Eintrag.

**Der sauberste Fix:**
1. In Zeile 774: `generateQuickReplies(currentPhase, category)` → Die Phase-Map in `generateQuickReplies` ist korrekt indiziert (Phase 11 = Referenz-Replies, Phase 12 = Farb-Replies)
2. Das Problem ist dass `currentPhase` zu hoch ist. Fix: Berechne `currentPhase` als `userMessages` statt `userMessages + 1`, da die aktuelle Nachricht des Users bereits gezählt wird.

**Oder einfacher:** In Zeile 774 `currentPhase - 1` verwenden:
```typescript
const phaseBasedReplies = generateQuickReplies(Math.max(1, currentPhase - 1), category);
```

### Änderung

| Datei | Zeile | Änderung |
|---|---|---|
| `supabase/functions/universal-video-consultant/index.ts` | 774 | `generateQuickReplies(currentPhase, ...)` → `generateQuickReplies(Math.max(1, currentPhase - 1), ...)` |

Danach Edge Function deployen.

