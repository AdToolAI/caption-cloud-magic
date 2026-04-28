## Problem

Der Auto-Director **funktioniert serverseitig korrekt**: Die Edge Function `auto-director-compose` erstellt das Projekt in `composer_projects`, fügt Szenen in `composer_scenes` ein und triggert `compose-video-clips` asynchron im Hintergrund. Der Wizard navigiert anschließend zu `/video-composer?projectId=NEW_ID&tab=clips`.

**Das UI ignoriert diese URL aber komplett.** Konkret:

1. `VideoComposerDashboard.tsx` initialisiert seinen State ausschließlich aus localStorage (`loadDraft()`, Zeile 146) und liest `useSearchParams()` nirgendwo aus.
2. Die DB-Hydration (Zeile 192–312) läuft nur, wenn `project.id` schon im State steht — aber genau diese ID kommt nie an, weil sie nur in der URL liegt.
3. Der `AutoDirectorWizard` wird ohne `onProjectCreated`-Prop gemountet (Zeile 890–894), also gibt es auch keinen direkten Callback, der State + Tab setzen könnte.

Resultat: Nach dem Klick auf „Movie generieren" landet der User auf einer URL mit `projectId=…`, sieht aber weiterhin den **alten Draft** (oder den leeren Default) — keine neuen Szenen im Storyboard, keine generierenden Clips im Clips-Tab. Die Bestätigungstoasts sind irreführend, weil im Hintergrund tatsächlich Credits abgezogen und Clips erzeugt werden, der User davon aber nichts mitbekommt.

## Lösung

Drei kleine, gezielte Änderungen, die das Auto-Director-Ergebnis sichtbar machen — ohne Server- oder DB-Änderungen.

### 1. `VideoComposerDashboard.tsx` — URL-Parameter respektieren

- `useSearchParams()` aus `react-router-dom` einbinden.
- Beim Mount prüfen, ob `?projectId=<uuid>` gesetzt ist. Wenn ja:
  - localStorage-Draft **verwerfen** (nicht den fremden/anderen Draft mit der neuen Project-ID mischen).
  - `project.id` im State auf den URL-Wert setzen, sodass die bestehende DB-Hydration (Zeile 192–312) das Projekt + Szenen vollständig aus der DB lädt (Briefing, Szenen, Status, etc.).
- Wenn `?tab=clips` (oder `storyboard`/`text`/…) gesetzt ist, `setActiveTab(...)` initial darauf setzen.
- Nach dem ersten Mount die Query-Parameter optional aus der URL entfernen (`setSearchParams({}, { replace: true })`), damit ein späterer Reload nicht erneut die alte Hydration triggert.

### 2. `AutoDirectorWizard.tsx` — Briefing aus dem DB-Projekt nachladen

Heute kennt das Dashboard nur Szenen aus der DB-Hydration, aber das Briefing (idea, mood, duration) wird nicht aus dem DB-Feld `briefing` zurückgelesen. Damit das wiederhergestellte Projekt vollständig aussieht, in der DB-Hydration in Punkt 1 zusätzlich `title`, `category`, `briefing`, `language`, `assembly_config` lesen und in den lokalen State übernehmen — analog zu dem, was schon für `output_url`, `status`, `ad_meta` etc. passiert (Zeile 217–227).

### 3. `VideoComposerDashboard.tsx` — `onProjectCreated`-Callback an Wizard durchreichen (Belt & Suspenders)

Als zusätzliche Absicherung (falls die URL aus irgendeinem Grund verloren geht, z. B. Browser-History-Manipulation):

```tsx
<AutoDirectorWizard
  open={showAutoDirector}
  onOpenChange={setShowAutoDirector}
  defaultLanguage={project.language}
  onProjectCreated={(projectId) => {
    // Verwerfe alten Draft, setze neue Project-ID,
    // Hydration-Effect lädt dann Szenen aus DB.
    clearDraft();
    setProject({ ...defaultProject, id: projectId });
    didInitialSyncRef.current = false; // erlaubt Re-Hydration
    setActiveTab('clips');
  }}
/>
```

`didInitialSyncRef` muss zurückgesetzt werden, damit der Mount-Effect erneut läuft — alternativ kann man die Hydration in einen separaten Effect auslagern, der auf `project.id` reagiert.

### 4. Optional: Live-Status für generierende Clips sichtbarer machen

Der `compose-video-clips`-Aufruf läuft fire-and-forget. Damit der User sieht, dass tatsächlich etwas passiert, im Clips-Tab eine **Realtime-Subscription** auf `composer_scenes` (gefiltert nach `project_id`) ergänzen, sodass Statusübergänge `pending → generating → ready` ohne Reload sichtbar werden. Das passt zur bereits genutzten `useComposerScenesRealtime`-Infrastruktur (Zeile 50). Falls die nicht schon im Clips-Tab eingebunden ist, dort verdrahten.

## Geänderte Dateien

- `src/components/video-composer/VideoComposerDashboard.tsx` — URL-Parameter lesen, DB-Hydration auf Briefing erweitern, Wizard-Callback verdrahten, optional Realtime aktivieren.
- (Kein Backend-Change nötig — Edge Function arbeitet bereits korrekt.)

## Verifikation

1. Auto-Director öffnen → Idee eingeben → Plan generieren → bestätigen.
2. Erwartet: Wizard schließt, URL zeigt `?projectId=…&tab=clips`, Clips-Tab ist aktiv, alle Szenen aus dem AI-Plan sind sichtbar mit Status „Ausstehend" → kurz darauf „Generiert" → „Bereit".
3. Reload auf der URL: Projekt + Szenen bleiben erhalten (DB-Hydration läuft).
4. Storyboard-Tab: zeigt die generierten Szenen mit korrektem Briefing (idea/mood).
