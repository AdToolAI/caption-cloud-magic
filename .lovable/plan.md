

## Fix: Bilder in der Grid-Ansicht sichtbar machen

### Problem
Die `img`-Tags in den Grid-Karten haben nur `max-w-full max-h-full` aber kein `w-full h-full`. In einem Flex-Container mit `items-center justify-center` kann das Bild auf 0px kollabieren, bis es vollständig geladen ist — besonders mit `loading="lazy"`. Ergebnis: weiße Karten.

### Lösung

**`src/components/picture-studio/ImageCard.tsx`** (Zeile 61-65)
- `img` Klasse von `max-w-full max-h-full object-contain` auf `w-full h-full object-contain` ändern
- Das stellt sicher, dass das Bild den Container immer ausfüllt, auch während des Ladens

### Betroffene Datei
| Datei | Änderung |
|---|---|
| `src/components/picture-studio/ImageCard.tsx` | `img` Klassen: `w-full h-full object-contain` statt `max-w-full max-h-full object-contain` |

### Ergebnis
- Grid-Karten zeigen sofort das Bild an statt weißer Flächen
- Lightbox funktioniert weiterhin korrekt (ist unverändert)

