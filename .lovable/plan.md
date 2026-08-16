# C1 — Lip-Sync Intent: UI/DB-Divergenz schließen

Nur die Divergenz zwischen angezeigtem Toggle und persistiertem Intent. G3.2.2, RS3, Ledger, Sync-Callbacks/Finalizer, Provider-Routing, Continuity und die Gate-Semantik selbst bleiben unberührt.

## Befund (aus dem Code verifiziert)

Nachweise aus `VideoComposerDashboard.tsx`, `lipSyncPending.ts`, `lipSyncIntent.ts`:

1. Der Composer-State wird beim Mount **zuerst aus dem localStorage-Draft** gebaut (`loadDraft()`), inklusive `lipSyncWithVoiceover`. Die DB-Hydration läuft erst danach asynchron.
2. `useEffect(() => saveDraft(project), [project])` schreibt **jede** lokale State-Änderung in den Draft — auch rein optimistische Writes, die nie in die DB gehen. `lipSyncWithVoiceover: true` wird u. a. lokal gesetzt von `SceneDialogStudio`, `SceneClipProgress`, `FaceMapReviewDialog`, `useSceneGenerate`.
3. Die DB-Hydration steigt **still aus**, wenn `data.length === 0` oder ein Fehler auftritt (`catch → console.warn`), und läuft pro `project.id` nur einmal (`lastSyncedProjectIdRef`). In diesen Fällen bleibt der Draft-Wert stehen.
4. Es gibt **kein Dirty-Tracking für Booleans**. `markDirty`/`isDirty` decken nur Textfelder ab; für Lip-Sync existiert nur die In-Memory-Registry `lipSyncPending` mit 8 s TTL, die einen Reload nicht überlebt. Ein alter Draft-Boolean ist damit von einem echten frischen User-Edit nicht unterscheidbar.
5. Der Draft trägt **keine Scene-Revision und keinen Zeitstempel** — beim Laden ist nicht entscheidbar, ob er älter ist als die DB-Zeile.
6. Render-Gates lesen den persistierten Intent (`isLipSyncIntentionalRow` auf der DB-Zeile), die UI den Draft-Wert. Genau daraus entsteht "UI=AN, Start blockiert".

Der generische Teil ist damit belegt: die Regel "Draft gewinnt bis die DB-Hydration eintrifft" gilt für **alle** Felder, nicht nur für Lip-Sync. Welcher der lokalen Writer im konkreten beobachteten Fall `true` gesetzt hat, ist noch nicht bewiesen — das wird als erster Implementierungsschritt bestätigt, ändert den Fix aber nicht.

## Zielvertrag

- Persistierter DB-Wert gewinnt bei der Scene-Hydration, außer es liegt ein nachweislich aktueller, dirty User-Edit für dieselbe Scene vor.
- Der Draft darf einen persistierten Intent-Boolean nie allein deshalb überschreiben, weil lokale Daten existieren.
- `isLipSyncIntentional()` bleibt unverändert; kein "UI true ⇒ Intent true".
- Persistierungsfehler sind sichtbar und fail-closed.

## Umsetzung

**1. Intent-Draft-Guard (neues Modul `src/lib/video-composer/lipSyncIntentDraft.ts`)**
- Persistente Dirty-Marken (localStorage, account-scoped über `local-draft-scope`) je `sceneId` für die drei Intent-Felder `lipSyncWithVoiceover`, `dialogMode`, `engineOverride`: `{ value, setAt, cleared }`.
- Eine Marke entsteht **nur** durch einen expliziten User-Toggle und wird nach bestätigtem DB-Write wieder gelöscht.
- Auflösung bei Hydration: Marke vorhanden und noch nicht bestätigt → lokaler Wert (UI zeigt "ungespeichert"). Sonst → DB-Wert, kompromisslos.

**2. Draft-Hydration entschärfen (`VideoComposerDashboard.tsx`)**
- Beim Aufbau des Initial-State aus `loadDraft()` werden die drei Intent-Felder auf allen persistierten Szenen (UUID-ID) **verworfen**, solange keine Dirty-Marke existiert; sie gelten bis zur DB-Hydration als "unbekannt" und werden nicht als AN gerendert.
- In beiden Merge-Pfaden (Mount-Hydration Zeile ~372, Refetch ~562) ersetzt der neue Resolver `resolveLipSyncValue`/`resolveDialogModeValue`/`resolveEngineOverrideValue`: In-Memory-Pending-Registry (Race-Schutz, unverändert) **oder** persistente Dirty-Marke gewinnt, sonst DB.
- Bricht die Hydration ab (Fehler / keine Zeilen), bleibt der Intent auf dem sicheren Default (OFF) statt auf dem alten Draft-Wert.

**3. Toggle-Pfade fail-closed (`SceneCard.tsx`, `SceneAvatarMode.tsx`)**
- Marke vor dem Write setzen, nach erfolgreichem Write löschen; bei Fehler Rollback **plus** sichtbarer Fehler-Toast statt nur `console.warn`.
- Solange die Marke offen ist, zeigt der Toggle einen "ungespeichert"-Zustand an (kleiner Punkt/Badge am Schalter), damit UI=AN nie kanonisch wirkt, bevor die DB bestätigt hat.

**4. Optimistische Nicht-User-Writer**
- Die Stellen, die `lipSyncWithVoiceover: true` lokal setzen (Dialog-Studio, Clip-Progress, FaceMap, `useSceneGenerate`), erzeugen **keine** Dirty-Marke; ihre lokalen Werte überleben damit keinen Reload und können den persistierten Intent nicht vortäuschen. Wo diese Pfade den Intent wirklich meinen, schreiben sie ihn (wie heute) über ihren eigenen DB-Write.

## Tests (Vitest, neu unter `src/lib/video-composer/__tests__/`)

- DB=false + alter Draft=true (keine Marke) → UI=false.
- DB=true + alter Draft=false (keine Marke) → UI=true.
- Frischer dirty Edit false→true → UI=true; nach erfolgreichem Write Marke gelöscht, DB=true.
- Persistierungsfehler → Rollback, keine dauerhafte ON-Anzeige, Fehler sichtbar.
- Reload nach gespeichertem ON → UI/DB/Intent alle true.
- UI ON (persistiert) → `isLipSyncIntentional()` true; persistiert OFF → false, auch bei altem Draft=true.
- Regressionsschutz: andere Draft-Felder (Prompt-Texte, Character-Shots, Overlay) behalten ihr heutiges Merge-Verhalten.

## Abschluss

Root Cause, minimaler Fix und Testergebnisse in `docs/v432-c1-lipsync-intent-divergence.md`. Danach STOP für Review — keine allgemeine Motion-Studio-Aufräumrunde.
