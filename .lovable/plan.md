## Diagnose

Der Referenzbild-Slot wurde in `SceneAvatarMode.tsx` eingebaut — der rendert aber nur im **Avatar-Tab**. Der sichtbare „Dialog & Lip-Sync"-Toggle im Screenshot liegt jedoch im **Editor-Tab** (`SceneCard.tsx`, Zeile ~1438–1600, unter „Story & Engine"). Deshalb: Toggle AUS → im Editor passiert nichts, weil der Slot in einem anderen Tab wohnt.

## Fix

1. **Neue Datei `src/components/video-composer/SceneReferenceImageSlot.tsx`**
   - Extrahiert den bestehenden Upload/Preview/Remove-Block aus `SceneAvatarMode.tsx` (Bucket `ai-video-reference`, User-ID-Path, `onUpdate({ referenceImageUrl })`).
   - Rendert `null`, wenn `scene.lipSyncWithVoiceover === true` (Auto-Hide, kein Datenverlust).
   - Props: `{ scene, onUpdate }`.

2. **`src/components/video-composer/SceneCard.tsx`**
   - Direkt nach dem „Dialog & Lip-Sync"-Toggle-Block (nach Zeile ~1600) das neue `<SceneReferenceImageSlot />` einfügen — sichtbar im Editor-Tab, dort wo der Nutzer den Toggle bedient.

3. **`src/components/video-composer/SceneAvatarMode.tsx`**
   - Alten Inline-Block (Zeilen ~375–420) durch dieselbe `<SceneReferenceImageSlot />`-Komponente ersetzen, damit Avatar- und Editor-Tab identisch bleiben und keine Doppel-Implementierung driftet.

Keine Backend-/DB-Änderung — `composer_scenes.reference_image_url` und die i2v-Pipelines konsumieren das Feld bereits.

## Verifikation

- Editor-Tab, Lip-Sync AUS → Referenzbild-Slot erscheint unter dem Toggle.
- Lip-Sync AN → Slot verschwindet, Wert bleibt in DB.
- Avatar-Tab zeigt denselben Slot mit derselben Vorschau.