

## Plan: "Magische Weihnachten" Text-Overlay entfernen

### Was wird gemacht
Der Text-Overlay am unteren Rand des Videos in der GadgetCard (Hero-Bereich) wird entfernt — betrifft alle Sprachen.

### Änderungen

**Datei: `src/components/landing/GadgetCardDynamic.tsx`**

1. Die `postTitle`-Eigenschaft aus allen drei Sprach-Objekten entfernen (Zeilen 200, 206, 212)
2. Das Overlay-Element (Zeilen 355–358) entfernen — der Gradient-Overlay und der `postTitle`-Text am unteren Videorand

### Ergebnis
Das Video wird ohne Text-Overlay angezeigt — cleaner Look.

