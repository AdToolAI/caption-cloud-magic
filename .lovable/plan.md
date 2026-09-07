# Fertiges Video kleiner anzeigen

## Problem

Nach dem Verbessern wird das Ergebnis über die volle Panelbreite gezeigt. Bei Hochkant-Videos (2160×3840) füllt das Bild dadurch mehrere Bildschirmhöhen und man muss scrollen, um Bedienleiste und die Angaben darunter zu sehen.

## Was geändert wird

Das Ergebnis-Video bekommt eine feste Anzeigehöhe statt voller Breite:

- Höhe auf maximal etwa 60 % der Fensterhöhe begrenzt (Obergrenze ca. 480 px), Breite passt sich automatisch an.
- Das Video wird mittig auf dunklem Hintergrund gezeigt, mit abgerundeten Ecken, ohne Beschnitt (kompletter Bildinhalt sichtbar).
- Bei Querformat bleibt es wie bisher, nur nie breiter als das Panel.
- Darunter unverändert: Zielabgleich, gelieferte Werte, Download.

## Technische Details

- Datei: `src/components/ai-video/EnhanceVideoPanel.tsx`, Ergebnisblock um Zeile 725.
- `<video className="w-full rounded-lg">` wird ersetzt durch einen zentrierten Container (`flex justify-center bg-black/40 rounded-lg`) mit `<video className="max-h-[min(60vh,480px)] w-auto max-w-full object-contain rounded-lg">`.
- Reine Darstellungsänderung: keine Anpassung an Preisen, Läufen, Provider-Logik oder gemessenen Werten.
