## Problem

Stufe 3 zeigt Hintergründe mit einem einfachen `<img/video className="object-contain">` in einem Container mit `aspectRatio: formatConfig.width / formatConfig.height` (UniversalCreator.tsx:640–645). Das Bild wird also **komplett** dargestellt — Landscape-Assets bekommen im 9:16-Rahmen schwarze Balken oben/unten (Screenshot 2).

Ab Stufe 4 rendert der Remotion-`Player` dieselbe Szene über die `UniversalCreatorVideo`-Composition. Der Container ist bereits korrekt (`aspectRatio: width/height`, 65vh cap). **Aber**: Die Scene-Backgrounds innerhalb der Composition sind hart auf `objectFit: 'cover'` gesetzt (UniversalCreatorVideo.tsx:2094 Video, 2018/2070 als Default in SafeVideo/SafeImg). `cover` **beschneidet** das Landscape-Asset auf das Portrait-Frame → Screenshot 1 zeigt nur einen Ausschnitt des Originals. Genau die Diskrepanz, die der User meint.

## Fix — Scene-Background auf `contain` umstellen (Preview-Parität zu Stufe 3)

Datei: `src/remotion/templates/UniversalCreatorVideo.tsx`

Nur die **Scene-Background-Renderer** (Video + Bild) ändern:

1. Zeile 2091–2097 (Video-Background):
   - `<AbsoluteFill>` → `<AbsoluteFill style={{ backgroundColor: '#000' }}>` (Letterbox-Balken).
   - `SafeVideo` style: `objectFit: 'cover'` → `'contain'`.
2. Zeile 2100–2106 (Image-Background):
   - `<AbsoluteFill style={{ backgroundColor: '#000', ...(rawMediaMode ? {} : { filter: 'saturate(1.15) contrast(1.05)' }) }}>`.
   - `SafeImg` explizit mit `style={{ width: '100%', height: '100%', objectFit: 'contain' }}` übergeben.

`SafeVideo`/`SafeImg` Defaults (Z. 2018, 2070) **nicht** ändern — sie werden auch von anderen Templates/Stellen genutzt und dort ist `cover` korrekt.

## Effekt

- Stufe 3 und Stufe 4+ zeigen exakt denselben Bildausschnitt (voller Frame, ggf. schwarze Balken oben/unten oder links/rechts je nach Asset-Aspect vs. Format-Aspect).
- Kein Layout-Shift zwischen den Wizard-Stufen.
- Gilt auch für den finalen Render — Landscape-Assets in Portrait-Format werden nicht mehr stumm zugeschnitten, was zur Preview passt (WYSIWYG).

## Verifikation

- Playwright: Screenshot Stufe 3 & Stufe 4 mit einem 16:9-Background in 9:16-Format — beide Frames identisch, gleiche Balken oben/unten.
- Gegenprobe: 9:16-Background in 9:16-Format — kein Balken, Bild füllt komplett (contain = cover, wenn Aspects gleich).
- Kein Anfassen von RemotionPreviewPlayer, PreviewExportStep, Composer, Render-Pipeline oder Backend.