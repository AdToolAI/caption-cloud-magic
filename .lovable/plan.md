## Ziel
Render-Button im Composer (AssemblyTab) soll nicht mehr blockiert sein, wenn nur ein Teil der Szenen fertig generiert wurde. Nicht-fertige Szenen werden beim Rendern einfach übersprungen.

## Änderungen

### 1. Frontend — `src/components/video-composer/AssemblyTab.tsx`
- `handleRender` Guard: statt `!allReady` blocken → nur blocken wenn `readyClips.length === 0`. Toast-Text "Mindestens ein Clip muss bereit sein".
- Button `disabled={isRendering || readyClips.length === 0}`.
- Kosten-Zusammenfassung: zusätzlich `readyCost` (Summe nur über `readyClips`) anzeigen, Render-Button-Preis = `readyCost + voCost`.
- Hinweistext unter Button bei teilweise fertigen Szenen umformulieren: `"{ready}/{total} Clips bereit — nicht fertige Szenen werden übersprungen"` (neuer i18n-Key `partialRenderHint`, EN/DE/ES) statt aktuell `allClipsMustBeReady`.
- Hinweis nur ausblenden wenn `allReady`.

### 2. Edge Function — `supabase/functions/compose-video-assemble/index.ts`
- `isRenderable`-Filter beibehalten, aber statt zu werfen:
  - Wenn `renderable.length === 0` → klarer Fehler "Keine fertigen Clips vorhanden".
  - Sonst: nur renderbare Szenen weiter durch die Pipeline schicken (alle nachfolgenden `scenes.map` / `sortedScenes` etc. arbeiten auf der gefilterten Liste). Ein Hinweis-Log `skipped N scenes` für Diagnose.
- Toast/Response um `skippedScenes: number` erweitern; AssemblyTab zeigt "(N Szenen übersprungen)" im Render-Started-Toast.

### 3. i18n — `src/lib/translations.ts`
- Neuer Key `partialRenderHint` (DE/EN/ES).
- `allClipsMustBeReady` bleibt für Fallback, wird im UI nicht mehr verwendet.

## Out of Scope
- Keine Änderungen an Stitching-Reihenfolge: Szenen behalten ihre `order_index`, fehlende Indizes werden einfach ausgelassen (kein Lückenfüller, keine Platzhalter).
- Keine Änderungen an Cost-Reservation/Refund-Logik außer dem im Edge-Function-Response gemeldeten Skip-Count.

## Validierung
- 1/5 Clips bereit → Button aktiv mit Preis nur für 1 Clip, Render läuft mit 1 Szene durch.
- 0/5 → Button disabled.
- 5/5 → unverändert (kein Hinweistext, kein Skip).
