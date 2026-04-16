
## Befund
- Der Ladebalken ist in `AssemblyTab.tsx` zwar technisch angelegt, wirkt aber oft trotzdem „nicht da“, weil:
  1. der erste Poll erst nach 4 Sekunden startet,
  2. bei 0% praktisch kein sichtbarer Füllstand entsteht,
  3. ein laufender Render nach Reload/Tab-Wechsel nicht sauber wieder aufgenommen wird.
- In deinen Screenshots sieht der Bereich zusätzlich unfertig aus, weil rohe Übersetzungs-Keys angezeigt werden (`videoComposer.videoReady`, `videoComposer.download` usw.).
- Ursache dafür: Mehrere `videoComposer`-Keys fehlen in `src/lib/translations.ts`, und `t('key') || 'Fallback'` funktioniert hier nicht, weil `t()` bei fehlenden Keys den Key-String zurückgibt.

## Plan
### 1. Fortschritt wirklich sichtbar machen
- In `AssemblyTab.tsx` das Polling sofort nach Renderstart starten statt erst verzögert.
- Während der Startphase einen klar sichtbaren Anfangszustand anzeigen, damit sofort ein echter Balken wahrnehmbar ist.
- Laufende Renders beim Öffnen des Export-Tabs aus DB-Status + letztem `video_renders`-Eintrag wiederherstellen und das Polling fortsetzen.

### 2. Export-Bereich fertig gestalten
- Die aktuelle Render-Card in eine klare „Final Render“-Statusfläche umbauen:
  - Titel + Status-Badge
  - deutlicher Progress-Bar-Bereich
  - Prozentanzeige
  - Phasen-Text („Lambda startet“, „Frames werden gerendert“, „Kodierung & Upload“)
  - Meta-Zeile mit Render-ID / Speicherhinweis
- Die Success-Ansicht sauber strukturieren: fertiger Titel, Beschreibung, schön eingefasste Video-Vorschau, sichtbarer Download-Button und optional direkter Weg zur Mediathek.

### 3. Roh-Keys komplett beseitigen
- In `src/lib/translations.ts` die fehlenden `videoComposer`-Texte ergänzen, u. a.:
  - `videoReady`
  - `videoReadyDesc`
  - `download`
  - `savedToLibraryDesc`
  - `takingLonger`
  - `checkLaterDesc`
- In `AssemblyTab.tsx` eine sichere Übersetzungs-Helferfunktion nutzen, damit nie wieder `videoComposer.xxx` im UI landet, selbst wenn später ein Key fehlt.

### 4. Status-Sync im Dashboard abrunden
- `VideoComposerDashboard.tsx` so erweitern, dass nicht nur fertige Videos, sondern auch aktive Render-Zustände zuverlässig an den Export-Tab übergeben werden.
- Ergebnis:
  - läuft der Render noch, sieht man direkt wieder den Ladebalken,
  - ist er fertig, erscheint sofort die fertige Video-Karte.

## Technische Details
- Betroffene Dateien:
  - `src/components/video-composer/AssemblyTab.tsx`
  - `src/components/video-composer/VideoComposerDashboard.tsx`
  - `src/lib/translations.ts`
- Backend muss dafür nicht geändert werden: `check-remotion-progress` und der bestehende Webhook liefern bereits genug Daten.
- Optional nur falls nötig: `src/components/ui/progress.tsx`, falls der Balken visuell stärker hervorgehoben werden soll.

## Verify
- Render starten → sofort sichtbarer Ladebalken mit Prozent und Status
- Reload oder Tab-Wechsel während des Renders → Fortschritt wird wieder aufgenommen
- Abschluss → fertiges Video mit sauberem Download-Button und ohne rohe `videoComposer.*`-Texte
- Der gesamte Export-Bereich wirkt wie ein fertiger Bestandteil von Motion Studio statt wie ein Zwischenstand
