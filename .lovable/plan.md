

## Plan: Kategorie-spezifische Interview-Fragen + Storytelling-Inhaltstreue

### Probleme identifiziert

1. **Gleiche Einstiegsfragen für alle Modi**: Block 1 (Phasen 1-4) und Block 3 (Phasen 17-22) sind für ALLE 12 Kategorien identisch. Die erste Frage ist immer "Was ist der Hauptzweck deines Videos?" — egal ob Werbung oder Storytelling.

2. **System-Prompt nicht kategorie-sensitiv genug**: Die KI-Rolle ist immer "Video-Marketing-Berater und Kreativdirektor bei AdTool" — das lenkt die KI in Richtung Werbung, auch im Storytelling-Modus. Es fehlt eine kategorie-spezifische Rollenidentität.

3. **Frontend-Begrüßung identisch**: `consultantFirstQuestion` in translations.ts ist ein einzelner Key für alle Kategorien.

### Lösung

**1. Edge Function `universal-video-consultant/index.ts`**

- **Block 1 kategorie-spezifisch machen**: Statt universeller Fragen wie "Was ist der ZWECK?" bekommt jede Kategorie eigene Einstiegsfragen:
  - **Storytelling**: "Welche Geschichte möchtest du erzählen?", "Wer ist der Held?", "Welche Emotion soll der Zuschauer fühlen?"
  - **Advertisement**: "Welches Produkt/Service bewirbst du?", "Wer ist deine Zielgruppe?", "Was ist dein USP?"
  - **Tutorial**: "Was möchtest du deinen Zuschauern beibringen?", usw.

- **Kategorie-spezifische KI-Rolle** im System-Prompt:
  - Storytelling → "Du bist Max, ein erfahrener Geschichtenerzähler und Drehbuchautor"
  - Advertisement → "Du bist Max, ein erfahrener Werbe-Stratege"
  - Tutorial → "Du bist Max, ein erfahrener Bildungs-Content-Experte"
  - usw. für alle 12 Kategorien

- **Kategorie-Kontext im Prompt verstärken**: Explizite Anweisung, dass der Inhalt zur gewählten Kategorie passen MUSS (z.B. "Du erstellst eine GESCHICHTE, KEINE Werbung")

**2. Frontend `translations.ts`**
- Neue Translation-Keys pro Kategorie für die erste Frage: `uvc.consultantFirstQuestion_storytelling`, `uvc.consultantFirstQuestion_advertisement`, usw.

**3. Frontend `UniversalVideoConsultant.tsx`**
- Kategorie-spezifische erste Frage aus Translations laden statt generischem Key

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/universal-video-consultant/index.ts` | Block 1 kategorie-spezifisch, KI-Rolle pro Kategorie, Prompt-Verstärkung |
| `src/lib/translations.ts` | Neue Keys für kategorie-spezifische Einstiegsfragen (DE/EN/ES) |
| `src/components/universal-video-creator/UniversalVideoConsultant.tsx` | Kategorie-spezifische erste Frage laden |

### Ergebnis
- Storytelling-Modus stellt Geschichte-bezogene Fragen von Anfang an
- KI verhält sich wie ein Drehbuchautor, nicht wie ein Werbetexter
- Jeder Modus hat ein eigenes, passendes Interview-Erlebnis
- Alle 12 Kategorien bekommen individuelle Einstiegsfragen

