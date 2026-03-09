

# Fix: Schwarze Szenen — Normalisierungs-Loop + Bundle-Unabhängigkeit

## Diagnose (aus Logs)

- `[asset-normalize] Scene 1`: ✅ 48KB re-uploaded
- `[asset-normalize] Scene 2`: ✅ 60KB re-uploaded  
- `[asset-normalize] Scene 3`: ✅ 86KB re-uploaded
- `[asset-normalize] Scene 4`: ❌ Kein Log → Loop crasht nach Scene 3
- `[asset-normalize] Scene 5`: ❌ Kein Log
- Summary-Log `"X normalized, Y SVG, Z gradient"`: ❌ Fehlt → unbehandelter Fehler
- **Szene 1 war normalisiert** und trotzdem schwarz → Problem ist das **r42 Bundle** (kein `delayRender`)
- `bundle_canary: r42-errorIsolation` → Alle Template-Fixes (r45/r46) sind NICHT aktiv

## Zwei Probleme, zwei Fixes

### A. Normalisierungs-Loop reparieren (`index.ts`)

**Problem**: Die Schleife crasht nach 3 Szenen (vermutlich Timeout oder unbehandelte Exception bei Scene 4).

**Fix**:
1. Jede Szene in eigenem `try-catch` — bereits vorhanden, aber die äußere Schleife hat keinen Guard
2. **Logging für übersprungene Szenen** hinzufügen: `if (!scene.imageUrl) console.log("[asset-normalize] Scene X: no imageUrl, skipping")`
3. **Gesamte Schleife in try-catch** wrappen, damit der Summary-Log IMMER erscheint
4. **Parallele Normalisierung** statt sequentiell (Promise.allSettled) — schneller, spart Timeout-Budget

### B. Bundle-unabhängiger Bildschutz (`index.ts`)

**Problem**: Selbst normalisierte URLs laden nicht zuverlässig im r42-Bundle (kein `delayRender`, keine Timeout-Guards).

**Fix**: **Doppelte URL-Verifikation** — nach dem Re-Upload wird die neue URL nochmal mit einem GET-Request (3s Timeout) verifiziert. Wenn der GET scheitert, wird sofort auf Gradient umgestellt.

Zusätzlich: Bilder werden als **JPEG** re-uploaded (nicht PNG/WebP), da JPEG das am schnellsten decodierbare Format für headless Chromium ist.

```text
Normalisierung (neu):
  Promise.allSettled für alle Szenen parallel:
    1. GET Image (10s)
    2. Re-Upload als JPEG → video-assets/render-ready/
    3. Verify GET neue URL (3s)
    4. Bei Verify-Fehler → Gradient
  Summary-Log IMMER (auch bei Crash)
```

### C. Build-Tag
`r47-normalize-fix-2026-03-09`

## Dateien

1. `supabase/functions/auto-generate-universal-video/index.ts` — Normalisierungs-Loop mit Promise.allSettled, JPEG-Konvertierung, Verify-Step, Build-Tag

## Hinweis

Das **S3-Bundle bleibt r42** — diese Fixes arbeiten ausschließlich auf Edge-Function-Ebene. Für 100% Zuverlässigkeit muss das Bundle auf r46+ aktualisiert werden (`npx remotion bundle` + S3 Upload).

