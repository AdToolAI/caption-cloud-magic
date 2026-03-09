

# Diagnose: Warum die bisherigen Fixes nicht wirken

## Das tatsachliche Problem

Alle r47-r50 Fixes haben sich auf **Normalisierung und Validierung** konzentriert. Aber:

```text
Edge Function Logs (letzter Render):
  Scene 1: ✅ OK (95KB, 171ms)
  Scene 2: ❌ FAILED → gradient erzwungen  
  Scene 3: ✅ OK (72KB, 230ms)   ← Validierung BESTANDEN
  Scene 4: ✅ OK (50KB, 174ms)   ← Validierung BESTANDEN
  Scene 5: ✅ OK (68KB, 263ms)

User sagt: Szene 3 + 4 = SCHWARZ
```

**Die Validierung auf der Edge Function beweist nichts.** Der Edge Function Deno-Server kann die Bilder laden — aber das Lambda hat eine ANDERE Netzwerkumgebung (AWS eu-central-1, anderes DNS, andere TLS-Konfiguration). Eine erfolgreiche Validierung in Deno garantiert NICHT, dass Lambda's Chromium dasselbe Bild laden kann.

## Root Cause: WebP-Format

`generate-premium-visual` fordert **alle** Bilder als `output_format: 'webp'` von Replicate an. WebP-Bilder sind anfälliger für stille Dekodierungsfehler in Lambda's headless Chromium:

- Das Bild "lädt" (onLoad feuert), aber der decodierte Frame ist leer/transparent
- SafeImg fängt das NICHT ab — es reagiert nur auf onError/Timeout
- Ergebnis: schwarzer Hintergrund trotz "erfolgreicher" Bildladung

JPEG hat dieses Problem nicht — es ist das robusteste Format für headless Rendering.

## Fix: JPEG statt WebP (eine Zeile, maximale Wirkung)

### Datei: `supabase/functions/generate-premium-visual/index.ts`

Alle 3 Stellen wo `output_format: 'webp'` steht → `output_format: 'jpg'` ändern:

- Zeile 134 (Character Sheet)
- Zeile 212 (Fallback mit Character)
- Zeile 235 (Standard Scene)

Das ist der einfachste, zuverlässigste Fix:
- JPEG wird von JEDEM Chromium-Build korrekt dekodiert
- Keine Format-Mismatches mehr (magic bytes = JPEG, content-type = JPEG)
- Die Normalisierung erkennt automatisch JPEG und setzt korrekte Header
- Kein komplexer Workaround nötig

### Zusätzlich: Deployment der Edge Function
`generate-premium-visual` muss nach der Änderung deployed werden.

