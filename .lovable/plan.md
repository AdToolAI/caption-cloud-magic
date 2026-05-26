# Picture Studio — Klarheit, Kosten-Schutz & Prompt-Generator

## Das Problem (was du gesehen hast)

Im Picture Studio gibt es **zwei verschiedene Bild-Slots**, die nebeneinander existieren:

1. **Style Reference** *(Fast/Ultra)* — übernimmt nur Farbe/Stimmung
2. **Image-to-Image Toggle** — nimmt das Bild als Vorlage

Drei Probleme:
- **Verwirrend:** Zwei Slots gleichzeitig, niemand weiß was was tut.
- **Modell-Mismatch:** Du hattest **Pro (Imagen 4 Ultra)** — Imagen kann kein gutes i2i mit so vielen Personen. Nano Banana 2 (Ultra) wäre richtig.
- **Schwacher Prompt:** "Please make a detailed realistic Scene out of it" sagt dem Modell nicht, **was** es behalten soll (Komposition, Personen, Licht, Hügel im Hintergrund, Kreuze in der Mitte). Ohne diese Details halluziniert jedes Modell — wie dein "Elara Vance"-Grabstein zeigt.

Drei Hebel, einer ist der wichtigste: **der Prompt**.

## Was ich ändern möchte

### 1. Aus zwei Slots wird **eine Modus-Wahl**

3-Wege-Switch oben:
```text
[ Neues Bild ]   [ Bild verwandeln (i2i) ]   [ Stil übernehmen ]
   Text → Bild     Dein Bild als Vorlage      Farben/Mood aus Ref
```
Pro Modus nur **ein** Upload-Slot, nie beide.

### 2. **Smart Model Picker** — modus-abhängig

Modelle die im gewählten Modus schwach sind werden ausgegraut, mit Vorschlag "Auf Nano Banana 2 wechseln? *($0.20 statt $0.32 für besseres Ergebnis)*". Keine Blockade, nur Hinweis.

### 3. **Universeller Prompt-Generator** ⭐ (Kern-Feature)

Über dem Prompt-Feld ein neuer Button: **"✨ Prompt-Helfer"** (öffnet ein Dialog).

**Wie er funktioniert:**

1. **Eingabe-Box:** "Sag mir mit deinen Worten was du willst" *(beliebige Sprache, beliebige Länge)*
   - Beispiel-Input: *"Mach das Bild rechts realistisch und detailliert"*

2. **Wenn ein Referenzbild da ist → wird es mitanalysiert** *(Gemini 2.5 Flash Vision, einmaliger Call, ~$0.001)*
   - Modell sieht: Hügel, Kreuze, Menschenmenge, Sandboden, Zypressen, Licht
   - Modell weiß: User will diese Szene **erhalten**, nur Stil ändern

3. **Optionale Schnell-Filter** (Chips, kein Pflichtfeld):
   - Ziel: *Werbung · Social · Portrait · Szene · Produkt · Kunst · Sonstiges*
   - Stil: *Fotorealistisch · Cinematisch · Illustration · 3D · Anime · Aquarell · …*
   - Stimmung: *Episch · Ruhig · Dramatisch · Hell · Düster · …*
   - Auf Wunsch leer lassen — die KI rät aus dem Referenzbild + Text

4. **Output:** EIN englischer Master-Prompt nach bewährter Photo-Struktur:
   ```text
   [Subject] + [Composition preserved from reference] + [Style] +
   [Lighting] + [Camera/Lens] + [Detail level] + [Negative hints]
   ```
   Plus 2 kürzere Alternativ-Varianten zum Vergleich.

5. **Auto-Empfehlung mitgeliefert:** Welches Modell + welcher Modus + welche Strength am besten passt. **Ein Klick** übernimmt alles ins Hauptformular.

**Warum universell:** Der Generator kennt **alle 4 Modelle** (Gemini, Seedream, Imagen, Nano Banana 2), ihre Stärken/Schwächen und ihre Prompt-Eigenheiten. Für Imagen formuliert er anders als für Nano Banana — gleicher User-Wunsch, modell-optimierter Output.

**Wo er sonst noch hin kann (Phase 2):** Der `generatePrompt`-Edge-Function-Endpoint ist generisch — kann später vom AI Video Toolkit, Composer und Magic Edit wiederverwendet werden (1 Function, viele Konsumenten).

### 4. **Pre-Flight-Check** vor dem Generate-Klick

Kleiner Banner über dem Button wenn etwas riskant:
- "⚠️ 50+ Personen im Referenzbild + Imagen 4 = oft halluziniert. Nano Banana 2 nehmen?"
- "💡 4 Varianten = $0.32. Mit 1 Variante starten und nur skalieren wenn das Ergebnis stimmt."
- "💡 Dein Prompt ist sehr kurz — Prompt-Helfer öffnen?"

### 5. **Strength-Slider für i2i** (nur i2i-Modus)
0 % = Original fast unverändert, 100 % = nur Inspiration. Default 70 %. Genau dein Pain Point — du wolltest "das Bild rechts" mit minimaler Veränderung.

### 6. **"Realistic Reproduction"-Ein-Klick** (i2i-Modus)
Setzt automatisch: Nano Banana 2 + Strength 40 % + Realistisch-Style + Prompt-Suffix `"photorealistic, ultra-detailed, preserve composition and all subjects from reference"` + 1 Variante.

## Technische Details

- **Neue Edge Function:** `generate-image-prompt` — Input: `{ userText, referenceImageUrl?, targetModel, mode, optionalFilters }` — Output: `{ masterPrompt, alternatives[], recommendedModel, recommendedMode, recommendedStrength, reasoning }`. Nutzt Lovable AI Gateway mit `google/gemini-3-flash-preview` (Vision-fähig, günstig, gut im Strukturieren).
- **Neue Komponente:** `src/components/picture-studio/PromptHelperDialog.tsx`
- **`ImageGenerator.tsx` Refactor:** `editMode: boolean` → `mode: 'create' | 'transform' | 'restyle'`
- **Neue Komponente:** `src/components/picture-studio/PreflightCheck.tsx`
- **Modell-Capabilities-Map:** `src/config/pictureStudioModels.ts` (welches Modell kann i2i wie gut, Prompt-Style, optimale Use-Cases)
- **`imageGeneratorCache.ts`** erweitern um `mode` und `strength`
- **Strength** wird an `generate-image-v2` durchgereicht — Modelle die es nicht unterstützen ignorieren es (kein Breaking Change)

## Was **nicht** angefasst wird
- Magic Edit Tab, Album-Manager, Batch-Generate
- Bestehende Bilder & Backend-Tables
- RLS & Storage

## Erwartetes Ergebnis für deinen Fall
1. Du wählst **"Bild verwandeln"**, lädst die Kreuzigungs-Szene hoch.
2. Klick auf **"✨ Prompt-Helfer"**, tippst: *"realistisch und detailliert"*.
3. Helfer analysiert das Bild, schlägt vor: **Nano Banana 2 + Strength 35 %** mit Prompt:
   > *"Cinematic photorealistic recreation of the crucifixion scene from reference: preserve all 50+ figures, three crosses on the hilltop, Jerusalem skyline in background, cypress trees, sandy terrain, period-accurate Roman and Judean garments. 85mm lens, golden-hour side-lighting, ultra-detailed faces, shallow depth of field, IMAX color grading. Composition identical to reference."*
4. Ein Klick → übernommen → generiert → **$0.20 für 1 Variante** statt $0.32 für 4 Fehlversuche.

Sag Bescheid wenn ich starten soll, oder ob einzelne Punkte raus/anders sollen.