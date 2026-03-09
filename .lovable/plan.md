

# Diagnose: Schwarze Szenen — Deployment-Problem identifiziert

## Forensische Befunde

Ich habe die letzten 5 Renders in der Datenbank analysiert:

```text
Alle Renders heute:
  bundle_probe: "canary=2026-03-07-r42-errorIsolation" ← STALE (2 Tage alt)
  r47_assetNormalize: NULL für JEDEN Render ← Code läuft NICHT
  AUTO_GEN_BUILD_TAG in content_config: NULL ← Edge Function ist NICHT r47
  Edge Function Logs: LEER ← Keine Logs abrufbar
```

## Ursache

**Die Edge Function wurde nie mit dem r45/r46/r47-Code deployed.** Alle Normalisierungs-Fixes existieren nur im Repository. Die deployed Version ist eine ältere Fassung OHNE Asset-Normalisierung. Deshalb:

- Szene 1 + 4: Bilder-URLs sind Replicate-Temp-URLs oder haben DNS-Varianz → Lambda kann sie nicht laden → Schwarz
- Szene 2, 3, 5: Zufällig zugänglich → funktioniert

Das Remotion S3-Bundle ist ebenfalls `r42` — alle Template-Fixes (SafeImg mit delayRender, 15s Timeout) sind inaktiv. Dieses Bundle kann nur extern aktualisiert werden.

## Plan: r48 — Deployment-Fix + Verifizierbare Normalisierung

### A. Edge Function explizit deployen
Die `auto-generate-universal-video` Function muss neu deployed werden, damit der r47-Normalisierungscode aktiv wird.

### B. Build-Tag in finaler result_data persistieren
**Problem**: `updateProgress()` überschreibt `result_data` bei jedem Aufruf. Die Normalisierungsdaten gehen verloren, weil spätere Steps (Voiceover, Render, Completed) sie überschreiben.

**Fix**: Bei JEDEM `updateProgress`-Aufruf die existierenden `result_data` mergen statt zu überschreiben. Zusätzlich `AUTO_GEN_BUILD_TAG` in die finale `result_data` schreiben, damit die Deployment-Version verifizierbar ist.

```text
updateProgress (neu):
  1. Bestehende result_data aus DB lesen (SELECT)
  2. Neue data mit bestehender mergen
  3. UPDATE mit gemerger result_data
```

### C. Gradient-Fallback als Sicherheitsnetz im Payload
Für JEDE Szene im `inputProps`, unabhängig von der Normalisierung:
- `background.gradientColors` IMMER setzen (Markenfarben oder Scene-Palette)
- Falls `background.type = 'image'` und Normalisierung fehlschlägt → `type` auf `'gradient'` ändern

So ist garantiert: Selbst wenn die Normalisierung fehlschlägt UND das r42-Bundle das Bild nicht laden kann, erscheint ein Farbverlauf statt Schwarz.

### D. Robustere Normalisierung
- AbortController durch einfaches Timeout-Promise ersetzen (Deno-Kompatibilität)
- Bei Normalisierungs-Fehler `background.type = 'gradient'` erzwingen (statt imageUrl auf undefined)

## Dateien
1. `supabase/functions/auto-generate-universal-video/index.ts` — updateProgress-Merge, Build-Tag-Persistierung, Gradient-Sicherheitsnetz, Build-Tag `r48`

## Erwartetes Ergebnis
```text
Nach Deploy:
  result_data.buildTag = "r48-deploy-verify-2026-03-09" ← Deployment verifiziert
  result_data.r47_assetNormalize = { normalized: 5, ... } ← Normalisierung läuft
  Szenen ohne Bild → Gradient (nicht schwarz) ← Sicherheitsnetz
```

