

## Plan: Interview-Logik reparieren — Quick-Reply-Offset und Prompt-Fokussierung

### Problem 1: Quick Replies sind um eine Phase verschoben
In Zeile 2306 wird `generateQuickReplies(currentPhase - 1, ...)` aufgerufen. Wenn der Interviewer bei Phase 19 (MUSIK) ist, zeigt er die Quick Replies von Phase 18 (VOICE-OVER: "Männliche Stimme, professionell" etc.). Die Antwortmöglichkeiten passen nicht zur Frage.

### Problem 2: System-Prompt enthält alle 12 alten Kategorien
Der System-Prompt listet ALLE 22 Phasen inklusive der Phasen für `tutorial`, `corporate`, `social-content`, `testimonial`, `explainer`, `event`, `promo`, `presentation` auf — obwohl nur `product-video` relevant ist. Dieses Prompt-Bloating verwirrt die KI und führt zu inkohärenten Antworten.

### Änderungen

**1. `supabase/functions/universal-video-consultant/index.ts`**

- **Quick-Reply-Offset fixen** (Zeile 2306):
  - Von `generateQuickReplies(Math.max(1, currentPhase - 1), ...)` 
  - Zu `generateQuickReplies(currentPhase, ...)`
  - Damit passen Quick Replies zur aktuellen Phase

- **System-Prompt straffen**: Im `getCategorySystemPrompt` nur die relevante Kategorie und die aktuelle Block-Phase ausgeben, nicht alle 22 Phasen auf einmal. Stattdessen nur:
  - Den aktuellen Block (1, 2 oder 3)
  - Die aktuelle Phase + 2-3 Folgephasen
  - Keine Phasen die bereits abgearbeitet sind

**2. Edge Function deployen und testen**

### Ergebnis
- Quick Replies passen immer exakt zur aktuellen Frage
- KI bleibt fokussiert auf den relevanten Interviewabschnitt
- Keine Verwechslung zwischen Produkt-Fragen und Produktions-Fragen

