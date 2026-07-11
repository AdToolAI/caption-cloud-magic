# Warum schlägt die Briefing-Analyse überhaupt fehl?

## Ehrliche Diagnose

Der `briefing-deep-parse`-Call ist ein **~25-35s laufender LLM-Request** (Gemini 2.5 Pro über Lovable AI Gateway). In dieser Zeit können 4 Dinge schiefgehen — und jedes davon triggert aktuell den roten Fallback-Toast:

1. **Netzwerk-Blip beim Client** (WLAN wechselt Kanal, VPN reconnect, Browser-Extension) → reiner `TypeError: Failed to fetch`
2. **Gateway-Timeout** (Gemini Pro > 30s bei komplexen Briefings) → 504
3. **Rate-Limit** bei Gateway (429) — selten, aber möglich
4. **Model-Error** (5xx vom Provider)

**Kernproblem:** Wir haben nur eine Chance. Wenn diese eine Anfrage failt, sehen wir den Fallback — obwohl der Server 2s später vielleicht antwortet.

Und: Der User sieht IMMER einen roten Toast, auch wenn der Fallback-Plan qualitativ okay ist. Das fühlt sich nach "Fehler" an, obwohl technisch alles im Rahmen läuft.

## Kann das komplett vermieden werden?

**Ehrlich: Nein, zu 100% nicht.** Ein LLM-Call übers Netz kann immer failen. Aber wir können die **Wahrnehmung von Fehlern auf ~0 drücken**, indem wir:

- Fehler **unsichtbar** wegretryen (statt roter Toast)
- **Schneller** antworten (weniger Timeout-Risiko)
- **Server-seitig** absichern (statt nur Client-Retry)

## Plan: Zero-Visible-Failure Strategie (v238)

### 1. Server-seitiger Retry in `briefing-deep-parse`
Aktuell retryt nur der Client. Besser: Die Edge Function selbst versucht Gemini bis zu **3x intern** (2.5 Pro → 2.5 Pro → 2.5 Flash als Fallback-Model) bevor sie überhaupt antwortet. Der Client sieht nur ein Ergebnis.

**Wirkung:** Eliminiert ~80% der Gateway/Model-Fehler, ohne dass der User es merkt.

### 2. Optimistic UI statt roter Toast
Wenn der Client-Retry doch nötig ist:
- **Kein roter Toast mehr** beim ersten Fehlversuch
- Stattdessen: dezenter Hinweis "Analyse läuft noch…" im War-Room
- Roter Toast **nur**, wenn alle Retries endgültig scheitern

### 3. Parallel-Fire Strategie
Bei jedem Analyse-Start feuern wir **zwei Requests parallel** ab (mit 500ms Versatz). Wer zuerst antwortet, gewinnt — der zweite wird verworfen.
**Kosten:** ~1.5x Gateway-Cost bei Analyse (klein, weil einmalig pro Briefing).
**Wirkung:** Netzwerk-Blips einer einzelnen Verbindung werden komplett neutralisiert.

### 4. Prewarm der Edge Function
Cold-Starts kosten 3-5s. Wir triggern die Function 1x beim Öffnen des Briefing-Tabs mit einem `?warmup=1` Ping — ohne echten LLM-Call. Wenn der User dann auf "Analysieren" klickt, ist die Function heiß.

### 5. Ehrliches Fallback-Signaling
Wenn wirklich alles scheitert und der lokale Fallback-Plan greift:
- **Grüner Toast**, nicht rot: "Plan erstellt — du kannst ihn wie gewohnt anpassen."
- Kleiner Info-Badge im Plan: "Basis-Plan (KI-Analyse übersprungen)"
- Kein Panik-Signal, weil der Fallback funktioniert.

## Technische Details

**Dateien:**
- `supabase/functions/briefing-deep-parse/index.ts` — interne 3x-Retry-Schleife mit Model-Downgrade auf Attempt 3
- `supabase/functions/briefing-deep-parse/index.ts` — Warmup-Handler für `?warmup=1`
- `src/hooks/useStoryboardTransition.ts` — Parallel-Fire (2 Requests, 500ms Versatz), Toast-Farben angleichen
- `src/pages/…/BriefingTab.tsx` (oder Container) — Warmup-Ping beim Mount

**Nicht angefasst:**
- Slider-Logik (v236 bleibt)
- Ensemble/Cast-Logik (v221+ bleibt)
- Pipeline-Version bleibt 237, wird auf 238 gehoben nach Umsetzung

## Was das NICHT löst

- Wenn der User komplett offline ist, geht nichts. Aber dann ist auch der Fallback-Toast berechtigt.
- Wenn Gemini global ausfällt (sehr selten): der Fallback-Plan greift wie bisher — nur eben freundlich signalisiert.

## Frage vor Umsetzung

Willst du **alle 5 Punkte** in einem Rutsch, oder ist dir Punkt **3 (Parallel-Fire)** zu teuer? Punkt 3 verdoppelt die Analyse-Kosten pro Briefing (aber nur da, nicht in der Render-Pipeline). Ich empfehle: alle 5, weil der Effekt spürbar ist und die Analyse-Kosten pro Briefing im Cent-Bereich liegen.
