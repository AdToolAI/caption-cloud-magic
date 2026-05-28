## Problem

In `src/pages/UniversalCreator/UniversalCreator.tsx` (Live Preview Panel, Zeilen ~380-433) gibt es zwei Bugs:

**Bug 1 — Step 3 (Scenes):** Die "Einfache Preview" zeigt hartkodiert `scenes[0]?.background?.videoUrl`. Wenn der Nutzer im `BackgroundAssetSelector` ein neues Asset auswählt (um es als nächste Szene hinzuzufügen), bleibt die Vorschau auf der ersten bereits hinzugefügten Szene. Der Nutzer kann das aktuell ausgewählte Asset nicht sehen, bevor er es per "Add Scene" hinzufügt.

**Bug 2 — Step 4 (Audio):** Die Logik schaltet erst bei `currentStep >= 4` (Subtitles) auf den vollwertigen `RemotionPreviewPlayer` um. Der Audio-Step (Index 3) zeigt also weiterhin die einfache `<video>`-Vorschau mit nur `scenes[0]`, weshalb nur die erste Szene endlos loopt statt aller hinzugefügten Szenen.

## Fix

In `src/pages/UniversalCreator/UniversalCreator.tsx`, Live-Preview-Block (~Zeilen 380-433):

1. **Einfache Preview nur noch in Step 3 (Scenes-Step, Index 2):**
   - Bedingung ändern von `currentStep >= 2 && currentStep < 4` → `currentStep === 2`.
   - Quelle der Vorschau in dieser Reihenfolge wählen:
     1. Wenn `backgroundAsset` gesetzt ist → dieses anzeigen (currently-selected, noch nicht hinzugefügt). Das beantwortet "was wird die nächste Szene?".
     2. Sonst `scenes[scenes.length - 1]` (zuletzt hinzugefügte Szene) als Fallback.
     3. Sonst "Preview Loading"-Placeholder.
   - Label "Einfache Preview" beibehalten, aber den Untertitel im Step 3 klarstellen ("Vorschau der nächsten Szene / zuletzt hinzugefügten Szene").

2. **RemotionPreviewPlayer (vollständiges Multi-Scene-Video) ab Step 4 (Audio, Index 3):**
   - Bedingung ändern von `currentStep >= 4` → `currentStep >= 3`.
   - Damit sieht der Nutzer ab dem Audio-Step das komplett zusammengebaute Video mit allen Szenen, Voiceover und Musik — passend zum Label "Sound ab Step 4".

3. **Placeholder-Bedingung** (`!contentConfig?.voiceoverUrl && scenes.length === 0`) bleibt unverändert.

Keine Änderungen an `RemotionPreviewPlayer.tsx`, `UniversalCreatorVideo.tsx`, Edge Functions oder anderen Steps nötig — der Player rendert Szenen bereits korrekt; er wurde im Audio-Step nur nicht aktiviert.

## Verifikation

- Step 3: Background-Asset auswählen → Preview zeigt dieses Asset sofort. Hinzufügen → Preview bleibt auf zuletzt gewähltem Asset (für nächste Szene). Neues Asset wählen → Preview springt auf neues Asset.
- Step 4 (Audio): Vollständiges Video mit allen 4 Szenen läuft im RemotionPreviewPlayer mit Voiceover.
- Step 5/6: Unverändert, weiterhin RemotionPreviewPlayer.