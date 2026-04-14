

## Plan: Storytelling-Modus von Werbe-Logik befreien

### Problem
Der `generate-universal-script` Prompt ist für ALLE Kategorien identisch und enthält:
- **Szenentypen** wie `hook|problem|solution|feature|proof|cta` — reine Werbe-Terminologie
- **Regel 14**: "Die CTA-Szene MUSS die Website-URL enthalten" — auch für Geschichten
- **User-Prompt** enthält immer USPs, Kernproblem, Lösung, CTA-Text, gewünschte Aktion
- **Storytelling-Strukturen** wie "3-Akt" oder "Heldenreise" existieren, aber die Szenentypen bleiben `hook/cta`

### Lösung

**1. Edge Function `generate-universal-script/index.ts`**

- **Storytelling-spezifische Szenentypen** einführen: Statt `hook|problem|solution|feature|proof|cta` → `opening|rising_action|climax|falling_action|resolution|epilogue` (oder passend zur gewählten Struktur wie Heldenreise)
- **System-Prompt verzweigen**: Wenn `categoryKey === 'storytelling'`:
  - Regel 14 (CTA mit URL) entfernen
  - Keine USPs, kein "Produkt im Fokus"
  - Stattdessen: "Erzähle eine fesselnde Geschichte. Jede Szene baut emotionale Spannung auf. Kein Verkauf, keine Werbung."
  - Szenen-Badges werden erzählerisch: "Kapitel 1", "Der Wendepunkt" statt "HOOK"
- **User-Prompt verzweigen**: Für Storytelling die Marketing-Felder (USPs, CTA, gewünschte Aktion) weglassen und stattdessen Story-Felder nutzen: Protagonist, Konflikt, Setting, Botschaft, emotionaler Ton
- **Character-Logik anpassen**: Im Storytelling-Modus den Charakter als "Erzähler" positionieren, nicht als "Verkäufer mit Pointing-Geste"
- **Regel 12 (visualDescription)** beibehalten, aber den Kontext anpassen: cineastische Stimmungsbilder statt Produktumgebungen

**2. Betroffene Stellen im Detail**

| Bereich | Jetzt (Werbung) | Neu (Storytelling) |
|---------|-----------------|-------------------|
| Szenentypen | `hook, problem, solution, feature, proof, cta` | `opening, rising_action, climax, falling_action, resolution, epilogue` |
| Regel 14 | "CTA MUSS Website-URL enthalten" | Entfällt für Storytelling |
| Regel 11 | "Produkt in Szenen einbeziehen" | "Geschichte und Emotionen in Szenen einbeziehen" |
| Character-Geste | `pointing`, `celebrating` | `thinking`, `explaining`, `idle` |
| Szenen-Badge | "HOOK" | "Kapitel 1" / "Der Anfang" |
| User-Prompt | USPs, CTA-Text, gewünschte Aktion | Protagonist, Konflikt, Wendepunkt, Moral |

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/generate-universal-script/index.ts` | System-Prompt + User-Prompt Verzweigung für Storytelling, eigene Szenentypen, keine CTA-Pflicht |

### Ergebnis
- Storytelling-Videos erzählen tatsächlich eine Geschichte
- Keine "HOOK"-Badges, keine CTA-Szene mit URL
- Cineastische, emotionale Szenenfolge statt Verkaufs-Trichter
- Charakter agiert als Erzähler, nicht als Werbe-Figur

