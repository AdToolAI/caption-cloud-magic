

# Fix: Schwarze Szenen trotz Fallback-Implementierung

## Diagnose

Die Screenshots zeigen: **2/5 Szenen sind immer noch schwarz** (Szene 1 "Keine Reichweite?" und Szene 4 "Maximale Performance"). Die 3 erfolgreichen Szenen haben AI-Bilder von Replicate. Die Verbesserungen im lokalen Code (GradientFallback mit Patterns) **greifen nicht**, weil die Remotion Lambda das S3-Bundle nutzt — und dort ist die alte Version.

**Warum die Edge Function-Fallbacks auch nicht funktionieren:**

1. **Gemini Image Response-Format ist falsch:** Zeile 1893 sucht nach `choices[0].message.images[0].image_url.url` — das ist NICHT das Format der Lovable AI Gateway. Die Gateway gibt Bilder als `choices[0].message.content` zurück, wobei `content` ein Array von Parts ist (text + inline image). Das Ergebnis: `imageData = undefined` → fällt durch zu placehold.co.

2. **placehold.co funktioniert nicht in Lambda:** Die `generatePNGPlaceholder` Funktion gibt eine URL wie `https://placehold.co/1920x1080/3b82f6/1e293b.png` zurück. Remotions `<Img>` versucht diese URL in Lambda zu laden — placehold.co wird entweder geblockt oder läuft in ein Timeout. Ergebnis: schwarzer Frame.

3. **Kette der Failures:** Replicate fehlschlägt → Gemini-Parsing fehlschlägt (falsches Format) → placehold.co fehlschlägt (Lambda-Netzwerk) → schwarz.

## Fix (2 Änderungen in der Edge Function)

### 1. Gemini Response-Parsing korrigieren

Die Lovable AI Gateway gibt Bilder im OpenAI-kompatiblen Format zurück:
```text
choices[0].message.content = [
  { type: "text", text: "..." },
  { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
]
```

Aktuell sucht der Code nach `message.images[0].image_url.url` — das existiert nicht. Fix: Content-Array nach `type === "image_url"` durchsuchen.

### 2. Selbst-gehosteten Fallback statt placehold.co

Wenn auch Gemini fehlschlägt: statt placehold.co eine **SVG-Datei in Supabase Storage hochladen** und deren Public URL zurückgeben. So hat Lambda immer eine erreichbare URL.

**Dateien:** `supabase/functions/auto-generate-universal-video/index.ts`
- `generateAIFallbackImage`: Response-Parsing fixen
- `generatePNGPlaceholder`: SVG → Storage Upload statt placehold.co URL

