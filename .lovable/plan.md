

# Fix: Schwarze Szenen endgültig eliminieren

## Root Cause (endgültig identifiziert)

Das Problem liegt **nicht** an der Bildvalidierung oder am Format. Die Logs beweisen:
- r50-validate: Alle 5 Szenen bestehen die Validierung (60-125KB, 150-1200ms)
- Lambda: Render erfolgreich, keine Fehler (`lambdaErrors: []`)
- Aber: Szenen 3+4 sind trotzdem schwarz

**Der eigentliche Grund:** Das **r42 S3-Bundle** (das auf Lambda läuft) hat NICHT den `SafeImg`-Komponenten mit `delayRender`/Timeout-Fallback. Diese wurde erst in r46 hinzugefügt. Das Bundle verwendet eine alte `<Img>`-Komponente ohne Fehlerbehandlung. Wenn ein Bild in Lambda's Chromium nicht geladen werden kann (z.B. durch Netzwerk-Timing, DNS-Auflösung), wird **still schwarz** gerendert — ohne Crash, ohne Error.

**Kein Edge-Function-Fix kann dieses Problem lösen**, solange `background.type = 'image'` an das Bundle gesendet wird. Die einzige Lösung: **Nie `background.type = 'image'` senden.**

## Lösung: Alle Szenen auf Gradient umstellen

Statt `background.type = 'image'` zu senden (was im r42 Bundle schwarz rendert wenn das Bild nicht lädt), setzen wir **alle Szenen auf `background.type = 'gradient'`** mit szenen-spezifischen Farben.

### Änderung in `supabase/functions/auto-generate-universal-video/index.ts`

In der Scene-Mapping-Logik (ca. Zeile 1283-1331), wo `remotionScenes` erstellt werden:

**Vorher:**
```typescript
const bgType = scene.background?.type === 'gradient'
  ? 'gradient'
  : validateEnum(hasValidImage ? 'image' : 'gradient', ...);

return {
  background: {
    type: bgType,
    imageUrl: bgType === 'image' ? scene.imageUrl : undefined,
    gradientColors: sceneGradientColors,
  },
};
```

**Nachher:**
```typescript
// r51: FORCE GRADIENT for ALL scenes — r42 bundle cannot safely render images
// (no SafeImg/delayRender in bundle = silent black frames)
const bgType = 'gradient';
const sceneType = validateEnum(scene.sceneType || scene.type || 'content', VALID_SCENE_TYPES, 'feature');
const typeGradients = {
  'hook': ['#f59e0b', '#d97706'],
  'problem': ['#ef4444', '#b91c1c'],
  'solution': ['#10b981', '#059669'],
  'feature': ['#3b82f6', '#1d4ed8'],
  'proof': ['#8b5cf6', '#6d28d9'],
  'cta': ['#f97316', '#ea580c'],
  'intro': ['#06b6d4', '#0891b2'],
  'outro': ['#6366f1', '#4f46e5'],
  'transition': ['#64748b', '#475569'],
};
// Use brand colors if available, otherwise scene-type colors
const gradientColors = briefing.brandColors?.length >= 2
  ? [briefing.brandColors[0], briefing.brandColors[1]]
  : typeGradients[sceneType] || ['#3b82f6', '#1e40af'];

return {
  background: {
    type: 'gradient',  // NEVER 'image' — r42 bundle can't handle it
    gradientColors: gradientColors,
  },
};
```

### Konsequenz
- **Alle Szenen haben garantiert einen sichtbaren Hintergrund** (Gradient statt Bild)
- Bilder werden weiterhin generiert (für zukünftiges Bundle-Update)
- Die gesamte Normalisierungs- und Validierungslogik (r46-r50) kann entfernt oder deaktiviert werden, da sie keinen Effekt mehr hat
- **Qualitätsverlust:** Szenen haben farbige Gradients statt generierter Bilder. Dies ist temporär bis das S3-Bundle aktualisiert wird.

### Build-Tag
`r51-force-gradient-2026-03-09`

### Dateien
- `supabase/functions/auto-generate-universal-video/index.ts` — Scene-Mapping ändern
- Deploy der Edge Function

