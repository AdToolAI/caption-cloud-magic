

# Phase 12: CTA-Text-Fix + Klickbarer Link + Loft-Film Polish

## Problem 1: "Besuchen Sie www." — Text bricht ab

Die `smartTruncateToSentences()` Funktion splittet Text an `.` (Punkt). Der Voiceover-Text "Besuchen Sie www.useadtool.ai" wird am Punkt nach "www" als Satzende interpretiert und abgeschnitten.

**Fix in `auto-generate-universal-video/index.ts`:**
- URLs vor dem Truncation schuetzen: Punkte in URLs temporaer durch Platzhalter ersetzen, truncaten, dann zuruecksetzen
- Oder: CTA-Szenen von der aggressiven 1-Satz/15-Woerter-Truncation ausnehmen (CTA darf 2 Saetze / 25 Woerter haben)

```typescript
// CTA-Szenen brauchen mehr Platz fuer URL + Call-to-Action
const isCTA = sceneType === 'cta' || sceneType === 'outro';
const truncatedText = smartTruncateToSentences(
  scene.voiceover || scene.title || '', 
  isCTA ? 2 : 1, 
  isCTA ? 25 : 15
);
```

Zusaetzlich: `smartTruncateToSentences` URL-safe machen — URLs nicht an Punkten splitten:
```typescript
// URLs schuetzen vor Satz-Split
const urlSafe = text.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/g, match => 
  match.replace(/\./g, '\u2024') // Punkt durch One-Dot-Leader ersetzen
);
// ... truncate ...
// Danach zuruecksetzen
result = result.replace(/\u2024/g, '.');
```

## Problem 2: Klickbarer Link im Video

Ein gerendertes MP4-Video kann keine klickbaren Links enthalten. **Aber** der Preview-Player im Browser kann einen klickbaren Overlay zeigen.

**Fix in `UniversalPreviewPlayer.tsx`:**
- Wenn das Video zu Ende ist (oder bei der CTA-Szene), einen klickbaren Link-Overlay einblenden
- Der Link oeffnet `brandUrl` in einem neuen Tab

```tsx
{brandUrl && isAtEnd && (
  <a href={brandUrl.startsWith('http') ? brandUrl : `https://${brandUrl}`} 
     target="_blank" rel="noopener"
     className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/80 hover:text-white underline"
  >
    {brandUrl}
  </a>
)}
```

Fuer das heruntergeladene MP4: Hinweis anzeigen, dass der Link im Video sichtbar ist aber nur im Player klickbar.

## Problem 3: Naeher an Loft-Film

Aus den Screenshots erkennbare Verbesserungsmoeglichkeiten:

### 3a. Glass-Panel fuer CTA zu gross und leer
Die CTA-Szene zeigt "Profitieren Sie noch heute!" mit "Besuchen Sie www." darunter — das Panel ist ueberdimensioniert. Fix: CTA-Panel kompakter, URL groesser und prominenter anzeigen.

### 3b. brandUrl prominenter in der CTA-Szene
Statt `fontSize: 18` und `opacity: 0.6` die URL groesser und sichtbarer machen:
```
fontSize: 24, opacity: 0.85, fontWeight: 600
```

### 3c. Script-Generator: CTA-Szene Regel verschaerfen
In `generate-universal-script/index.ts` eine explizite Anweisung hinzufuegen, dass die CTA-Szene die vollstaendige Website-URL im Voiceover enthalten MUSS (nicht abgekuerzt).

## Dateien

| Datei | Aenderung |
|-------|----------|
| `auto-generate-universal-video/index.ts` | CTA-Truncation lockern, URL-safe Truncation |
| `UniversalPreviewPlayer.tsx` | Klickbarer Link-Overlay am Video-Ende |
| `UniversalCreatorVideo.tsx` | brandUrl groesser/prominenter in CTA |
| `generate-universal-script/index.ts` | CTA muss volle URL enthalten |

