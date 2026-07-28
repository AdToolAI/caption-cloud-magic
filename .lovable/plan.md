## Problem

Der Preview-Player übernimmt aktuell das Composition-Format (9:16 Portrait), wodurch das Video den Frame komplett füllt und der Frame selbst extrem hoch wird. Der Nutzer will stattdessen einen **fest dimensionierten Player-Frame** (16:9-Fenster), in dem Portrait-Videos mit **schwarzen Balken oben/unten** (Letterbox) angezeigt werden — genau wie ein YouTube-/QuickTime-Player.

## Fix — `src/components/universal-creator/RemotionPreviewPlayer.tsx`

1. Frame-Container **immer** auf ein festes Player-Fenster setzen — nicht mehr am Composition-Aspect ausrichten:
   - `aspectRatio: 16 / 9`
   - `width: '100%'`, `maxWidth: 'min(100%, 720px)'`, `maxHeight: '55vh'`
   - `bg-black` (bleibt), zentriert via `mx-auto`.
2. Remotion `<Player>` innerhalb dieses Fensters mit `style={{ width: '100%', height: '100%' }}` behalten — der Player skaliert die Composition selbst korrekt in seinen Container und erzeugt automatisch Letterbox-Balken, weil `compositionWidth/Height` (z. B. 1080×1920) vom Frame-Aspect (16:9) abweicht.
3. `isPortrait`-Zweig entfernen — nicht mehr nötig.

Effekt: Portrait 9:16 erscheint als schmales, zentriertes Video mit schwarzen Balken links/rechts im 16:9-Fenster; Landscape 16:9 füllt den Frame; 1:1 zeigt Balken links/rechts. Player + Controls passen zusammen in einen Viewport ohne Scroll.

Rein Frontend, keine Änderung an Composition, Render-Payload oder Backend.

## Verifikation

- Playwright-Screenshot in Step 4 mit 9:16-Format bei 1280×800: 16:9-Frame sichtbar, Video mittig mit schwarzen Balken links/rechts, Controls direkt darunter, alles ohne Scroll.
- Kurzcheck 16:9 (Vollformat) und 1:1 (Balken links/rechts).
