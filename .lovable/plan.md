

## Fix: Wan Video — Modell auf Wan 2.5 upgraden

### Problem
Das aktuelle Modell `wavespeedai/wan-2.1-t2v-720p` hat **keinen `duration`-Parameter**. Es produziert immer ~5s Videos, egal welche Dauer eingestellt wird. Der Parameter wird stillschweigend ignoriert.

### Lösung
Upgrade auf die offiziellen **Wan 2.5** Modelle (`wan-video/wan-2.5-t2v` und `wan-video/wan-2.5-i2v`), die einen echten `duration`-Parameter mit Werten **5 oder 10 Sekunden** unterstützen.

### Wichtige API-Unterschiede

| Parameter | WaveSpeed (alt) | Wan 2.5 (neu) |
|-----------|----------------|---------------|
| Duration | nicht vorhanden | `duration`: 5 oder 10 |
| Aspect Ratio | `aspect_ratio`: "16:9" | T2V: `size`: "1280*720" / I2V: `resolution`: "720p" |
| Max Duration | - | 10 Sekunden |

### Änderungen

**1. `src/config/wanVideoCredits.ts`**
- `maxDuration` von 12 auf **10** ändern
- Duration-Schritte auf 5 und 10 beschränken (Slider durch Toggle/Select ersetzen)
- Beschreibung aktualisieren ("Wan 2.5")

**2. `supabase/functions/generate-wan-video/index.ts`**
- Modelle auf `wan-video/wan-2.5-t2v` (T2V) und `wan-video/wan-2.5-i2v` (I2V) ändern
- `aspect_ratio` → `size` Mapping für T2V (z.B. "16:9" → "1280*720")
- `aspect_ratio` → `resolution` für I2V (z.B. "720p")
- Duration auf 5 oder 10 cappen (nächster gültiger Wert)

**3. `src/pages/WanVideoStudio.tsx`**
- Duration-Slider durch Auswahl von 5s oder 10s ersetzen
- Labels und Beschreibungen auf "Wan 2.5" aktualisieren

**4. `src/components/ai-video/VideoGenerationHistory.tsx`**
- Model-Display-Names um Wan 2.5 ergänzen

### Dateien
- **Edit**: `src/config/wanVideoCredits.ts`, `supabase/functions/generate-wan-video/index.ts`, `src/pages/WanVideoStudio.tsx`, `src/components/ai-video/VideoGenerationHistory.tsx`

