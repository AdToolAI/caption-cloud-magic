# Post Designer: KI-Bild kommt nicht im Editor an

## Was tatsächlich passiert

Das Picture Studio arbeitet. Der letzte Lauf (22:21 UTC) ist in den Funktionslogs erfolgreich durchgelaufen (`Success with model: google/gemini-2.5-flash-image`), das Bild wurde erzeugt, in den öffentlichen Speicher geschrieben und eine URL zurückgegeben.

Verloren geht das Bild danach im Frontend:

- Die Bildgenerierung startet erst **nachdem** die Varianten sichtbar sind, und schreibt das Ergebnis ausschließlich in die Varianten-Liste.
- Wer in dieser Zeit (rund 15 Sekunden) eine Variante anklickt, arbeitet im Editor mit einer Kopie **ohne** Bild. Genau das zeigt der Screenshot: die Bild-Ebene existiert, ist aber leer (Streifenmuster).
- Es gibt während der Bildgenerierung keinen sichtbaren Hinweis, dass noch ein Motiv unterwegs ist — der Zustand wirkt „fertig, aber ohne Bild“.

Nebenbefund im selben Screenshot: In der Headline steht ein literales `\n` („Verdopple deine\nAd Performance“). Der Zeilenumbruch aus der KI-Antwort wird als Text durchgereicht statt umgebrochen.

## Was geändert wird

### 1. Bild nachträglich in das offene Design spiegeln
Das fertige Motiv wird nicht nur in die Varianten, sondern auch in das gerade geöffnete Design geschrieben — sofern der Nutzer dort noch kein eigenes Bild gesetzt hat. Damit ist es egal, wann jemand eine Variante anklickt.

### 2. Sichtbarer Motiv-Status
- In der Varianten-Galerie und im Editor ein dezenter Hinweis „Motiv wird erzeugt …“, solange die Bildgenerierung läuft.
- Bild-Ebenen ohne Quelle zeigen währenddessen einen ruhigen Ladezustand statt des Streifenmusters.
- Schlägt die Generierung fehl, erscheint eine klare Meldung mit Schaltfläche „Motiv erneut erzeugen“ statt eines still leeren Layouts.

### 3. Bild früher anstoßen
Die Bildanfrage wird parallel zur Copy-Generierung gestartet, nicht danach — das verkürzt die Lücke, in der noch kein Motiv da ist.

### 4. Zeilenumbruch-Fix
Literale `\n`-Sequenzen aus der KI-Antwort werden beim Aufbau der Textebenen in echte Umbrüche gewandelt.

## Technische Umsetzung

- `src/pages/PostDesigner.tsx`
  - `generateImage`-Ergebnis zusätzlich über `setDesign(...)` in die aktive Slide spiegeln (`setSlideImage`), geschützt durch ein Flag „Nutzer hat Bild manuell gesetzt“.
  - Bildanfrage aus `handleGenerate` als eigenständige Promise vor/parallel zum `generate-post-design`-Aufruf starten; Prompt-Fallback auf das Briefing, Verfeinerung mit `copy.imagePrompt`, sobald die Copy da ist.
  - `imageBusy` an `VariantGallery` und den Editor-Kopf durchreichen; Fehlerzustand `imageError` mit Retry-Aktion (nutzt `handleRethinkImage`).
- `src/components/post-designer/SlideRenderer.tsx`: Platzhalter der Bildebene um optionalen `pending`-Zustand (weiches Puls-Overlay) erweitern.
- `src/components/post-designer/VariantGallery.tsx`: Statuszeile über dem Raster, wenn das Motiv noch generiert wird.
- `src/lib/post-design/brand.ts` bzw. Variantenaufbau: Text-Normalisierung (`replace(/\\n/g, "\n")`) beim Befüllen der Textebenen.

Keine Änderungen an der Edge Function `generate-studio-image` — sie liefert korrekt.
