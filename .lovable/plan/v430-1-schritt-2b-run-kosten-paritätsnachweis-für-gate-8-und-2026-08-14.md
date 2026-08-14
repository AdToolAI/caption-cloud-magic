# v430.1 Schritt 2B — Run-/Kosten-Paritätsnachweis für Gate 8 und Gate 18

Keine Codeänderung durchgeführt. Gate 9 wurde bewusst nicht untersucht.

Grundlage: die 45er-Fixture-Matrix, verglichen gegen `isLipSyncIntentional()`.

---

## Gate 8 — `dialogstudio-wants-lipsync`

- Stelle: `SceneDialogStudio.tsx:1335`, im `handleGenerate`-Hard-Gate (v242)
- Heute: `scene.lipSyncWithVoiceover === true || scene.dialogMode === true`
- Wirkung: `false` → Toast "Lip-Sync ist ausgeschaltet" und `return` **vor** jedem Voice-/Plate-/Sync-Dispatch. `true` → die Studio-Kette darf laufen (Voiceover-Generierung, Plate, Lip-Sync-Run = kostenpflichtig).

### Differenz-Fixtures und operative Konsequenz

**False Positives (5) — heute Start möglich, SSoT würde blockieren**

`Lf-Dt-Eauto`, `Lf-Dt-Ecs`, `Lf-Dt-Ess`, `Lf-Dt-End`, `Lf-Dt-Eu`

Gemeinsamer Nenner: `lipSyncWithVoiceover = false` bei gleichzeitig `dialogMode = true`.
Konsequenz einer Umstellung: **ein heute möglicher kostenpflichtiger Run entfällt.**
Kein zusätzlicher Dispatch, keine zusätzliche Credit-Reservierung, kein übersprungener
Lip-Sync-Schritt — der Nutzer hat den Toggle explizit auf AUS gestellt, genau der Fall,
den der v242-Kommentar an dieser Stelle verhindern will, den die heutige Bedingung aber
über `dialogMode` durchlässt. Nutzbarer Ersatzweg bleibt: regulärer "Generieren"-Button
(reiner Bild-Render, ohne Lip-Sync-Kosten).

**False Negatives (6) — heute blockiert, SSoT würde Start erlauben**

`Lu-Df-Ecs`, `Lu-Df-Ess`, `Lu-Df-End`, `Lu-Du-Ecs`, `Lu-Du-Ess`, `Lu-Du-End`

Gemeinsamer Nenner: Toggle **unset** (nie angefasst), `dialogMode` nicht gesetzt, aber
`engineOverride` ist ein Lip-Sync-Engine-Wert (`cinematic-sync` / `sync-segments` /
`native-dialogue`).
Konsequenz einer Umstellung: **ein heute unmöglicher, kostenpflichtiger Run wird möglich.**
Das ist die einzige echte Kostenausweitung von Gate 8. Sie ist nicht automatisch —
sie erfordert weiterhin einen expliziten Klick auf "Generieren" im Studio, und die
nachgelagerten Guards (Blocks vorhanden, Stimme je Sprecher, Portrait je Sprecher)
bleiben unverändert davor. Zusätzliche Reservierung entsteht also nur bei bewusster
Nutzeraktion in einer Szene, die bereits auf eine Lip-Sync-Engine gestellt ist.

**Keine Differenz in den übrigen 34 Fixtures** — dort ist Start/Blockade identisch.

### Empfehlung Gate 8: umstellen

Die FP-Seite entfernt Kosten in genau dem Fall, den das Gate laut eigenem Kommentar
verhindern soll (Toggle AUS). Die FN-Seite erweitert Kosten nur bei "Toggle nie
angefasst + Lip-Sync-Engine bewusst gewählt" und nur nach explizitem Klick — das ist
inhaltlich korrekter Intent, kein versehentlicher Dispatch.
Bedingung für die Freigabe: der Wechsel wird als bewusste Semantikänderung im
Paritätstest von `mixed` auf `exact` gezogen, restliche Guards unverändert.

---

## Gate 18 — `generateall-needs-lipsync`

- Stelle: `useGenerateAllClips.ts:62`, innerhalb `isScenePipelineReady()`
- Heute (Intent-Anteil): `scene.engineOverride === 'cinematic-sync'`, verodert mit
  `isLipsyncPhase(scene)` und `dialogVoiceCount > 1`

### Wo dieses Gate wirkt — und wo nicht

`isScenePipelineReady()` fließt ausschließlich in `readyCount` und `allReady`.
Beide werden nur in `StoryboardTab` angezeigt (Chip "x/y Clips" plus Häkchen-Icon).

Nicht betroffen — diese Pfade haben **eigene**, hier nicht angefasste Ausdrücke:

- `pendingScenes` (Button-Beschriftung + `disabled`) — eigener Filter
- `remainingCost` (Kostenanzeige am Button) — leitet sich aus `pendingScenes` ab
- `eligibleScenes` → `prepareSceneRuns()` / `startSceneGeneration()` (Dispatch und
  Credit-Reservierung) — eigener Filter mit eigenem `cinematic-sync`-Check
- Retry- und Re-Render-Pfad sowie der Mid-Lip-Sync-Schutz (Stage-8-Klausel)

Damit gilt für alle Differenzen: **kein zusätzlicher Dispatch, keine geänderte
Credit-Reservierung, kein übersprungener Lip-Sync-Schritt.** Die Änderung ist rein
zählend/anzeigend.

### Differenz-Fixtures und operative Konsequenz

**False Positives (3)** — `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs`
Toggle AUS, aber `cinematic-sync`. Heute gilt die Szene erst nach abgeschlossenem
Lip-Sync als ready; nach SSoT gilt sie schon bei fertigem Clip als ready.
Konsequenz: Chip springt früher auf "ready" — korrekt, denn ohne Intent wird gar
kein Lip-Sync mehr laufen, auf das man warten könnte.

**False Negatives (20)** — alle `Lt-*` und `Lu-Dt-*` sowie `Lu-D*-E{ss,nd}`
Intent liegt vor über Toggle EIN, `dialogMode` oder `sync-segments`/`native-dialogue`,
aber nicht über `cinematic-sync`. Heute zählt die Szene bereits bei fertigem Basisclip
als ready; nach SSoT erst nach `complete` bzw. gesetztem `lipSyncAppliedAt`.
Konsequenz: der Chip meldet später "fertig" — das ist die eigentliche Korrektur,
weil heute "x/y Clips" schon grün ist, obwohl der Lip-Sync-Schritt noch aussteht.
Ein Teil dieser Fälle wird zur Laufzeit bereits von `isLipsyncPhase()` oder
`dialogVoiceCount > 1` abgefangen; die Umstellung schließt die Lücke für
Einzelsprecher-Szenen vor Beginn der Lip-Sync-Phase.

### Empfehlung Gate 18: umstellen

Reines Anzeige-/Zählgate ohne Dispatch- oder Kostenpfad. Die Umstellung beseitigt ein
"zu früh fertig"-Signal und schafft keinen zusätzlichen Run.

---

## Ergebnis

| Gate | Kostenrelevanz | FP-Folge | FN-Folge | Empfehlung |
|---|---|---|---|---|
| 8 `dialogstudio-wants-lipsync` | ja (Studio-Start) | Run entfällt bei Toggle AUS | Run wird möglich bei Toggle unset + Lip-Sync-Engine, nur nach Klick | umstellen |
| 18 `generateall-needs-lipsync` | nein (nur `readyCount`/`allReady`) | Chip früher ready | Chip später ready (Korrektur) | umstellen |

Gate 9 bleibt unberührt und bekommt einen eigenen Provider-Routing-Nachweis.

## Umsetzung, falls freigegeben (noch nicht ausgeführt)

- `SceneDialogStudio.tsx:1335`: `wantsLipSync` auf `isLipSyncIntentional(scene)`, Toast
  und alle Folge-Guards unverändert.
- `useGenerateAllClips.ts:62`: nur den Teilausdruck `scene.engineOverride === 'cinematic-sync'`
  in `needsLipsync` ersetzen; `isLipsyncPhase`, `dialogVoiceCount > 1`, Upload-Kurzschluss
  und alle Filter für `pendingScenes`/`eligibleScenes` bleiben Zeichen für Zeichen stehen.
- Paritätstest: Gate 8 und 18 von `mixed` auf `exact`; die verbleibenden zehn Gates
  bleiben auf ihrer eingefrorenen Differenz.
- Scanner-Allowlist nachziehen, danach Tests, aktualisierter 19-Gate-Bericht, STOP.
