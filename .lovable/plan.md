

## r35 — Lottie Stall: Der `<Lottie>`-Komponenten-interne delayRender

### Befund

Die Error-Message `"Waiting for Lottie animation to load"` kommt **nicht** aus unserem Code. Sie kommt aus dem **internen** `delayRender` der `@remotion/lottie` `<Lottie>`-Komponente selbst (Zeile 2841 im Bundle). Unser Code ruft korrekt `continueRender` für seinen eigenen Handle auf — aber danach rendert er `<Lottie animationData={...}>`, und diese Komponente registriert intern einen **zweiten** `delayRender`, der bei der Animation-Initialisierung hängt.

**Warum Retry Tier 1 nicht hilft:**
- Tier 1 setzt `disableLottieIcons=true`, `disableMorphTransitions=true`, `forceEmbeddedCharacterLottie=true`
- `forceEmbeddedCharacterLottie` überspringt CDN-Fetches, aber rendert trotzdem `<Lottie animationData={embeddedData}>` (Zeile 345 in ProfessionalLottieCharacter)
- Der `<Lottie>`-interne delayRender hängt auch mit embedded Daten in Lambda

**Warum das alte Bundle das Problem ist:**
- Die r34-Fixes (Lambda-Detection in LottieIcons/MorphTransition) sind im Source, aber NICHT im deployed S3-Bundle
- Deshalb: Erster Render-Versuch scheitert immer an LottieIcons (fetcht CDN ohne Timeout)
- Retry scheitert an ProfessionalLottieCharacter (rendert `<Lottie>` mit embedded Daten → interner Hang)

### Plan

#### A. Sofort-Fix: Retry-Strategie verschärfen (Backend)
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Lottie-Stall Retry Tier 1 → direkt `disableAllLottie: true` setzen (statt schrittweiser Degradierung):
- `disableAllLottie: true` → setzt automatisch `disableCharacter: true`, `disableLottieIcons: true`, `disableMorphTransitions: true` in UniversalCreatorVideo
- `useCharacter: false`, `characterType: 'svg'` → extra Sicherheit
- Das deployed Bundle prüft diese Flags bereits (Zeilen 1821-1831, 2249, 2171, 2218) → sofort wirksam ohne Bundle-Redeploy

#### B. Zukunfts-Fix: Lambda-Detection in Character-Komponenten (Frontend/Bundle)
**Dateien:**
- `src/remotion/components/ProfessionalLottieCharacter.tsx`
- `src/remotion/components/LottieCharacter.tsx`

Lambda-Umgebung erkennen → `loadSource = 'svg'` erzwingen → `<Lottie>`-Komponente wird nie gemountet → kein interner delayRender-Hang. Wird erst nach Bundle-Redeploy aktiv.

### Erwartetes Ergebnis
```text
Lottie-Stall, 1. Retry (SOFORT wirksam, ohne Bundle-Redeploy):
  → disableAllLottie=true → KEIN <Lottie>-Mount in der gesamten Composition
  → Render schließt erfolgreich ab ✅

Nach Bundle-Redeploy (Zukunft):
  → Erster Versuch: Lambda-Detection → SVG-Fallback → kein Hang ✅
  → Volle Qualität nur im Browser-Preview ✅
```

### Dateien
1. `supabase/functions/auto-generate-universal-video/index.ts` — Tier 1 = sofort `disableAllLottie`
2. `src/remotion/components/ProfessionalLottieCharacter.tsx` — Lambda → SVG-Fallback
3. `src/remotion/components/LottieCharacter.tsx` — Lambda → SVG-Fallback

