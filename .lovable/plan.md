

# Diagnose: Warum Szenen immer noch schwarz sind

## Das eigentliche Problem

Alle bisherigen Fixes (r47-r49) haben an der **Normalisierung** gearbeitet — also daran, Bilder korrekt herunterzuladen und neu hochzuladen. Aber das Problem liegt tiefer:

1. **Das S3-Bundle (r42) hat KEIN `SafeImg` mit `delayRender`**. Die aktuelle Code-Version im Repository enthält `SafeImg` mit 15s-Timeout und Gradient-Fallback — aber das r42-Bundle auf S3 nutzt eine ältere Version OHNE diese Absicherung. Im r42-Bundle wird ein einfaches `<Img>` verwendet, das bei Ladefehler **still schwarz** bleibt.

2. **`background.gradientColors` wird ignoriert** wenn `background.type === 'image'`. Die Remotion-Template-Logik (Zeile 1758) prüft `background.type === 'gradient'` bevor sie Gradient-Farben nutzt. Wenn `type === 'image'` gesetzt ist und das Bild nicht lädt, greift KEIN Fallback.

3. **Die Edge Function wurde erfolgreich deployed** (gerade erneut verifiziert), aber das ändert nichts, weil der Lambda-Renderer den S3-Bundle-Code ausführt, nicht den Edge-Function-Code.

## Einzige Lösung ohne S3-Bundle-Update

Da wir das S3-Bundle nicht aus dieser Umgebung aktualisieren können, müssen wir die **Bildverwendung auf Edge-Function-Ebene absichern**:

### Strategie: "Pre-Render Image Validation"

Statt dem Lambda zu vertrauen, dass es Bilder laden kann, **prüfen wir jedes Bild doppelt** und setzen `background.type = 'gradient'` falls auch nur der geringste Zweifel besteht:

1. **Strikte Bildvalidierung nach Normalisierung**: Nach dem Re-Upload UND der Verify-GET-Prüfung wird eine ZWEITE Validierung durchgeführt: Ein vollständiger GET-Request (nicht nur HEAD), der den Response-Body liest und prüft ob:
   - Content-Length > 5000 Bytes
   - Content-Type header mit der tatsächlichen Datei übereinstimmt
   - Response in < 2s vollständig ankommt

2. **Gradient bei JEDEM Fehler**: Wenn irgendein Schritt fehlschlägt, wird `background.type` auf `'gradient'` gesetzt — NICHT `'image'` mit einer fragwürdigen URL. Das ist der entscheidende Unterschied zu den bisherigen Fixes, die weiterhin `type: 'image'` setzten.

3. **Timing-basierter Gradient-Guard**: Für jede Szene wird die Download-Zeit gemessen. Wenn der Download des normalisierten Bildes > 3s dauert, wird auf Gradient umgestellt — weil Lambda-Chromium unter Last noch langsamer laden wird.

4. **Scene-spezifische Gradient-Farben**: Statt einheitlicher Brand-Farben bekommt jede Szene eine eigene Gradient-Kombination basierend auf `sceneType` (Hook=Amber, Problem=Red, Solution=Green, etc.).

### Änderungen

**`supabase/functions/auto-generate-universal-video/index.ts`**:
- Nach Normalisierungs-Loop: Zweite Validierungsrunde für JEDE Szene mit `background.type === 'image'`
- Messung der Download-Zeit, Schwellenwert 3s
- Content-Length-Check (>5000 bytes)
- Bei Fehler: `background.type = 'gradient'` erzwingen (statt imageUrl beizubehalten)
- Scene-Type-basierte Gradient-Farbpaletten
- Build-Tag: `r50-strict-validate-2026-03-09`

```text
Validierungs-Flow pro Szene (NEU nach Normalisierung):
  1. Ist background.type === 'image'? 
     JA → Weiter zu Schritt 2
     NEIN → Überspringe (Gradient ist bereits gesetzt)
  2. Full GET-Request auf imageUrl (2s Timeout)
  3. Prüfe: status===200 AND body.length > 5000 AND content-type match
  4. Prüfe: Download-Zeit < 3000ms
  5. Alle Prüfungen bestanden → Behalte type='image'
  6. Irgendein Fehler → Setze type='gradient' + sceneType-Farben
```

