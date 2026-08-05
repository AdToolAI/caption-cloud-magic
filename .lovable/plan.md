# Post Designer: garantiert textfreie Motive

## Was der Screenshot zeigt

Die Motive enthalten weiterhin gebackene Schrift ("AdTool AI") und bildschirmähnliche UI-Elemente. Die Textverbote stehen zwar schon im Prompt, greifen aber nicht zuverlässig, weil:

- Der Motivkern selbst UI/Screens/Marken beschreibt (Dashboards, Tablets, Displays) — Bildmodelle füllen solche Flächen fast immer mit Fake-Schrift.
- Die Bild-Funktion hängt hinter den Prompt noch einen eigenen Stil-Zusatz und `Aspect ratio: …`. Die Verbote landen dadurch in der Mitte des Prompts, wo sie am schwächsten wirken.
- Es gibt keine Prüfung: kommt trotzdem ein Motiv mit Schrift zurück, wird es unverändert übernommen.

## Was geändert wird

### 1. Motivkern wird textfrei erzwungen
Marken-, Produkt- und Screen-Begriffe werden aus dem Motivkern entfernt bzw. neutralisiert, bevor der Prompt gebaut wird: keine Bildschirminhalte, keine Tablets/Laptops mit sichtbarer Anzeige, keine Schilder, keine Verpackungen mit Aufdruck. Stattdessen Menschen, Hände, Räume, Licht, Textur, Material.

### 2. Verbote ans Prompt-Ende, in Großform
Der Negativ-Block steht künftig als letzter, klar abgesetzter Absatz — direkt nach dem Motiv und nach dem Stil-Zusatz. Die Bild-Funktion bekommt dafür ein Kennzeichen "textfrei", damit sie den Stil-Zusatz vor die Verbote setzt und nicht dahinter.

### 3. Automatische Nachkontrolle
Nach der Generierung prüft ein schneller Check das erzeugte Motiv auf sichtbaren Text. Wird Schrift erkannt, wird genau einmal automatisch neu erzeugt — mit verschärftem Prompt (leere Flächen, keine Objekte mit Beschriftung). Erst danach greift der bestehende Fehler-/Retry-Zustand.

### 4. Zusätzliche Absicherung im Layout
Da Motive jetzt bewusst ruhig sind, bleibt die Negativraum-Zone erhalten und der Scrim hinter Textblöcken wird nur noch dort gezeichnet, wo er wirklich gebraucht wird — das Ergebnis wirkt weniger "überdeckt".

## Technische Umsetzung

- `src/lib/post-design/imagePrompt.ts`
  - `sanitizeSubject()`: entfernt Marken-/Produktnamen und Screen-Begriffe (`screen`, `display`, `dashboard`, `UI`, `interface`, `sign`, `poster`, `label`, `packaging`, `billboard`, `logo`) aus dem Motivkern und ersetzt sie durch neutrale Umschreibungen.
  - Prompt-Reihenfolge: Motiv → Zone → `TEXT-FREE MANDATE` als letzter Absatz (Großbuchstaben, wiederholt: no text, no letters, no numbers, no logos, no signage, no screens with content, no watermark).
  - Neuer Parameter `strict?: boolean` für den Wiederholungsversuch (zusätzlich: blank surfaces, turned-off screens, unbranded objects).
- `supabase/functions/generate-studio-image/index.ts`
  - Neues optionales Feld `textFree: true`: Stil-Zusatz und `Aspect ratio` werden dann VOR den Prompt-Schluss gesetzt, sodass der Negativ-Block zuletzt steht; zusätzlich systemseitiger Satz "Do not render any text of any kind."
- `supabase/functions/generate-post-design/index.ts`
  - Systemanweisung für `imagePrompt` schärfen: nur Menschen/Umgebung/Licht/Material; explizit verboten sind Bildschirme mit Inhalt, Geräte-Displays, Schilder, Verpackungen, Marken- und Produktnamen.
- `src/pages/PostDesigner.tsx`
  - `generateImage(prompt, { textFree: true })`; nach Erhalt Textprüfung, bei Treffer ein einziger automatischer Neuversuch mit `strict: true`.
  - Neuer Helfer `src/lib/post-design/detectImageText.ts`: lädt das erzeugte Bild in ein Canvas und erkennt schriftverdächtige Regionen über Kantendichte in kleinen Kacheln (kein zusätzlicher KI-Call, keine Kosten).
- `src/components/post-designer/SlideRenderer.tsx`: Scrim nur unter Textblöcken zeichnen, die tatsächlich über dem Bildbereich liegen.
