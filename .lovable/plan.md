Ich behebe das Dialog-Layout des Ad Director Mode so, dass keine Felder mehr unten abgeschnitten werden und alle Schritte zuverlässig scrollbar sind.

Umsetzung:
1. Dialog-Höhe stabilisieren
   - Den Ad-Director-Dialog auf eine feste, viewport-basierte Höhe setzen statt nur `max-h`.
   - Dadurch bekommt der mittlere Inhaltsbereich eine echte berechenbare Höhe.

2. Header, Fortschrittsleiste und Footer fix lassen
   - Header und Step-Indikator bleiben oben.
   - Zurück/Weiter bzw. Spot-generieren bleiben unten sichtbar.
   - Nur der eigentliche Schritt-Inhalt scrollt.

3. ScrollArea korrekt für Flex-Layouts machen
   - `ScrollArea` mit `min-h-0`, `overflow-y-auto` und ausreichendem Bottom-Padding ausstatten.
   - Den inneren Content ebenfalls mit Bottom-Padding versehen, damit die letzten Karten/Felder nicht vom Footer verdeckt werden.

4. Alle betroffenen Schritte abdecken
   - Story-Framework
   - Tonalität / Schritt 3 inklusive Joyful und Trustworthy
   - A/B Script-Varianten
   - Kampagnen-Skalierung
   - Compliance / Zusammenfassung

Technische Details:
- Hauptänderung in `src/components/video-composer/AdDirectorWizard.tsx`.
- Voraussichtlich Änderung von:
  - `DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"`
  - `ScrollArea className="flex-1 min-h-0 pr-2"`
- Zielstruktur:
```text
DialogContent: h-[min(92vh,...)] overflow-hidden flex flex-col
  Header: shrink-0
  Progress: shrink-0
  ScrollArea: flex-1 min-h-0 overflow-y-auto
    Step content: pb-large
  Footer: shrink-0
```

Nach der Änderung sollten alle Felder in jedem Schritt sichtbar bzw. per Scroll erreichbar sein, ohne unten abgeschnitten zu werden.