

## Plan: Auto-Recherche bekannter Produkte/Marken im Interview

### Problem
Wenn der Nutzer sagt "Ich möchte ein Werbevideo für Calvin Klein U2 erstellen", kennt die KI das Produkt bereits — stellt aber trotzdem Fragen wie "Was ist das Produkt?", "Beschreibe es", "Was ist die Zielgruppe?" etc. Bei bekannten Marken/Produkten ist das Zeitverschwendung. Die KI sollte ihr Wissen nutzen und diese Slots automatisch füllen.

### Lösung
Eine **Product Intelligence**-Schicht im System-Prompt, die die KI anweist, bei erkennbaren Produkten/Marken ihr Wissen einzusetzen und die Infos direkt zusammenzufassen, statt den Nutzer auszufragen.

### Änderungen

**`supabase/functions/universal-video-consultant/index.ts`**

1. **Product/Brand Detection vor dem AI-Call**: Neue Funktion `detectKnownEntity(messages)` die in den User-Nachrichten nach bekannten Marken/Produktnamen sucht (Calvin Klein, Nike, Apple, BMW, etc. — aber auch generische Muster wie "XY Parfüm", "XY App"). Wenn ein bekanntes Produkt erkannt wird, wird ein Flag + der Name an den System-Prompt übergeben.

2. **System-Prompt erweitern** — neuer Abschnitt `PRODUCT INTELLIGENCE`:
   - Wenn ein bekanntes Produkt/eine Marke erkannt wird: "Der Nutzer hat '[Produktname]' erwähnt. Du KENNST dieses Produkt. Fasse dein Wissen zusammen (Zielgruppe, USP, Markenidentität, Stil) und präsentiere es dem Nutzer zur Bestätigung. Stelle KEINE Fragen zu Informationen die du bereits weißt. Frage stattdessen: 'Ich kenne [Produkt] — stimmt das so? [Zusammenfassung]. Gibt es etwas das ich anpassen soll?'"
   - Dadurch werden mehrere Slots auf einmal als "vorgeschlagen" markiert
   - Der Nutzer muss nur bestätigen oder korrigieren statt alles selbst einzugeben

3. **Slot-Extraction verbessern**: Wenn die KI in ihrer Antwort selbst Informationen über das Produkt zusammenfasst (und der Nutzer bestätigt), zählen diese als gefüllte Slots. Dafür auch die AI-Nachrichten in `extractFilledSlots` einbeziehen (aktuell werden nur User-Nachrichten gescannt).

4. **Phase-Instruction anpassen**: Bei `userMessageCount === 0` (erste Nachricht) den Hinweis hinzufügen, dass die KI auch die bisherige System-Nachricht (mit Kategorie-Info) berücksichtigen soll — wenn der Nutzer schon in der ersten Nachricht ein konkretes Produkt nennt, soll die KI sofort recherchieren statt generisch zu begrüßen.

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/universal-video-consultant/index.ts` | Product Intelligence im Prompt, Slot-Extraction auf AI+User erweitern |

### Ergebnis
- Bei "Calvin Klein U2 Parfüm" fasst die KI sofort zusammen: Zielgruppe, USP, Markenwerte, visueller Stil
- Nutzer bestätigt nur noch und ergänzt individuelle Wünsche
- Interview verkürzt sich bei bekannten Produkten auf 4-8 Nachrichten statt 10-15
- Bei unbekannten Produkten funktioniert das Interview wie bisher

