

# Fix: Professionelles Drehbuch + Alle 5 Szenen ohne schwarze Frames

## Problem-Analyse

Drei Ursachen für die schwarzen Szenen und mangelnde Qualität:

### 1. Prompt-Feld wird ignoriert (HAUPTURSACHE)
In `auto-generate-universal-video/index.ts` Zeile 819-821 wird ein detaillierter `prompt` gebaut und an `generate-premium-visual` gesendet. Aber `generate-premium-visual/index.ts` Zeile 145 liest `request.sceneDescription` — das nie gesetzt wird. **Jede Szene bekommt den generischen Fallback "professional business scene"**, was die Fehlerrate erhöht und generische Bilder produziert.

### 2. Falsches Aspect Ratio
`generate-premium-visual` hardcoded `aspect_ratio: '16:9'` (Zeilen 210, 234), obwohl der Briefing z.B. `9:16` für Reels/Shorts verlangt. Das `aspectRatio`-Feld wird aus dem Request gelesen aber NIE an die Replicate API weitergegeben.

### 3. Kein Error-Recovery bei Bild-Ladefehlern in Remotion
`renderBackgroundContent()` (Zeile 1740) verwendet `<Img>` ohne `onError`-Handler. Wenn ein SVG-Fallback oder eine abgelaufene URL in Lambda nicht lädt → schwarzer Frame.

## Implementierungsplan

### A. Prompt-Fix in `auto-generate-universal-video/index.ts`
**Zeile ~819**: `prompt` → `sceneDescription` umbenennen im Request-Body an `generate-premium-visual`:
```typescript
body: JSON.stringify({
  sceneDescription: prompt,  // was: prompt
  type: 'scene',             // NEU: explizit scene-type
  style: briefing.visualStyle,
  aspectRatio: briefing.aspectRatio,
  characterSheetUrl: characterSheetUrl,
}),
```

### B. Aspect Ratio Fix in `generate-premium-visual/index.ts`
- Zeile 210 und 234: `aspect_ratio: '16:9'` → `aspect_ratio: request.aspectRatio || '16:9'`
- Interface `PremiumVisualRequest` erweitern um `aspectRatio?: string`

### C. SafeImg-Komponente in `UniversalCreatorVideo.tsx`
Neue `SafeImg`-Wrapper-Komponente mit `onError` → `GradientFallback`:
```typescript
const SafeImg: React.FC<{src: string; sceneType?: string; primaryColor?: string}> = ({src, sceneType, primaryColor}) => {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <GradientFallback sceneType={sceneType} primaryColor={primaryColor} />;
  return <Img src={src} onError={() => setFailed(true)} style={{width:'100%',height:'100%',objectFit:'cover'}} />;
};
```
`renderBackgroundContent()` Zeile 1740: ersetze `<Img>` durch `<SafeImg>`.

### D. Build-Tag aktualisieren
`AUTO_GEN_BUILD_TAG` → `"r44-prompt-fix-2026-03-09"` für Deployment-Verifizierung.

## Dateien

1. `supabase/functions/auto-generate-universal-video/index.ts` — Prompt-Feld-Fix + Build-Tag
2. `supabase/functions/generate-premium-visual/index.ts` — aspectRatio-Durchleitung + Interface
3. `src/remotion/templates/UniversalCreatorVideo.tsx` — SafeImg mit onError-Fallback

## Wichtiger Hinweis

Die Remotion-Änderung (SafeImg) erfordert ein **neues S3-Bundle-Deployment** (`REMOTION_SERVE_URL`), um in Lambda wirksam zu werden. Die Edge-Function-Fixes (A+B+D) werden sofort aktiv und beheben die Hauptursache (falsche/generische Prompts).

