
## Plan: Produkt-Werbung mit Pflicht-Bildupload, kreativeren Drehbüchern & KI-Bildbearbeitung

### Kernidee
Der Produkt-Ad-Modus bekommt einen Pflicht-Bildupload (min. 4 Produktfotos), gezieltere Interview-Fragen, kreativere Skript-Generierung und KI-gestützte Bildbearbeitung, damit die Produktfotos zum jeweiligen Szenen-Drehbuch passen.

### Umsetzung

**1. Bildupload-Schritt im Wizard** (`UniversalVideoWizard.tsx`)
- Neuen Schritt "Produktbilder" vor dem Consultation-Schritt einfügen (nur wenn Kategorie `product-video` oder `advertisement`)
- `MultiImageUpload`-Komponente nutzen mit `minFiles=4`, `maxFiles=10`
- Bilder werden in den Supabase Storage Bucket `media-assets` hochgeladen
- Upload-URLs werden als `productImages: string[]` in `UniversalConsultationResult` gespeichert

**2. Type-Erweiterung** (`src/types/universal-video-creator.ts`)
- `UniversalConsultationResult` um `productImages?: string[]` erweitern

**3. Interview-Fragen verschärfen** (`universal-video-consultant/index.ts`)
- `product-video` Block 1 + Block 2 Fragen komplett überarbeiten:
  - Block 1: Produktname & USP, Zielgruppe mit Pain Points, emotionale Transformation, Wettbewerbs-Vorteil
  - Block 2: Neue kreative Fragen wie:
    - "Welche EMOTIONALE REAKTION soll der Zuschauer beim Anblick deines Produkts haben?"
    - "Beschreibe eine ALLTAGSSZENE in der dein Produkt den entscheidenden Unterschied macht"
    - "Was würde ein BEGEISTERTER KUNDE über dein Produkt in 10 Sekunden sagen?"
    - "Welchen FILMISCHEN STIL stellst du dir vor? (Apple-like minimal, Nike-energetisch, Luxury-elegant)"
    - "Gibt es ein UNBOXING- oder REVEAL-MOMENT den wir dramatisch inszenieren können?"

**4. Kreativere Skript-Generierung** (`_shared/generate-script-inline.ts`)
- Für `product-video`: System-Prompt mit expliziter Anweisung zur Kreativität:
  - "Generiere NIEMALS zweimal das gleiche Drehbuch-Schema. Variiere zwischen: Unboxing-Reveal, Lifestyle-Montage, Problem-Lösung-Transformation, Mini-Story, Vorher-Nachher, Slow-Motion-Showcase, POV-Perspektive"
  - Kreative Szenentypen: `reveal`, `lifestyle`, `detail-closeup`, `transformation`, `testimonial-quote`, `feature-showcase`
  - Produktbilder-URLs in den Prompt einbauen mit Anweisung: "Nutze die hochgeladenen Produktfotos als Basis für die Szenen"

**5. KI-Bildbearbeitung für Produktfotos** (`auto-generate-universal-video/index.ts`)
- Neuer Pipeline-Schritt nach Script-Generierung: "Produktbilder anpassen"
- Für jede Szene die ein Produktbild nutzt:
  - `generate-premium-visual` mit dem Produktbild als Referenz aufrufen (Image-Editing-Modus via Lovable AI Gemini Image Model)
  - Prompt: "Platziere dieses Produkt in folgendem Setting: [visualDescription der Szene]. Stil: [visualStyle]. Beleuchtung: [szenen-spezifisch]"
- Fallback: Wenn Bildbearbeitung fehlschlägt, Originalbild verwenden

**6. Szenen-zu-Bild-Zuordnung** (`auto-generate-universal-video/index.ts`)
- Script-Generator bekommt `availableProductImages: number` als Info
- Jede Szene bekommt ein `sourceProductImageIndex` Feld (0-basiert)
- Pipeline nutzt das Originalbild + KI-Enhancement statt komplett generierter Bilder

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/types/universal-video-creator.ts` | `productImages?: string[]` zu ConsultationResult |
| `src/components/universal-video-creator/UniversalVideoWizard.tsx` | Bildupload-Schritt, Upload-Logik, Validierung min 4 |
| `supabase/functions/universal-video-consultant/index.ts` | Product-Video Fragen überarbeiten |
| `supabase/functions/_shared/generate-script-inline.ts` | Kreativere Prompts, Szenen-Variation, Produktbild-Referenzen |
| `supabase/functions/auto-generate-universal-video/index.ts` | KI-Bildbearbeitung Pipeline-Schritt, Bild-Zuordnung |

### Ergebnis
- Nutzer laden mindestens 4 Produktfotos hoch
- Interview-Fragen sind gezielter und holen mehr kreative Infos
- Jedes generierte Video hat ein einzigartiges Drehbuch (nicht immer gleicher Ablauf)
- Produktfotos werden per KI in die passende Szene eingebettet (richtiges Setting, Beleuchtung, Stimmung)
- Bilder passen genau zum Drehbuch statt generische Stock-Bilder
