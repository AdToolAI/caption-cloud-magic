

# Diagnose: Warum schwarze Szenen WEITERHIN auftreten

## Fakten aus der Datenbank

**Letzter Render: `ojtwbbt3wo` — 9. März 2026, 22:01 UTC.**
Seitdem wurde **KEIN neuer Render** erstellt. Die r51 Gradient-Fix wurde am **10. März** deployed. Das bedeutet: das Video, das du siehst, wurde VOR dem Fix gerendert.

ABER: Du sagst, das Problem besteht seit gestern Abend, also nach vorherigen Fixes (JPEG-Format etc.). Das zeigt, dass die bisherigen Fixes (r47-r50: Normalisierung, Validierung, Format) das Problem NICHT lösen.

## Warum r51 (force-gradient) allein nicht reichen könnte

Ich habe den **Bundle-Code** (`UniversalCreatorVideo.tsx`) untersucht und ein kritisches Problem gefunden:

```text
Zeile 1613: if (animation === 'parallax') {
    → ParallaxBackground imageUrl={safeImageUrl}   ← IMMER imageUrl, ignoriert gradient!

Zeile 1595: if (animation === 'kenBurns' && (background.type === 'image' || !background.type))
    → kenBurns wird bei 'gradient' übersprungen = OK
```

**`parallax`-Animation ignoriert den Background-Typ komplett** und versucht immer ein Bild zu laden. Wenn die AI-generierten Szenen `animation: 'parallax'` setzen, werden diese schwarz — egal ob `background.type = 'gradient'`.

Zusätzlich speichert die `content_config` in der DB NICHT die tatsächlichen Scene-Daten (nur die Anzahl). Wir haben keine Forensik, welche Backgrounds/Animations tatsächlich an Lambda gingen.

## Plan: Zwei Maßnahmen

### 1. Animations auf gradient-sichere beschränken
In `auto-generate-universal-video/index.ts`: Wenn `background.type = 'gradient'`, dann Animation auf gradient-kompatible beschränken (kein `kenBurns`, kein `parallax`). Diese beiden Animationen funktionieren nur mit Bildern.

```typescript
// r52: Force gradient-safe animations
const GRADIENT_SAFE_ANIMATIONS = ['fadeIn', 'slideUp', 'slideLeft', 'slideRight', 
  'zoomIn', 'zoomOut', 'bounce', 'popIn', 'flyIn', 'morphIn', 'none'];
const rawAnimation = scene.animation || getDefaultAnimation(sceneType);
const animation = GRADIENT_SAFE_ANIMATIONS.includes(rawAnimation) 
  ? rawAnimation 
  : 'fadeIn'; // fallback for kenBurns/parallax
```

### 2. Scene-Forensik in content_config speichern
Die tatsächlichen Background-Typen und Animations in `content_config` mitschreiben, damit wir nach dem Render beweisen können, was an Lambda ging.

```typescript
content_config: { 
  ...existing,
  scene_backgrounds: remotionScenes.map(s => s.background.type),
  scene_animations: remotionScenes.map(s => s.animation),
  r52_gradient_forced: true,
}
```

### Dateien
- `supabase/functions/auto-generate-universal-video/index.ts` — Animations-Guard + Forensik
- Deploy der Edge Function

### Erwartetes Ergebnis
Beim nächsten Video-Render: Alle 5 Szenen haben Gradient-Backgrounds MIT gradient-kompatiblen Animationen. Keine schwarzen Szenen mehr möglich.

