

## Plan: Dritter Durchlauf + minimale Schwelle für vollständige Entfernung

### Analyse der Logs

Die Zwei-Pass-Verarbeitung funktioniert, aber nicht vollständig:
- **Pass 1**: 550 Frames mit Text erkannt, 600 Regionen entfernt ✓
- **Pass 2**: 50 Frames mit Text erkannt, 56 Regionen entfernt ✓
- **Problem**: Pass 2 findet noch 50 Frames mit Text — das sind die sichtbaren Reste

Da Pass 2 bei `conf_threshold: 0.03` immer noch 56 Regionen findet, lohnt sich ein **dritter Durchlauf** mit noch niedrigerer Schwelle. Außerdem wechseln wir in Pass 3 die Methode auf `"fast"`, die einen anderen Erkennungsalgorithmus nutzt und dadurch andere Textmuster findet.

### Änderungen

**1. Webhook: Drei-Pass-Logik**

`supabase/functions/director-cut-burned-subtitles-webhook/index.ts`:
- Pass 1 fertig → Pass 2 starten (wie bisher)
- Pass 2 fertig → **Pass 3** starten mit `conf_threshold: 0.01`, `method: "fast"`, `iou_threshold: 0.2`
- Pass 3 fertig → Ergebnis als final speichern

**2. Edge Function: Statusmeldung anpassen**

`supabase/functions/director-cut-remove-burned-subtitles/index.ts`:
- Meldung auf "3 Durchläufe" ändern

**3. Frontend: Pass-Anzeige aktualisieren**

`src/components/directors-cut/studio/CapCutSidebar.tsx`:
- Status "Durchlauf 1/3...", "Durchlauf 2/3...", "Durchlauf 3/3..." anzeigen

### Technischer Ablauf

```text
Pass 1: video → conf: 0.05, margin: 20, method: hybrid
         ↓
Pass 2: cleaned → conf: 0.03, margin: 20, method: hybrid
         ↓
Pass 3: cleaned → conf: 0.01, margin: 20, method: fast
         ↓
Final → Storage → User sieht Video
```

### Betroffene Dateien

1. `supabase/functions/director-cut-burned-subtitles-webhook/index.ts` — Pass 3 hinzufügen
2. `supabase/functions/director-cut-remove-burned-subtitles/index.ts` — Meldung anpassen
3. `src/components/directors-cut/studio/CapCutSidebar.tsx` — 3-Pass-Status

