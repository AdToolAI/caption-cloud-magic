# Picture Studio: Aufgabe zuerst, Modelle sichtbar

Neue Struktur nach Nutzer-Absicht — mit weiterhin sichtbaren Premium-Modellnamen als USP.

## Neue Hauptnavigation

Generate · Edit · Enhance · Background · Albums (Albums rückt in die Sekundärnavigation des Studios, nicht mehr gleichrangig)

- "Magic Edit" heißt künftig "Edit".
- "Batch" verschwindet als Haupttab und wird ein Umschalter **Einzeln / Serie** innerhalb von Generate. Bestehende Links mit `?tab=batch` und `?tab=magic-edit` leiten sauber auf die neuen Ziele um.

## Generate

Reihenfolge im Panel:
1. Prompt-Feld + Prompt-Helfer, darunter Schnellstarts (Produktanzeige, Porträt, Realistische Szene, Social Post, Food, Luxus, Illustration).
2. Umschalter Einzeln / Serie. In der Serie: saubere Zeilenzählung mit Live-Anzeige "3 Prompts erkannt" und nummerierter Liste. Der heutige Fehler "0 prompts detected" bei gefülltem Feld wird mitbehoben.
3. Modellkarten statt reiner Preisboxen: Name, "Am besten für", Tempo, Preis pro Bild — Seedream 4, Imagen 4 Ultra, Nano Banana 2 usw. aus der bestehenden Modell-Registry.
4. Stil und Format wie bisher.
5. Referenzbilder und Brand Kit als kompakte, ausklappbare Bereiche statt als optische Schwergewichte.

## Edit

Erst die Aktion wählen, dann arbeiten: Objekt entfernen, Bereich ersetzen, Inpaint, Bild erweitern, Stil ändern, Gesicht verbessern. Die vorhandene Magic-Edit-Logik wird auf diese Aktionsauswahl gehoben; Aktionen ohne bestehende Backend-Unterstützung erscheinen erst, wenn sie angebunden sind — keine Attrappen.

## Enhance (neu)

Oben das Ziel: Hochskalieren, Schärfen, Entrauschen, Restaurieren, Gesicht, Text/Produkt.
Darunter Modellkarten mit klarer Positionierung.

Wichtig zum Ist-Stand: angebunden ist heute ausschließlich **Clarity** (2× / 4×, aus der Bildvorschau heraus). **Topaz ist im Produkt nirgends integriert.** Dieser Plan baut Enhance als eigenen Bereich mit Clarity Pro als erster Karte und einem vorbereiteten Platz für Topaz. Die echte Topaz-Anbindung (Provider-Zugang, Preis, Marge, Guthaben-Abbuchung und Rückerstattung) ist ein eigener Schritt, den ich nach deiner Freigabe separat umsetze — sonst würde eine Karte etwas versprechen, was nicht rendert.

## Background

Bleibt eigener Bereich mit Hintergrund entfernen/ersetzen, Studio-Hintergrund, transparentes PNG.

## Nicht angefasst

Preise, Guthaben-Logik, Abrechnung, Video- und Lip-Sync-Wege. Alle neuen Texte in EN/DE/ES.

## Technisch

- `src/pages/PictureStudio.tsx`: Tabs neu, Redirect-Mapping alter `tab`-Parameter.
- `ImageGenerator.tsx`: Modus-Umschalter, Modellkarten, Quick-Presets, kollabierte Referenz-/Brand-Kit-Blöcke.
- `BatchGeneratePanel.tsx`: wird in Generate eingebettet, Prompt-Zählung korrigiert.
- `MagicEditPanel.tsx` → Edit mit vorgeschalteter Aktionsauswahl.
- Neu: `EnhancePanel.tsx`, das `useImageUpscaler` nutzt und Ziel + Modellkarten zeigt.
- Neue Strings in `src/lib/translations*` in allen drei Sprachen.
