

# Fix: Letzte schwarze Szene eliminieren

## Diagnose

Die Edge Function Logs zeigen **`early_drop`** (Timeout-Shutdown) — die Funktion wird nach 300s beendet, bevor alle Szenen-Fallbacks fertig sind. Die Fallback-Kette ist zu langsam: Replicate (5 Retries × ~15s) → Gemini Image (~20-30s) → SVG Upload. Szene 4 "Ihre Vorteile im Fokus" kommt nicht dran, weil die Zeit aufgebraucht ist.

## Fix: Time-Budget-Guard + schnellerer Fallback

### 1. Time-Budget pro Szene
Am Anfang der Funktion `startTime = Date.now()` setzen. Vor jedem Retry prüfen: wenn weniger als 60s verbleiben → sofort SVG-Fallback statt weitere Retries oder Gemini.

### 2. Gemini als Fallback entfernen
Gemini Image Generation ist zu langsam (~20-30s) und unzuverlässig im Edge Function Kontext. Der SVG-Fallback ist garantiert schnell (<1s) und produziert professionelle farbige Hintergründe. Fallback-Kette wird: Replicate (Retries) → SVG direkt.

### 3. Retry-Anzahl für Nicht-Prioritäts-Szenen reduzieren
Statt 3 Retries für normale Szenen → 2 Retries. Spart ~30s pro fehlgeschlagene Szene.

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`
- `generateSceneVisual`: Time-Budget-Check vor jedem Retry
- `generateAIFallbackImage` → direkt `generateSVGFallbackToStorage` aufrufen (Gemini-Schritt überspringen)
- SVG-Fallback als sofortige, verlässliche Lösung

**Risiko:** Null — SVG-Fallbacks sind visuell besser als schwarz, und die AI-Bilder von Replicate funktionieren ja für 4/5 Szenen.

