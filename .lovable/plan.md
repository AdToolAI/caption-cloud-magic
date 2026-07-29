## Zwei kleine Fixes

### 1. Fortschrittsleiste im Export-Schritt läuft von allein
`RemotionPreviewPlayer` hat die Defaults `autoPlay = true` und `loop = true`, und `PreviewExportStep.tsx` (ca. Zeile 601) übergibt keine eigenen Werte. Der Player wird also beim Betreten von Schritt 4 stumm gestartet und läuft im Dauerloop. Der `autoPlay`-Effekt ruft `player.play()` direkt auf, ohne dass der interne `isPlaying`-State/das Play-Icon umschaltet — sichtbar ist dann nur, wie die Leiste durchläuft und am Loop-Ende zurückspringt, während das Bild statisch/dunkel bleibt.

Fix: Im Export-Schritt `autoPlay={false}` übergeben. Damit bleibt der Player bei Frame 0 stehen, die Leiste bewegt sich erst, wenn der Kunde Play drückt. Der Loop-Toggle bleibt unverändert erhalten und greift dann beim manuellen Abspielen.

### 2. „uc.chooseFromLibrary“ im Schritt 3
`BackgroundAssetSelector.tsx` nutzt `t('uc.chooseFromLibrary')` und `t('uc.chooseFromLibraryDesc')`. Diese Keys existieren nur im `calendar`-Namespace, nicht unter `uc` — deshalb wird der rohe Key angezeigt (der `|| 'Aus Mediathek wählen'`-Fallback greift nicht, weil `t()` den Key-String zurückgibt, also truthy ist).

Fix: In `src/lib/translations.ts` im `uc`-Block für EN/DE/ES ergänzen:
- `chooseFromLibrary`: „Choose from Library“ / „Aus Mediathek wählen“ / „Elegir de la biblioteca“
- `chooseFromLibraryDesc`: „Reuse videos you already created“ / „Bereits erstellte Videos wiederverwenden“ / „Reutiliza vídeos ya creados“

### Betroffene Dateien
- `src/components/universal-creator/steps/PreviewExportStep.tsx`
- `src/lib/translations.ts`
