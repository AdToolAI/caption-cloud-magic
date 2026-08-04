# Post Designer: vom Caption-Tool zum Bild-Post-Studio

Der KI Post-Generator liefert heute nur Text (Hook, Caption, Hashtags) zu einem hochgeladenen Bild. Neu: Der Kunde bekommt aus Briefing + Bild in einem Schritt fertig gestaltete, professionelle Bild-Posts — KI setzt Layout, Typografie und Brand-Farben, danach ist alles frei auf einer Canvas nachbearbeitbar. Formate: 1:1 Feed und mehrseitiges Karussell.

## Ablauf für den Kunden

```text
1  Briefing + Bildquelle           Upload · Picture Studio (KI-Bild) · Mediathek · Stock
2  KI-Design-Sprint                4 fertige Layout-Varianten in Brand-Farben
3  Auswahl + Canvas-Editor         Text, Farben, Bild, Logo, Badges frei anpassen
4  Karussell                       Slides ergänzen, KI schreibt Folgeslides
5  Export                          PNG 1080x1080, Slide-Set, Mediathek, Kalender
```

## UI-Niveau: Studio statt Formular

Der Designer bekommt dieselbe Bond-2028-Sprache wie Motion Studio, Autopilot und Founders-UI — kein Formular mit Vorschau, sondern eine echte Studio-Oberfläche:

- **Dunkle Studio-Bühne**: Deep-Black-Arbeitsfläche mit sanftem Gold-Vignettenlicht, die Canvas schwebt zentriert mit weichem Schatten und feinem Goldrand — das Design steht im Rampenlicht, alle Werkzeuge treten optisch zurück.
- **Drei-Zonen-Layout**: links schmale Werkzeugleiste (Vorlagen, Bildquellen, Text, Marke, Formen) als Icon-Rail mit Glass-Panels, mittig die Bühne, rechts ein kontextsensitiver Inspector, der nur zeigt, was zum ausgewählten Element gehört.
- **Varianten als Kinoreihe**: Die 4 KI-Vorschläge erscheinen als große Karten mit Gold-Glow beim Hover und weichem Cross-Fade beim Wechsel — Auswahl fühlt sich wie Casting an, nicht wie Radiobuttons.
- **Live-Generierungsdramaturgie**: Während die KI die Layouts baut, laufen Shimmer-Platzhalter in Postformat statt eines Spinners, mit kurzen Statuszeilen („Bildanalyse", „Typografie", „Markenfarben").
- **Glass & Gold Controls**: Glassmorphism-Panels, goldene Aktiv-Zustände, Mikro-Interaktionen (Snap-Feedback, sanftes Einrasten der Guides, 150–200 ms Übergänge), Tastenkürzel-Hinweise.
- **Slide-Filmstreifen**: Karussell-Slides als Filmstreifen unter der Bühne mit Drag-Sortierung, Nummerierung und Gold-Rahmen für den aktiven Slide.
- **Plattform-Kontext-Ansicht**: Umschalter zwischen „Bühne" und „Im Feed", der das Design in den bestehenden Instagram/LinkedIn/TikTok-Vorschauen zeigt.
- **Export-Moment**: Statt stiller Download-Button ein kurzer Reveal des fertigen Posts mit Gold-Sheen und direkten Aktionen (Mediathek, Kalender, Download).
- Mobil: Bühne oben, Werkzeuge als Bottom-Sheet, damit die Oberfläche auf dem Handy nutzbar bleibt.

Alle Farben und Effekte laufen über die bestehenden Design-Tokens in `index.css` — keine hartkodierten Farbklassen.

## Was gebaut wird


### 1. KI-Design-Engine
Neue Edge Function `generate-post-design`: nimmt Briefing, Bild, Plattform, Brand Kit und liefert 4 Design-Varianten als strukturiertes Layout-JSON (kein Bild-Rendering) — Hintergrundbehandlung, Textblöcke mit Position/Größe/Gewicht, Akzentformen, Logo-Slot, CTA-Badge. Die Varianten sind bewusst unterschiedlich: Bold Statement, Editorial, Split-Layout, Minimal Overlay.
Die Copy (Headline, Subline, CTA) kommt aus demselben Call, damit Text und Layout zusammenpassen.

### 2. Design-Schema + Renderer
Ein zentrales `PostDesign`-Schema (Slides → Layer: image, text, shape, logo, badge) und ein React-Renderer, der ein Design maßstabsgetreu in einem quadratischen Rahmen zeichnet. Derselbe Renderer bedient Vorschau, Varianten-Galerie und Export — kein zweiter Render-Pfad, damit WYSIWYG garantiert ist.

### 3. Canvas-Editor
Direkt-Manipulation auf der Vorschau: Layer anklicken, verschieben, skalieren; Inspector rechts für Text, Schriftgrad, Farbe (nur Brand-Palette + Neutrals), Ausrichtung, Deckkraft, Ecken. Snap-Guides zur Mitte und zu Sicherheitsrändern. Undo/Redo. Sicherheitszonen-Overlay für Plattform-UI.
Zusätzlich: „Neu würfeln" pro Layoutbereich, das nur die Anordnung ändert und Inhalte behält.

### 4. Bildquellen-Picker
Ein Dialog mit vier Tabs: Upload, Picture Studio (Prompt → KI-Bild über bestehende Bildgenerierung, Credits wie gehabt), Mediathek (vorhandene Assets), Stock. Für Stock wird die Pexels-API angebunden — dafür wird ein API-Key als Secret benötigt; bis der hinterlegt ist, bleibt der Tab deaktiviert mit Hinweis.
Bildbearbeitung im Editor: Ausschnitt verschieben/zoomen, Abdunkeln für Textlesbarkeit, optional Freisteller über den bestehenden Hintergrund-Entferner.

### 5. Vorlagen-Galerie
20–24 kuratierte Startvorlagen im Plattform-Stil (Angebot, Zitat, Vorher/Nachher, Tipp-Liste, Produkt-Launch, Testimonial, Event), gespeichert als Design-JSON. Beim Anwenden werden Brand-Farben, Logo und Schriften automatisch eingesetzt.

### 6. Karussell
Slide-Leiste unter der Canvas: Slides hinzufügen, duplizieren, sortieren, löschen. „Story-Fortsetzung" lässt die KI aus Slide 1 passende Folgeslides (Punkt 1..n + Abschluss-CTA) im selben Layout-Stil schreiben. Export als nummeriertes PNG-Set plus ZIP.

### 7. Speichern & Weiterverwenden
Designs werden pro Workspace gespeichert (bearbeitbar wieder aufrufbar), Export-PNGs landen in der Mediathek und lassen sich wie bisher an Kalender und Kampagnen übergeben.

## Technische Umsetzung

- Neue Tabelle `post_designs` (workspace_id, title, format, design JSONB, thumbnail_url, brand_kit_id) mit RLS über Workspace-Mitgliedschaft und expliziten GRANTs; Vorlagen in `post_design_templates` (global lesbar).
- Neue Edge Functions: `generate-post-design` (Layout+Copy, Lovable AI Gateway, `google/gemini-3.6-flash`, strukturierte Ausgabe gegen das Layout-Schema), `generate-carousel-slides` (Folgeslides). Bestehende `generate-post-v2` bleibt für den reinen Caption-Pfad erhalten.
- Frontend: `src/pages/PostDesigner.tsx` plus `src/components/post-designer/` (DesignCanvas, LayerInspector, VariantGallery, SlideStrip, ImageSourceDialog, TemplateGallery) und `src/lib/post-design/` (Schema, Defaults, Brand-Mapping, Export).
- Export mit `html-to-image` bei fixem 1080px-Renderziel (Renderer skaliert über CSS-Transform, Export rendert 1:1), damit Textkanten scharf bleiben. Paket wird ergänzt.
- Der bestehende Einstieg „KI Post-Generator" führt auf den neuen Designer; die Plattform-Vorschauen (Instagram/LinkedIn/X/TikTok/Facebook) bleiben und zeigen das exportierte Design im Feed-Kontext.
- Stock-Bilder brauchen einen `PEXELS_API_KEY` als Secret — wird beim Umsetzen angefragt.

## Reihenfolge

1. Schema, Tabellen, Renderer, Editor-Grundgerüst mit einem Test-Design
2. KI-Design-Engine + Varianten-Galerie
3. Bildquellen-Picker (Upload, Picture Studio, Mediathek; Stock nach Key)
4. Vorlagen-Galerie
5. Karussell + Export + Mediathek/Kalender-Anbindung
