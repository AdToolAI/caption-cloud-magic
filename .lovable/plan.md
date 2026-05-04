## Ziel

Die separate „Video importieren"-Seite (Universal Director's Cut Vorstufe) entfällt. Stattdessen öffnet `/directors-cut` immer **direkt das Studio**. Die Video-Auswahl (Mediathek + Upload) wird als **Dialog innerhalb des Studios** verfügbar gemacht und automatisch beim Start angezeigt, wenn noch kein Video geladen ist. Das bringt zwei Vorteile:

1. Ein einziger, durchgängiger Editor-Kontext — kein Mode-Wechsel mehr zwischen „Import-Screen" und „Studio".
2. Beim Video-Wechsel/Import läuft die Szenen-Erkennung im **gleichen Lebenszyklus** wie das Studio — wir können sofort nach dem Auswählen die Signal-basierte Szenenanalyse (EDL für Composer, Histogram/SSIM für Uploads) anstoßen, ohne dass dazwischen die Komponente neu gemountet wird (was bisher Drafts überschrieben hat).

## Was wir bauen

### 1. Studio öffnet sich immer sofort
- `src/pages/DirectorsCut/DirectorsCut.tsx`: Den `!isInStudio` Import-Block entfernen. `CapCutEditor` wird immer gerendert. Wenn `selectedVideo === null`, wird ein Platzhalter-Editor (leere Timeline, deaktivierter Player) mit klarem CTA „Video laden" gezeigt.
- Auto-Open: Wenn beim Mount kein `selectedVideo` und keine `source_video`-URL vorhanden ist, öffnet sich automatisch der neue Import-Dialog.

### 2. Neuer `VideoImportDialog`
- Neue Komponente `src/components/directors-cut/studio/VideoImportDialog.tsx` als shadcn-`Dialog`.
- Wiederverwendet 1:1 die bestehende `VideoImportStep`-Logik (Tabs „Aus Mediathek" + „Hochladen", Library-Query, Upload).
- Ergebnis-Callback `onVideoSelect(video)` → setzt `selectedVideo` im DirectorsCut-Page-State und schließt den Dialog.

### 3. Trigger-Punkte im Studio
- **Topbar** des `CapCutEditor`: neuer Button „Video laden / wechseln" (Film-Icon), öffnet `VideoImportDialog`.
- **Cut-Panel Sidebar**: existierender Button „Video hinzufügen" wird auf den neuen Dialog umverdrahtet (statt auf die alte Vorstufe zurückzunavigieren).
- `onBackToImport` Callback wird zu `onOpenImportDialog` umbenannt — kein State-Reset mehr nötig.

### 4. Szenen-Erkennung sofort nach Auswahl
- Im `onVideoSelect`-Handler in `DirectorsCut.tsx`:
  - Composer-Quelle (URL-Param `source=composer`): wie bisher EDL-Import via `composer-edl.ts`.
  - Reguläre Library/Upload-Quelle: sofort `runSignalBasedSceneDetection()` triggern (bestehende `handleStartAnalysis`-Pipeline), nicht erst auf User-Klick warten.
  - Ein Toast „Szenen werden analysiert…" während des Runs.

### 5. Alte Vorstufe-Route stilllegen
- `src/pages/UniversalDirectorsCut.tsx`: Die Landing-Card bleibt erhalten, aber der „Start Director's Cut"-Button geht direkt nach `/directors-cut` (öffnet automatisch den Import-Dialog). Keine separate Import-Page mehr.
- Optional: Route `/universal-directors-cut` als Redirect → `/directors-cut`.

## Geänderte/neue Dateien

- **NEW** `src/components/directors-cut/studio/VideoImportDialog.tsx`
- `src/pages/DirectorsCut/DirectorsCut.tsx` — Import-Mode entfernen, Dialog einbinden, Auto-Open + Auto-Analyse
- `src/components/directors-cut/studio/CapCutEditor.tsx` — Topbar-Button + `onOpenImportDialog`-Prop
- `src/components/directors-cut/studio/sidebar/CutPanel.tsx` — „Video hinzufügen"-Button neu verdrahten
- `src/pages/UniversalDirectorsCut.tsx` — CTA direkt nach `/directors-cut` (kein Vorstufe-Inhalt mehr)
- `src/lib/translations.ts` — neue Keys `dc.openImportDialog`, `dc.changeVideo` (DE/EN/ES)

## Nicht im Scope

- Änderungen am Composer-EDL-Import oder Render-Pipeline (separater offener Plan).
- Keine Änderung der Signal-Detection selbst — nur der Trigger-Zeitpunkt verschiebt sich nach vorn.
