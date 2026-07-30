## Exakter Fehler

Du hast recht: In der auswählbaren Bibliothek sind aktuell tatsächlich nur sechs Karten erreichbar und man kann nicht nach unten scrollen.

Die Backend-Abfrage habe ich mit exakt den Parametern des Screenshots direkt ausgeführt:

- `language: de`
- `nativeOnly: true`
- `pageSize: 60`
- Ergebnis: `total: 3405`, `hasMore: true`
- Der Response enthält auf Seite 1 bereits die Premium-Stimmen plus zahlreiche Community-Stimmen.

Damit ist ausgeschlossen, dass nur sechs Stimmen geladen werden. Sie werden geladen, aber die UI schneidet sie ab.

Der konkrete Codefehler liegt in `UniversalVoiceLibraryPicker.tsx`:

- Der Dialog ist `flex flex-col` mit begrenzter Höhe.
- Die Ergebnisliste ist eine Radix `ScrollArea` mit `flex-1`, aber ohne `min-h-0` und ohne stabile Höhenbegrenzung.
- In einem Flex-Container behält sie dadurch ihre automatische Mindesthöhe, wächst mit dem Inhalt und wird vom Dialog nach der dritten Kartenzeile abgeschnitten.
- Da der Scroll-Viewport keine berechnete Resthöhe bekommt, entsteht kein bedienbarer vertikaler Scrollbereich.
- Der Infinite-Scroll-Sentinel liegt im abgeschnittenen Bereich und kann nie sichtbar werden; deshalb werden auch keine weiteren Seiten nachgeladen.

Das entspricht einem bekannten Radix-ScrollArea-/Flex-Layout-Problem: Flex-Kinder benötigen hier `min-height: 0` beziehungsweise eine explizit begrenzte Scrollhöhe.

## Umsetzung

### 1. Dialoglayout reparieren
- `DialogContent`: stabile responsive Höhe statt nur `max-height`, weiterhin innerhalb des Viewports.
- Header, Filter und Footer erhalten `shrink-0`.
- Der mittlere Listencontainer erhält `min-h-0 flex-1 overflow-hidden`.
- `ScrollArea` erhält `h-full min-h-0` und einen permanent sichtbaren vertikalen Scrollbalken mit ausreichendem Kontrast.

### 2. Nachladen ausfallsicher machen
- Infinite Scroll bleibt erhalten.
- Zusätzlich erscheint am Ende ein sichtbarer Button „Weitere Stimmen laden“, sodass Seite 2 auch dann erreichbar ist, wenn der Intersection Observer ausfällt.
- Anzeige „60 von 3.405 geladen“ macht den Zustand eindeutig.

### 3. Separaten Kategoriefehler beheben
Der erste Screenshot mit „Erzähler & Hörbuch“ zeigte nur acht Treffer, weil die UI falsche `use_case`-Werte sendet. Diese werden an die vorhandenen Datenwerte angepasst:

- Erzähler: `narrative_story`
- Charaktere: `characters_animation`
- Nachrichten: `informative_educational`
- Werbung: `advertisement` und `social_media`

### 4. Verifikation
- Deutsch + Nur nativ + Alle Stimmen: mehr als sechs Karten sichtbar, vertikal scrollbar.
- Bis über die ersten 60 Stimmen scrollen und weitere Seite laden.
- Kategorien zeigen ihre vollständigen Bestände statt nur der Premium-Stimmen.
- Stimme aus einer späteren Seite auswählen, Dialog erneut öffnen und Auswahl/Persistenz prüfen.

## Betroffene Dateien
- `src/components/voices/UniversalVoiceLibraryPicker.tsx`
- `src/lib/voice-categories.ts`
- `src/hooks/useVoiceLibrary.ts`
- `supabase/functions/list-voices/index.ts`

Keine Migration und kein neuer Stimmen-Sync nötig.