

## Diagnose

Der neue Fehler ist klar: **"Error loading image with src: data:image/svg+xml;base64,..."**

**Ursache:** Remotion Lambda kann **keine Data-URIs** (`data:image/svg+xml;base64,...`) als Bild-Quellen laden. Das betrifft:

1. **Backend-Fallback** (`auto-generate-universal-video/index.ts`): `generateSVGPlaceholder()` gibt `data:image/svg+xml;base64,...` zurück, wenn die visuelle Generierung fehlschlägt
2. **Frontend-Fallback** (`UniversalCreatorVideo.tsx` + `ExplainerVideo.tsx`): `FALLBACK_IMAGE` Konstante ist ebenfalls ein Data-URI

Wenn auch nur eine Szene kein echtes Bild hat, crasht der gesamte Render.

## Plan (r22 — Data-URI Fallbacks durch echte URLs ersetzen)

### 1. Backend: SVG-Placeholder in Supabase Storage hochladen

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

`generateSVGPlaceholder()` ändern:
- SVG als Datei in Supabase Storage (`video-assets` Bucket) hochladen
- Öffentliche URL zurückgeben statt Data-URI
- Fallback-Pfad: `placeholders/{uuid}.svg`

### 2. Frontend-Templates: FALLBACK_IMAGE durch gehostete URL ersetzen

**Dateien:**
- `src/remotion/templates/UniversalCreatorVideo.tsx`
- `src/remotion/templates/ExplainerVideo.tsx`

Die `FALLBACK_IMAGE` Konstante von `data:image/svg+xml;base64,...` auf eine **statische, gehostete URL** umstellen. Optionen:
- Eine einzige SVG-Datei im `public/` Ordner ablegen → absolute URL verwenden
- Oder: Inline-CSS-Gradient als `<div>` statt `<Img>` rendern (kein Bild nötig)

**Empfehlung:** `<div>` mit CSS-Gradient als Fallback verwenden, da dies keinen Netzwerk-Request benötigt und in Lambda zuverlässig funktioniert.

### 3. Robuster Fallback in SceneBackground-Komponenten

**Dateien:** Gleiche wie oben

Alle Stellen wo `<Img src={safeImageUrl}>` genutzt wird:
- Prüfen ob URL mit `data:` beginnt → stattdessen CSS-Gradient-Div rendern
- `onError`-Handler hinzufügen der ebenfalls auf Gradient-Div umschaltet

### Dateien
- `supabase/functions/auto-generate-universal-video/index.ts` — Storage-Upload statt Data-URI
- `src/remotion/templates/UniversalCreatorVideo.tsx` — CSS-Gradient-Fallback
- `src/remotion/templates/ExplainerVideo.tsx` — CSS-Gradient-Fallback

