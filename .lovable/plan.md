## Ziel

Der Live-Preview in Stufe 4 des Universal Content Creator soll:
1. **Sich wie Stufe 3 verhalten** — Bilder werden im Format-Frame mit `object-contain` (Letterbox erlaubt) angezeigt.
2. **Die gleiche Bildschärfe** wie Stufe 3 haben.

## Analyse

- **Stufe 3** rendert das Hintergrundbild direkt via `<img … object-contain>` in einem Container mit `aspectRatio: formatConfig.width / formatConfig.height`. Native Auflösung, keine zusätzliche Skalierungsstufe.
- **Stufe 4+** rendert über den Remotion-Player die `UniversalCreatorVideo`-Komposition. Der Frame stimmt zwar bereits mit dem Zielformat überein, aber intern gibt es zwei Schärfe-Killer:
  - Wenn eine Szene-Animation `kenBurns` oder `parallax` aktiv ist, verwenden die entsprechenden Komponenten noch `objectFit: 'cover'` und zusätzlich `scale(1.15)`/`110%`-Vergrößerung → das Bild wird hochskaliert und beschnitten, wodurch der 1:1-Inhalt in einem 9:16-Frame gestreckt/unscharf wirkt.
  - `SafeImg` rendert ohne explizite `image-rendering`-Hinweise; bei Downscaling im Player kann der Browser weichzeichnen.

## Änderungen

### 1. `src/remotion/templates/UniversalCreatorVideo.tsx`
- **KenBurnsBackground** (~Zeile 1436–1450): `objectFit` von `cover` → `contain`, `scale(1.15)`/Pan-Transform entfernen bzw. auf sanftes `scale(1.0 → 1.03)` reduzieren, damit kein Zuschnitt entsteht (identisches Verhalten wie Stufe 3).
- **ParallaxBackground** (~Zeile 1466–1487): `objectFit: cover` → `contain`, `width/height: 110%` und `left/top: -5%` auf `100%` / `0` zurücksetzen. Parallax-Translate optional beibehalten, aber ohne Overflow-Zuschnitt.
- Damit nutzt jede Animationsvariante dieselbe „einpassen ohne beschneiden"-Logik wie `renderBackgroundContent`.

### 2. `src/components/universal-creator/RemotionPreviewPlayer.tsx`
- Am Player-Container zusätzlich `imageRendering: 'high-quality'` und `WebkitBackfaceVisibility: 'hidden'` setzen, damit der Browser beim CSS-Downscaling nicht weichzeichnet.
- `<MemoizedPlayer>` mit `style={{ width: '100%', height: '100%' }}` explizit ausfüllen (falls noch nicht geschehen), damit die Komposition nicht in einer kleineren inneren Box gerendert und dann per CSS erneut skaliert wird (Doppel-Downscaling).

### 3. Kein UI-/Business-Logic-Change
- Frame-Rahmen (`aspectRatio: formatConfig.width / formatConfig.height`, `maxHeight: 65vh`) bleibt.
- Controls-Leiste bleibt unverändert.
- Keine Änderungen am Export-Renderer (Lambda) — die betroffenen Komponenten werden zur Renderzeit ohnehin auf Zielauflösung gezeichnet, dort ist `contain` visuell identisch zu vorher (keine Beschneidung mehr, aber Konsistenz mit Preview gewünscht).

## Technische Details

- `SafeImg` unterstützt bereits alle `style`-Props → keine Signatur-Änderung nötig.
- `objectFit: contain` in Ken-Burns/Parallax bedeutet: Ken-Burns-Zoom wird durch das leichte `scale`-Transform simuliert, ohne dass das Bild über den Frame hinausragt.
- Keine Migrationen, keine Edge-Function-Änderungen.

## Verifikation

- Preview-Vergleich Stufe 3 vs. Stufe 4 bei 9:16-Format mit 1:1-Szenenbild: identische Letterbox-Balken, identische Bildschärfe.
- Bei Ken-Burns- und Parallax-Szenen keine gestauchten/beschnittenen Bilder mehr.