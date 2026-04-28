## Ziel

Sora 2 Standard und Sora 2 Pro im Per-Szene Modell-Dropdown des Video Composers verfügbar machen — als gleichwertige Provider neben Hailuo, Kling, Veo, Wan, Luma und Seedance. Die Modelle laufen über Replicate (`openai/sora-2` und `openai/sora-2-pro`), sind in der EU/DE rechtlich nutzbar und werden bereits im Sora Long-Form-Studio produktiv eingesetzt.

## Hintergrund

Beim vorherigen Refactor wurde Sora 2 bewusst **ausgeschlossen**, weil:
1. `compose-video-clips` Sora bisher nicht implementiert hatte (siehe `SUPPORTED_AI_SOURCES`-Set, Zeile 250) und unsupported Engines stillschweigend auf Hailuo zurückgemappt hat.
2. Sora 2 hinter einem Grandfathering-Flag (`sora2_grandfathered`) hängt — neue User sehen es nicht.

Beides lässt sich sauber lösen, ohne den restlichen Composer-Flow zu brechen.

## Umsetzung

### 1. Backend: Sora-Rendering in `compose-video-clips`
- `SUPPORTED_AI_SOURCES`-Set um `ai-sora` erweitern (Fallback auf Hailuo entfällt).
- Neuen Render-Branch hinzufügen, analog zu Hailuo/Kling: Replicate-Aufruf mit Modell-ID basierend auf `clipQuality`:
  - `standard` → `openai/sora-2`
  - `pro` → `openai/sora-2-pro`
- Sora-Duration-Constraints respektieren: nur **4 s, 8 s, 12 s** sind erlaubt → Szenendauer auf nächsten erlaubten Wert clampen (analog zu Hailuo 6/10s-Logik).
- Aspect-Ratio mappen (`landscape` → `1280×720`, `portrait` → `720×1280`).
- Credits-Berechnung: `costPerSecond` aus bestehender `SORA_VIDEO_MODELS`-Konfig übernehmen (0.25 €/s standard, 0.53 €/s pro), inkl. **Auto-Refund bei Failure** (gleiches Pattern wie `sora-scene-webhook`).

### 2. Frontend: Sora im Composer-Dropdown
- `src/lib/video-composer/modelMapping.ts`: `COMPOSER_FAMILIES`-Set um `'sora'` erweitern → die zwei bestehenden Toolkit-Einträge (`sora-2-standard`, `sora-2-pro`) erscheinen automatisch im Dropdown.
- `sourceToModelId()` und `modelIdToSource()` decken `ai-sora` bereits ab — keine Änderung nötig.

### 3. Access-Gating beibehalten
- Der `ModelSelector` zeigt Sora-Einträge bereits mit Lock-Icon für nicht-grandfathered User (`requiresAccess: 'sora2'` + `useSora2Access` Hook).
- Keine Änderung am Gating-Verhalten — neue User sehen Sora 2 als "🔒 Demnächst", grandfathered User können es direkt wählen.

### 4. Style-Kompatibilität
- `MODEL_STYLE_COMPATIBILITY` in `src/config/modelStyleCompatibility.ts` enthält Sora bereits (alle Styles als optimal/good) — keine Änderung nötig.

### 5. Validierung im SceneCard
- Wenn Sora gewählt ist und die Szenendauer kein erlaubter Wert (4/8/12 s) ist: dezenter Hinweis im UI ("Sora rundet auf 8 s") statt harter Block.

## Geänderte Dateien

- `supabase/functions/compose-video-clips/index.ts` — Sora-Render-Branch + Refund
- `src/lib/video-composer/modelMapping.ts` — `'sora'` zur `COMPOSER_FAMILIES` hinzufügen
- `src/components/video-composer/SceneCard.tsx` — optionaler Duration-Hinweis für Sora

## Out of Scope

- Keine Änderungen am Sora Long-Form-Studio.
- Kein Aufheben des Grandfathering-Gates — neue User sehen Sora weiterhin als gesperrt.
