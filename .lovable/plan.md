## Problem

Im Motion Studio (Clips-Tab) zeigt Szene 1 jetzt korrekt das Lip-Sync-Video (Lippen bewegen sich), aber es ist **kein Ton** zu hören. Das Audio (Dialog) ist im Video selbst eingebettet — der Player stummt es jedoch hartcodiert.

## Ursache

`src/components/video-composer/SceneClipProgress.tsx` (Zeile 35-52) rendert das fertige Szenen-Video mit dem `muted`-Attribut:

```tsx
<video src={scene.clipUrl} ... muted controls ... />
```

Das galt früher, als alle Clips stille i2v/t2v-Renders waren. Jetzt — wo Szenen via Lip-Sync (sync-labs/lipsync-2) bzw. nativer AI-Audio (Sora/Veo) Dialog enthalten — verhindert `muted` jegliche Tonwiedergabe.

## Fix (nur Frontend, ein File)

**`src/components/video-composer/SceneClipProgress.tsx`**
- `muted` aus dem `<video>`-Tag entfernen.
- `controls` bleibt → User startet die Wiedergabe selbst, daher kein Autoplay-Policy-Problem.
- `playsInline` ergänzen für saubere mobile Wiedergabe.
- Lautstärke-Default auf `0.9` setzen (`onLoadedMetadata`-Hook erweitern), damit Dialoge gut hörbar sind, ohne übersteuert zu wirken.

## Bewusst nicht angefasst

- **Mini-Thumbnails in `SceneCard.tsx`** (96×64 px, Zeile 1223/1225): bleiben `muted` — sie sind reine Standbild-Previews, kein Playback-Element.
- **`StockMediaBrowser.tsx`** und andere Suchergebnis-Vorschauen: out of scope.
- Keine Backend-/Edge-Function-Änderungen, keine Schema-Änderungen, kein Audio-Re-Encoding.

## Verifikation

Nach dem Edit auf Szene 1 im Composer Play drücken → Stimmen von Matthew/Sarah müssen hörbar sein, Lippen-Sync bleibt synchron.
