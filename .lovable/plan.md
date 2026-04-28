## Problem

Im Motion Studio (Video Composer) gibt es links oben einen Pfeil-Button. Aktuell macht der `navigate(-1)` und wirft den Nutzer komplett aus dem Studio raus zurück ins „Erstellen"-Menü. Es gibt keine intuitive Möglichkeit, vom Storyboard zurück ins Briefing zu springen — auch wenn die Sidebar-Schritte technisch klickbar sind, ist das nicht offensichtlich, und der Pfeil suggeriert „Schritt zurück".

## Lösung

Den Pfeil-Button im Header zu einem **„Vorheriger Schritt"**-Button umbauen, der innerhalb des Workflows navigiert. Zusätzlich ein klar getrenntes „Studio verlassen"-Element ergänzen, damit beide Aktionen verfügbar sind.

### Änderungen in `src/components/video-composer/VideoComposerDashboard.tsx`

1. **Pfeil-Button → Step-Back-Button**
   - Button bekommt neue Logik: ermittelt aus der Steps-Liste (`briefing → storyboard → clips → voice → audio → export → campaign`) den vorherigen Schritt zum aktuellen `activeTab` und ruft `setActiveTab(previousStep)` auf.
   - Wenn bereits auf dem ersten Schritt (`briefing`), wird der Button disabled (mit Tooltip „Erster Schritt").
   - Tooltip: „Vorheriger Schritt: {Name}".

2. **Neuer „Studio verlassen"-Eintrag**
   - Kleiner sekundärer Button/Link rechts neben dem Titel-Block (oder als X-Icon ganz links vor dem Pfeil), der `navigate('/home')` bzw. die ursprüngliche `navigate(-1)`-Aktion auslöst.
   - Tooltip: „Studio verlassen".

3. **Optional: Step-Back-Shortcut**
   - Sidebar-Schritte sind bereits klickbar (siehe `MotionStudioStepSidebar.tsx`); keine Änderung nötig dort. Der Briefing-Schritt bleibt jederzeit über die Sidebar erreichbar.

### Lokalisierung

- Neue Keys in `src/lib/translations.ts` (DE/EN/ES):
  - `videoComposer.previousStep` → „Vorheriger Schritt" / „Previous step" / „Paso anterior"
  - `videoComposer.exitStudio` → „Studio verlassen" / „Exit studio" / „Salir del estudio"
  - `videoComposer.firstStep` → „Erster Schritt" / „First step" / „Primer paso"

## Betroffene Dateien

- `src/components/video-composer/VideoComposerDashboard.tsx` (Header-Bereich, Zeilen ~795–820)
- `src/lib/translations.ts` (3 neue Keys × 3 Sprachen)

## Nicht im Scope

- Keine Änderungen am Sidebar-Verhalten — Schritte bleiben dort wie bisher klickbar.
- Keine Änderung der Step-Reihenfolge oder der Gating-Logik (`isStepAccessible`).
