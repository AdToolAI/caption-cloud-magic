

## Fix: Aggressivere Parameter für Untertitel-Entfernung

### Was die Logs zeigen

Das Modell hat funktioniert — es hat in 444 von 960 Frames Text erkannt und 450 Regionen entfernt. Aber:
- **Confidence 0.25** ist zu hoch — stilisierte/halbtransparente Untertitel werden nicht erkannt
- **Margin 5px** ist zu klein — der Text wird nicht vollständig abgedeckt
- **720p Verarbeitung** bei einem 1080x1920 Video verliert Erkennungsgenauigkeit

### Änderungen

**1. Edge Function: Bessere Default-Parameter**

`supabase/functions/director-cut-remove-burned-subtitles/index.ts`:
- `conf_threshold`: `0.25` → `0.10` (erkennt mehr Text)
- `margin`: `5` → `15` (größerer Entfernungsbereich)
- `resolution`: auf `"original"` setzen (keine Downscale-Artefakte)
- Optional: Parameter aus dem Frontend entgegennehmen für Nachjustierung

**2. Sidebar: Erneut-Versuchen mit Einstellungen**

`src/components/directors-cut/studio/CapCutSidebar.tsx`:
- Wenn das Ergebnis nicht passt, Button "Erneut versuchen (empfindlicher)" hinzufügen
- Sendet `conf_threshold: 0.05` und `margin: 20` für hartnäckige Fälle

**3. Editor: Parameter durchreichen**

`src/components/directors-cut/studio/CapCutEditor.tsx`:
- `handleRemoveBurnedSubtitles` akzeptiert optionale Settings
- Leitet sie an die Edge Function weiter

### Betroffene Dateien

1. `supabase/functions/director-cut-remove-burned-subtitles/index.ts` — Parameter-Update
2. `src/components/directors-cut/studio/CapCutSidebar.tsx` — Retry-Button
3. `src/components/directors-cut/studio/CapCutEditor.tsx` — Parameter weiterleiten

