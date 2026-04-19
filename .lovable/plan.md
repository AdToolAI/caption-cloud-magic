

## Plan: „Nächster Post"-Pill mit Zweizeilen-Layout + Detail-Dialog

### Ziel
1. Der Pill „Nächster Post: Kein Post gepl..." wird nicht mehr abgeschnitten — Text wird vollständig in **zwei Zeilen** angezeigt.
2. Klick auf den Pill öffnet einen **Dialog** (Modal) mit allen Details zum nächsten geplanten Post. Nutzer bleibt auf der Home-Seite.

### Befund
- Der Pill liegt aktuell in `src/components/dashboard/DashboardVideoCarousel.tsx` (Komponente `StatusPills`).
- Aktuell `h-7` mit Single-Line-Text → wird bei langem Inhalt visuell abgeschnitten.
- Es existiert noch kein Detail-Dialog für den nächsten Post.

### Umsetzung

**1. Pill-Layout auf Zweizeilen umbauen** (`StatusPills` in `DashboardVideoCarousel.tsx`)
- Aus `<span>` wird ein `<button>` (klickbar).
- Höhe `h-7` → flexibel (`min-h-[2.75rem]` o. ä.), `rounded-2xl` statt `rounded-full`.
- Inneres Layout: Icon links, rechts zwei Zeilen:
  - Zeile 1 (Label, klein, muted): `Nächster Post`
  - Zeile 2 (Wert, normal): `Kein Post geplant` bzw. das Datum/Zeit
- Hover-State: leichter Border-Glow (gold), `cursor-pointer`.

**2. Detail-Dialog hinzufügen**
- Neue Komponente `NextPostDialog` (oder inline in `DashboardVideoCarousel.tsx`) mit `Dialog` aus `@/components/ui/dialog`.
- State `nextPostDialogOpen` lokal in `DashboardVideoCarousel`.
- Klick auf den Pill → `setNextPostDialogOpen(true)`.

**3. Dialog-Inhalt**
Dialog zeigt:
- Titel: „Nächster geplanter Post"
- Wenn **kein Post geplant**:
  - Hinweistext „Du hast aktuell keinen Post geplant."
  - Primär-Button „Jetzt planen" → navigiert zu `/calendar` oder öffnet das `Schnell planen`-Flow.
- Wenn **Post geplant**:
  - Plattform-Icon + Plattform-Name
  - Geplantes Datum + Uhrzeit (lokalisiert via `date-fns`)
  - Vorschau-Thumbnail (falls vorhanden)
  - Caption / Text-Auszug
  - Buttons: „Zum Kalender", „Bearbeiten"

**4. Datenquelle für geplante Posts**
- In `Home.tsx` wird aktuell `nextPostLabel` an `DashboardVideoCarousel` übergeben.
- Wir prüfen, ob es bereits einen Hook/Query für geplante Posts gibt (z. B. `useScheduledPosts`, `scheduled_posts`-Tabelle).
- Falls vorhanden: nächster Post via Query holen und an Dialog weitergeben.
- Falls nicht: Dialog zeigt vorerst nur den „Kein Post geplant"-Zustand mit CTA.

**5. Konsistenz mit anderen Pills**
- `💡 Tipp` (Icon-Button) und `∞ Unlimited` bleiben einzeilig (kurzer Inhalt).
- Nur der „Nächster Post"-Pill bekommt das Zweizeilen-Layout, da nur dort längerer Text steht.
- Vertikale Ausrichtung der Pill-Reihe via `items-center`.

### Betroffene Dateien
- `src/components/dashboard/DashboardVideoCarousel.tsx` — Pill-Layout + Dialog-Trigger + Dialog
- `src/pages/Home.tsx` — ggf. zusätzliche Props für Dialog-Daten (geplanter Post-Datensatz)
- Eventuell neuer Hook `src/hooks/useNextScheduledPost.ts`, falls noch nicht vorhanden

### Erwartetes Ergebnis
- Pill zeigt vollständigen Text in zwei Zeilen, nichts abgeschnitten.
- Klick öffnet Dialog mit Post-Details, Nutzer bleibt auf Home.
- Bei keinem geplanten Post: klarer CTA „Jetzt planen".
- Optisch konsistent mit James Bond 2028 Design (Glas-Look, Gold-Akzent).

