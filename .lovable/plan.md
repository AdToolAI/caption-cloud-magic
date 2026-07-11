## Ziel
Beim Plan-Apply liegt das Skript bereits mit korrekt zugeordneten Sprechern in der Szene. Der Kunde wählt im Dialog-Studio nur noch die Stimme pro Sprecher — kein leeres Skript, kein „0 Sprecher"-Zustand mehr.

## Beobachtung
Im aktuellen Screenshot steht das Skript zwar im Textfeld (`Samuel Dusatko: Hi!` / `Matthew Dusatko: Hi Samuel!`), aber die Kopfzeile zeigt „0 Blocke · 0 Sprecher · ~3s". Grund: `parseDialogScript(script, sceneCast)` findet die Namen nicht, weil `sceneCast` nach dem Apply nicht alle sprechenden Charaktere enthält. `dialogScript` wird zwar aus `spokenTurns` gebaut — aber nur Charaktere, die es in `characterShots` schaffen, landen in `scene.cast`. Sprecher ohne eigenen ShotDirector-Eintrag fallen aus dem Cast.

## Änderungen

### 1. Apply-Hook: sprechenden Cast garantieren
`src/hooks/useApplyProductionPlan.ts`
- Nach dem Build von `characterShots` einen zusätzlichen Merge-Schritt einfügen: jede in `spokenTurns` referenzierte `speakerCharacterId`, die noch nicht in `characterShots` steht, wird als leichter Cast-Eintrag (`{ characterId, characterName, action: '' }`) angehängt.
- Dadurch enthält `scene.cast`/`characterShots` alle Sprecher → `parseDialogScript` erkennt die `NAME:`-Präfixe wieder.

### 2. Skript-Vorbelegung sicherstellen
`src/hooks/useApplyProductionPlan.ts`
- `dialogScript` bleibt UPPERCASE-präfixiert (`SAMUEL DUSATKO: Hi!`). Parser matcht case-insensitive — kein zusätzlicher Change nötig, nur verifizieren.
- `dialogMode` bleibt `true`, sobald `spokenTurns.length > 0` — damit das Skript-Panel sofort aufgeklappt ist.

### 3. Stimmen bleiben leer (bereits v225)
- `dialogVoices = {}` bleibt unverändert.
- Im Dialog-Studio rendert pro erkanntem Sprecher automatisch ein leerer `VoicePicker`-Slot (funktioniert schon, sobald Punkt 1 den Cast füllt).

### 4. Plan-Sheet: klarer Hinweis
`src/components/video-composer/briefing/ProductionPlanSheet.tsx`
- Footer-Text angleichen: „Skript & Sprecher sind gesetzt — Stimmen wählst du im Storyboard."

### 5. Nicht angefasst
- Speaker-Detection, Ensemble-Guarantee, dedup, dialogTurns-Reconstruction, LipSync-Guard.
- Kein Server-Change nötig.

## Ergebnis
Nach „Plan anwenden":
- Skript steht mit `NAME:`-Präfixen im Studio.
- Kopfzeile zeigt korrekt „N Blöcke · N Sprecher".
- Pro Sprecher ein leerer Voice-Slot → Kunde klickt bewusst die Stimme.
- Kein „0 Sprecher"-Bug, kein Voice-ID-Fehler-Toast.
