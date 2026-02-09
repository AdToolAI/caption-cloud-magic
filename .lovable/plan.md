

# Rendering-Fix: 3 Code-Probleme beheben

## Ueberblick

Das Video-Rendering bleibt bei 10% haengen und der "Plan umsetzen" Button hat einen Lovable-Plattformfehler ausgeloest. Ich setze jetzt den bereits analysierten Plan direkt um. Es gibt 3 Code-Probleme zu fixen.

---

## Problem 1: Progress wird kuenstlich auf 10% begrenzt

In `supabase/functions/auto-generate-universal-video/index.ts` (Zeile 423) prueft der Code ob die Render-ID mit `pending-` beginnt und begrenzt den Progress auf maximal 10%. Da ALLE Render-IDs mit `pending-` starten (wegen der async Lambda-Architektur), wird der echte Fortschritt nie angezeigt.

**Fix:** Die `pending-` Bedingung entfernen, nur noch bei echtem `queued` Status langsam hochzaehlen.

---

## Problem 2: Edge Function stirbt vor Render-Ende

Die Background-Task in `auto-generate-universal-video` pollt bis zu 15 Minuten, ueberschreitet aber das Wall-Clock-Limit der Edge Function.

**Fix:** Polling auf maximal 60 Sekunden begrenzen (6 Versuche statt 90). Wenn danach nicht fertig, Status "rendering" speichern und Funktion beenden. Im Frontend (`UniversalAutoGenerationProgress.tsx`) einen Client-Side Fallback-Polling einbauen, der direkt `check-remotion-progress` aufruft wenn die Edge Function nicht mehr aktualisiert.

---

## Problem 3: UniversalExportStep parst Response falsch

In `UniversalExportStep.tsx` (Zeile 191) wird `response.data` destrukturiert als `{ done, progress, outputFile, error }`. Aber `check-remotion-progress` gibt die Daten unter `response.data.progress` zurueck (verschachtelt). Deshalb sind `done` und `outputFile` immer `undefined`.

**Fix:** Response korrekt parsen:
```typescript
const progressData = response.data?.progress || {};
const { done, outputFile, overallProgress, fatalErrorEncountered, errors } = progressData;
```

---

## Technische Aenderungen

### Datei 1: `supabase/functions/auto-generate-universal-video/index.ts`
- Zeilen 422-426: Progress-Capping fuer `pending-` IDs entfernen
- Polling-Limit von 90 auf 6 Versuche reduzieren (60 Sekunden)
- Bei Timeout: Status "rendering" mit Render-ID in DB speichern statt Fehler werfen

### Datei 2: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Client-Side Fallback-Polling hinzufuegen wenn `current_step === 'rendering'` und DB seit 30+ Sekunden nicht aktualisiert
- Direkt `check-remotion-progress` vom Browser aufrufen
- Completion und Failure clientseitig behandeln
- Timeout nach 8 Minuten mit Fehlermeldung

### Datei 3: `src/components/universal-video-creator/UniversalExportStep.tsx`
- Zeile 191: Response-Parsing korrigieren fuer verschachteltes `progress` Objekt
- `progress` Variable korrekt als Zahl verwenden statt als Objekt

---

## Wichtiger Hinweis

Diese 3 Fixes beheben die UI-Probleme (festhaengende Anzeige, falsche Progress-Werte, falsches Parsing). Falls die Remotion Lambda selbst keine Videos produziert (kein `out.mp4` auf S3), muss das Remotion Bundle separat neu deployed werden - das ist ein Infrastruktur-Schritt ausserhalb von Lovable.

