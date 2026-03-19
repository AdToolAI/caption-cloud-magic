

# Phase 11: Praezises Drehbuch mit detaillierten Szenen-Beschreibungen

## Problem

Das Drehbuch gibt dem KI-Bildgenerator nur vage `visualDescription`-Anweisungen wie "Beschreibung des Bildes: Was sieht man?". Das fuehrt zu generischen Bildern (Skylines, abstrakte Icons), die nicht zum Voiceover oder Produkt passen. Der Produktkontext (Name, Beschreibung, Website) fliesst nicht in den Bild-Prompt ein.

## Loesung: Drehbuch als Single Source of Truth

Das Drehbuch wird zum vollstaendigen Regieplan erweitert — jede Szene bekommt eine **praezise Bild-Anweisung** die direkt als Flux-Prompt verwendbar ist, plus den exakten Voiceover-Text.

### Aenderung 1: Script-Generator verschaerfen (`generate-universal-script/index.ts`)

**System-Prompt erweitern** — die `visualDescription` wird von einer vagen Beschreibung zu einem konkreten KI-Bild-Prompt:

```text
// VORHER (Zeile 456):
"visualDescription": "Beschreibung des Bildes: Was sieht man? Welche Elemente? Welcher Stil?"

// NACHHER:
"visualDescription": "KONKRETER KI-Bild-Prompt in Englisch. 
  Beschreibe eine spezifische Szene die zum Voiceover passt. 
  Format: [Subjekt] + [Aktion/Zustand] + [Umgebung] + [Licht/Stimmung]
  Beispiel: 'A marketing professional reviewing colorful campaign 
  analytics on a large monitor, modern bright office, warm natural 
  light through floor-to-ceiling windows, shallow depth of field'
  NICHT: 'Digitale Welt' oder 'Social Media Icons'"
```

**Neue Regeln** im System-Prompt hinzufuegen:

```text
10. Die visualDescription MUSS auf Englisch sein (fuer Flux-Bildgenerierung)
11. Die visualDescription MUSS eine KONKRETE Szene beschreiben die zum 
    Voiceover passt — nicht abstrakt, sondern wie ein Filmstill
12. Beziehe das Produkt/Unternehmen "${briefing.companyName || briefing.productName}" 
    in die Szenen ein — zeige realistische Nutzungssituationen
13. Jede visualDescription folgt dem Schema: 
    [WER/WAS] + [TUT WAS] + [WO] + [WIE BELEUCHTET/GESTIMMT]
```

### Aenderung 2: Produktkontext in Bild-Prompt (`auto-generate-universal-video/index.ts`)

Den Produktkontext aus dem Briefing direkt in den Flux-Prompt einweben, damit das Modell weiss worum es geht:

```typescript
// NEU: Produktkontext als Prompt-Prefix
const productContext = briefing.productDescription
  ? `Context: "${briefing.companyName || briefing.productName || 'digital product'}" - ${briefing.productDescription.slice(0, 120)}. `
  : '';

// Anti-Text als kurzes Suffix statt langer Prefix
const antiTextSuffix = 'No text, no letters, no words in image. Numbers on charts allowed.';

const prompt = attempt === 0
  ? `${productContext}${scene.visualDescription}. ${categoryHint}. ${sceneHint}. ${aspectHint}. ${antiTextSuffix}`
  : `${productContext}Abstract professional ${sceneType} scene. ${categoryHint}. ${aspectHint}. ${antiTextSuffix}`;
```

**Wichtig:** Anti-Text-Regeln werden von langem Prefix zu kurzem Suffix verschoben, damit der eigentliche Bildinhalt die volle Aufmerksamkeit des Modells bekommt.

### Aenderung 3: Anti-Text in `generate-premium-visual/index.ts` ebenfalls kuerzen

Gleiche Logik: Anti-Text-Anweisung kuerzen und ans Ende verschieben, statt den Prompt-Anfang zu dominieren.

---

## Zusammenfassung

| Datei | Aenderung |
|-------|----------|
| `generate-universal-script/index.ts` | `visualDescription` auf Englisch + konkret + Produkt-bezogen erzwingen |
| `auto-generate-universal-video/index.ts` | Produktkontext injizieren, Anti-Text als kurzes Suffix |
| `generate-premium-visual/index.ts` | Anti-Text kuerzen, ans Ende verschieben |

Kein S3-Redeploy noetig — nur Edge Function Deployment.

