

## Analyse: Warum immer noch "120s" erscheint

Aus deinem Screenshot und den Console-Logs ist klar:
1. **Die Fehlermeldung "120s" ist ein hardcodierter Text** in `remotion-webhook/index.ts` (Zeile 211) — auch wenn die neue 240s-Lambda läuft, zeigt die Meldung immer noch "120s"
2. **Fallback-Funktionsname in `invoke-remotion-render/index.ts`** (Zeile 21) ist immer noch `120sec` — falls das Secret nicht korrekt gelesen wird, wird die ALTE Lambda aufgerufen
3. **Drei weitere Edge Functions** (`render-with-remotion`, `render-universal-video`, `render-directors-cut`) haben ebenfalls den alten `120sec`-Fallback

**Aber das Hauptproblem ist wahrscheinlich:** Das Secret `REMOTION_LAMBDA_FUNCTION_ARN` enthält möglicherweise den vollständigen ARN (z.B. `arn:aws:lambda:eu-central-1:123456:function:remotion-render-...`) und die `getLambdaFunctionName()` Extraktion funktioniert korrekt. Trotzdem schlägt der Render mit Timeout fehl. Das bedeutet entweder:
- (a) Die alte Lambda wird noch aufgerufen (Fallback greift), ODER
- (b) Die neue Lambda läuft, aber die Komposition ist so komplex, dass auch 240s nicht reichen

Da die Fehlermeldung exakt "120s" sagt, ist **(a)** am wahrscheinlichsten — der Fallback `120sec` in `invoke-remotion-render` wird verwendet.

---

## Plan: r29b — Alle Fallbacks + Fehlermeldungen auf 240s aktualisieren

### Datei 1: `supabase/functions/invoke-remotion-render/index.ts`
- Zeile 21: Fallback von `120sec` → `240sec` ändern (`remotion-render-4-0-424-mem3008mb-disk2048mb-240sec`)

### Datei 2: `supabase/functions/remotion-webhook/index.ts`
- Zeile 211: Fehlermeldung von "120s" → "240s" korrigieren

### Datei 3: `supabase/functions/render-with-remotion/index.ts`
- Zeile 16: Fallback auf `240sec` aktualisieren

### Datei 4: `supabase/functions/render-universal-video/index.ts`
- Zeile 15: Fallback auf `240sec` aktualisieren

### Datei 5: `supabase/functions/render-directors-cut/index.ts`
- Zeile 16: Fallback auf `240sec` aktualisieren

### Zusätzlich: Debug-Logging
- In `invoke-remotion-render/index.ts` einen Log hinzufügen, der den **tatsächlich verwendeten Funktionsnamen** ausgibt, damit wir beim nächsten Lauf in den Logs sehen ob die neue Lambda aufgerufen wird

### Erwartetes Ergebnis
Alle 5 Edge Functions verwenden konsistent die neue `240sec`-Lambda als Fallback. Die Fehlermeldung zeigt korrekte Zeitangaben. Der Debug-Log bestätigt welche Lambda tatsächlich aufgerufen wird.

