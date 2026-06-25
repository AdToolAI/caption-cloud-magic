## Problem

Im Production Plan steht "3 Szenen", aber im UI sind nur 2 sichtbar. Ursache: doppelte `scene.index`-Werte aus Pass A (Gemini kann z. B. 1, 2, 2 oder 0, 1, 2 zurückgeben → nach `Math.max(1, ...)` werden 0 und 1 beide zu 1). Im UI wird die Liste mit `key={s.index}` gerendert — React dedupliziert daher die Kollision und zeigt nur die letzte Szene mit gleichem Key. Die Szene existiert weiterhin im Datenmodell, ist aber unsichtbar.

## Fix (minimal, nur UI/Parser-Normalisierung — keine Pipeline-Änderung)

### 1. `supabase/functions/briefing-deep-parse/index.ts`
- Nach `mergeManifestAndResolution`: Szenen nach ursprünglicher Reihenfolge stabil sortieren und sequentiell neu indizieren (`index = i + 1`), damit nie Duplikate persistiert werden.
- Gleiche Re-Index-Logik im Safety-Arc-Fallback (Zeile ~699) anwenden (dort ist es bereits ok, nur konsistent halten).

### 2. `src/components/video-composer/briefing/ProductionPlanSheet.tsx`
- React-Key auf stabilen Kompositschlüssel umstellen: `key={\`${s.index}-${i}\`}` (Map-Iteration mit Position), damit Kollisionen niemals mehr eine Szene verschlucken — Defense-in-Depth gegenüber Altplänen in der DB.
- Header-Badge ergänzen: `S{i+1}` (Anzeigeposition) zusätzlich zu `s.index`, falls Werte voneinander abweichen.
- Optionaler Live-Selfheal beim Laden: wenn doppelte `index`-Werte erkannt werden → einmalig client-seitig re-indizieren und in `onUpdateScenes`/State spiegeln (verhindert Wiederholung bei bereits gespeicherten Plänen).

### 3. Keine Änderungen an
- `compose-dialog-segments`, `compose-video-clips`, Lip-Sync-Pipeline, CastRef, Anchor — alle bleiben unangetastet.

## Resultat
"3 Szenen" zeigt verlässlich 3 Karten an, auch bei Altplänen mit kollidierenden Indizes. Reihenfolge bleibt erhalten, Lip-Sync-geschützte Szenen weiterhin nie überschrieben.