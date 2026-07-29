## Antwort: Ja — dasselbe Muster steckt in zwei weiteren Features

Ich habe alle Wizards/Studios mit Entwurfs-Persistenz durchgesehen. Ergebnis:

| Feature | Verhalten bei "Neu starten" + F5 | Status |
|---|---|---|
| Universal Content Creator | Nur State + localStorage geleert; DB-Draft bleibt, Silent-Auto-Resume holt ihn zurück | **Bug (bestätigt)** |
| Universal Video Creator (Wizard) | `handleStartFresh` löscht nur die localStorage-Drafts; DB-Recovery holt danach den neuesten Eintrag zurück | **Gleicher Bug** |
| Video Composer | `handleReset` stoppt Jobs + löscht Local-Draft, aber die alte `composer_projects`-Zeile samt Szenen bleibt in der DB liegen | **Teil-Bug (verwaiste Projekte)** |
| Director's Cut | Hat bereits einen expliziten Reload-Reset über `directors-cut-draft.ts` | OK |
| Picture Studio | Nur In-Memory-Cache, keine Persistenz über Reload | OK |

### Details zu den Fundstellen

**1. Universal Content Creator** — `src/pages/UniversalCreator/UniversalCreator.tsx`
`handleNewProject` (Z. 168–191) setzt nur State zurück und entfernt `?project=`. Der Mount-Effekt (Z. 370–402) sucht danach den neuesten `content_projects`-Draft (`content_type='universal'`, `status='draft'`, <7 Tage) und hydratisiert ihn — deshalb ist nach F5 das alte Projekt wieder da.

**2. Universal Video Creator** — `src/components/universal-video-creator/UniversalVideoWizard.tsx` + `src/lib/universal-video-draft.ts`
`handleStartFresh` ruft nur `clearAllDrafts()` (localStorage). Der DB-Fallback-Effekt (Z. ~197–235) lädt den neuesten `universal_video_progress`-Eintrag mit `status='completed'`. Der Zeitfilter `generationStartedAtRef` ist nach einem Reload leer, d. h. der Filter greift nicht und ein altes Ergebnis kann wieder in den Wizard laufen.

**3. Video Composer** — `src/components/video-composer/VideoComposerDashboard.tsx`
`handleReset` (Z. 692–727) canceled laufende Jobs und löscht den Local-Draft, entfernt die alte Projektzeile aber nicht. Nach F5 startet der Composer zwar sauber, in der Datenbank sammeln sich aber verwaiste Projekte + Szenen an (Storage- und Quota-relevant, `useStorageQuota` zählt Drafts mit).

## Umsetzung

### A) Universal Content Creator
1. `handleNewProject` wird `async` und löscht die aktuelle Projektzeile hart: `content_projects.delete().eq('id', projectId).eq('user_id', user.id)`.
2. Falls keine `projectId` im State liegt, zusätzlich den neuesten eigenen `universal`-Draft löschen, damit Auto-Resume ins Leere läuft.
3. Fresh-Start-Sperre: Ein localStorage-Flag (`universal-creator-fresh-start`) wird beim Reset gesetzt; der Mount-Effekt überspringt bei gesetztem Flag sowohl Auto-Resume als auch `restoreFromLocalStorage`. Das Flag fällt weg, sobald `saveProgress` eine neue `projectId` anlegt. So bleibt der Neustart auch dann sauber, wenn das Delete an RLS/Offline scheitert.
4. Dialogtext ergänzen: der aktuelle Entwurf wird endgültig gelöscht (DE/EN/ES in `src/lib/translations.ts`).

### B) Universal Video Creator
1. `handleStartFresh` löscht zusätzlich die zugehörigen `universal_video_progress`-Zeilen des Users (bzw. markiert sie als konsumiert) und setzt `dbFallbackAttempted`/`generationStartedAtRef` zurück.
2. Ein gemeinsames Fresh-Start-Flag (gleiche Hilfsfunktion wie in A, ausgelagert nach `src/lib/fresh-start-guard.ts`) verhindert die DB-Recovery nach einem bewussten Neustart.
3. Der DB-Fallback bekommt zusätzlich eine harte Zeitschranke: nur Einträge, die nach dem Mount-Zeitpunkt der aktuellen Session erzeugt wurden, dürfen wiederhergestellt werden.

### C) Video Composer
1. `handleReset` löscht nach dem Cancel die alte Projektzeile (`composer_projects.delete()` mit `user_id`-Guard; Szenen hängen per Cascade dran) — mit Fehler-Toast, aber ohne den Reset zu blockieren.
2. Bestätigungsdialog-Text auf "wird endgültig gelöscht" anpassen.

## Neue Datei

- `src/lib/fresh-start-guard.ts` — `markFreshStart(key)`, `consumeFreshStart(key)`, gemeinsam von UCC und UVC genutzt.

## Verifikation

Für jedes der drei Features: Neustart auslösen → F5 → Wizard startet leer auf Schritt 1, keine `?project=`-URL, alte Zeile ist per DB-Query nicht mehr auffindbar.
