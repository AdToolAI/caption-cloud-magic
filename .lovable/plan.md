## Ziel
Der Production-Plan-Dialog darf unten nicht mehr abgeschnitten werden. Inhalt und Footer sollen innerhalb des Modals bleiben; die Szenenliste soll zuverlässig scrollbar sein.

## Änderungen
1. **Dialog-Höhe stabilisieren**
   - `ProductionPlanSheet` bekommt eine feste viewport-basierte Höhe statt nur `max-h`.
   - Mobile/kleinere Viewports werden mit `h-[calc(100dvh-...)]` berücksichtigt.

2. **Footer fix im Dialog halten**
   - Header und Footer bleiben sichtbar.
   - Nur der mittlere Review-Bereich scrollt.
   - Footer bekommt `shrink-0`, damit er nicht den Inhalt überlappt oder unten abgeschnitten wird.

3. **ScrollArea korrekt begrenzen**
   - Review-Bereich bekommt eine explizite `min-h-0`/`overflow-hidden`-Wrapper-Struktur.
   - Die Radix-ScrollArea bekommt `h-full`, damit der interne Viewport wirklich scrollt.
   - Unten wird etwas Padding eingefügt, damit die letzte Szene/Negative Prompt nicht unter dem Footer verschwindet.

4. **Kompakter, aber lesbar**
   - Szenenkarten bleiben kompakt.
   - Kein Eingriff in Briefing-Analyse, Sprache, Storyboard-Logik oder Lip-Sync-Pipeline.

## Technische Dateien
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx`

## Validierung
- Dialog bei ca. `1175x758` prüfen.
- Sicherstellen, dass man bis zu Voiceover/Captions/Negative Prompt/Unresolved scrollen kann.
- Sicherstellen, dass die Buttons `Zurück` und `Plan anwenden` immer sichtbar bleiben.