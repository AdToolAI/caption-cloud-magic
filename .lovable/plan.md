

## Plan: Doppelter Durchlauf für vollständige Untertitel-Entfernung

### Analyse

Die Logs zeigen: Das Modell hat mit `conf_threshold: 0.05` und `margin: 20` in 550 von 960 Frames Text erkannt und 600 Regionen entfernt. Das ist deutlich besser als vorher (444 Frames, 450 Regionen), aber einige Reste bleiben. Die Parameter sind bereits am Maximum:
- `margin: 20` ist das dokumentierte Limit
- `conf_threshold: 0.05` ist schon sehr niedrig

### Lösung: Zwei-Pass-Verarbeitung

Ein einzelner Durchlauf reicht nicht für 100% Entfernung. Professionelle Tools machen oft einen zweiten Durchlauf auf dem bereits bereinigten Video, um Reste zu finden. Zusätzlich nutzen wir `iou_threshold: 0.3` (statt 0.45), damit mehr überlappende Erkennungen beibehalten werden.

### Technischer Ablauf

```text
Pass 1: video_url → Replicate (conf: 0.05, margin: 20)
         ↓ Webhook
Pass 2: cleaned_url → Replicate (conf: 0.03, margin: 20)
         ↓ Webhook
Ergebnis → Storage → User sieht bereinigtes Video
```

### Änderungen

**1. Webhook erweitern: Automatischer zweiter Durchlauf**

`supabase/functions/director-cut-burned-subtitles-webhook/index.ts`:
- Neues Feld `burned_subtitles_pass` in der DB prüfen (default: 1)
- Wenn Pass 1 fertig → automatisch Pass 2 starten mit dem bereinigten Video
- Wenn Pass 2 fertig → Ergebnis als final speichern
- Pass 2 nutzt noch aggressivere Einstellungen (`conf_threshold: 0.03`)

**2. Edge Function: Pass-Nummer mitgeben**

`supabase/functions/director-cut-remove-burned-subtitles/index.ts`:
- `pass: 1` als Metadata im Webhook-Request mitgeben (über die DB)

**3. Migration: Pass-Tracking-Spalte**

- `burned_subtitles_pass` (integer, default 1) in `director_cut_projects`

**4. Frontend: Statusmeldung anpassen**

`src/components/directors-cut/studio/CapCutSidebar.tsx`:
- Status "Durchlauf 1/2..." und "Durchlauf 2/2..." anzeigen

### Betroffene Dateien

1. `supabase/functions/director-cut-burned-subtitles-webhook/index.ts` — zweiten Pass auslösen
2. `supabase/functions/director-cut-remove-burned-subtitles/index.ts` — Pass-Info speichern
3. Migration — `burned_subtitles_pass` Spalte
4. `src/components/directors-cut/studio/CapCutSidebar.tsx` — Pass-Status anzeigen

