# v430.1 — Gate 9: Provider-/Routing-Nachweis + Umsetzung

## Gate-Profil

| Feld | Wert |
|------|------|
| Gate-ID | `dialogstudio-force-cinematic` |
| Ort | `src/components/video-composer/SceneDialogStudio.tsx:1463-1468` |
| Zweck | Einzelblock-Dialog erzwingt die Cinematic-Sync-Kette statt Inline-VO |
| Intent-Fragment (heute) | `engineOverride === 'cinematic-sync' \|\| lipSyncWithVoiceover === true` |
| Vollständiges Routing-Gate | `blocks.length === 1 && allHavePortraits && (<Intent-Fragment> \|\| buttonIntendsLipSync)` |

## Korrektur zum vorherigen Bericht

Die Aussage „False Positives: keine" war **falsch**. Der harte Toggle-Veto der SSoT greift:

| Fall | Heutiges Intent-Fragment | `isLipSyncIntentional()` | Klassifikation |
|------|--------------------------|--------------------------|----------------|
| `lipSyncWithVoiceover = false` + `engineOverride = 'cinematic-sync'` | **true** | **false** | **False Positive** |

Das sind die bereits zuvor katalogisierten `Lf-*-Ecs`-Fixtures. Das Intent-Fragment ist damit **mixed**, nicht `narrower`.

### Vollständige Fixture-Klassifikation (Intent-Fragment)

**False Positives (heute true, SSoT false):**
- `Lf-Dt-Ecs`, `Lf-Df-Ecs`, `Lf-Du-Ecs` — Toggle AUS + `cinematic-sync`

**False Negatives (heute false, SSoT true):**
- `dialogMode === true` ohne Toggle/Engine (z. B. `Lu-Dt-Eu`, `Lu-Dt-Eauto`)
- `engineOverride === 'sync-segments'` (z. B. `Lu-Df-Ess`)
- `engineOverride === 'native-dialogue'` (z. B. `Lu-Df-End`)

## Routing-Auswirkung: unverändert No-Op

`buttonIntendsLipSync` ist für **jeden erreichbaren Single-Speaker-Fall mit Portrait** true:

```ts
const buttonIntendsLipSync =
  (blocks.length === 1 && allHavePortraits) || ...
```

Da das Gate ohnehin `blocks.length === 1 && allHavePortraits` verlangt, dominiert `buttonIntendsLipSync` den gesamten OR-Ausdruck. Das Intent-Fragment ist für das reale Routing heute **wirkungslos** — inklusive der oben gefundenen False Positives.

| Szenario | Heute | Nach Umstellung | Änderung |
|----------|-------|-----------------|----------|
| 1 Sprecher + Portrait + Toggle AUS | Cinematic-Sync (via `buttonIntendsLipSync`) | Cinematic-Sync (via `buttonIntendsLipSync`) | **keine** |
| 1 Sprecher + Portrait + `sync-segments` | Cinematic-Sync | Cinematic-Sync | **keine** |
| 1 Sprecher + Portrait + `dialogMode` | Cinematic-Sync | Cinematic-Sync | **keine** |
| 1 Sprecher ohne Portrait | Früher Toast/Return (Zeile 1452) | Früher Toast/Return | **keine** |
| Multi-Speaker | `useProfessionalSrs` | `useProfessionalSrs` | **keine** |

## Umsetzung (freigegeben)

### Codeänderung — nur das Intent-Fragment

`SceneDialogStudio.tsx:1463-1468`:

```ts
const forceCinematicSync =
  blocks.length === 1 &&
  allHavePortraits &&
  (isLipSyncIntentional(scene as any) || buttonIntendsLipSync);
```

Alle anderen Teile bleiben Zeichen für Zeichen unverändert: `blocks.length === 1`, `allHavePortraits`, `buttonIntendsLipSync`, die nachfolgende `if (!forceCinematicSync && ...)`-Verzweigung, alle Portrait-Guards und Toasts.

### Testvertrag — sauber getrennt

Zwei unterschiedliche Charakterisierungen, die nicht vermischt werden:

1. **Intent-Fragment** (`dialogstudio-force-cinematic`): nach der Umstellung `exact` gegenüber `isLipSyncIntentional()`. Das Fixture-Prädikat in `lipSyncIntentGates.ts` wird auf `ssot(s)` gesetzt, die Parity-Erwartung in `lipSyncIntentGateParity.test.ts` auf `exact`.

2. **Gesamtes Routing-Gate** `forceCinematicSync`: bleibt **bewusst nicht** SSoT-paritätisch, weil `buttonIntendsLipSync` zusätzlich routet. Wird im 19-Gate-Bericht ausdrücklich als solches vermerkt — nicht als „exact" für das vollständige Gate.

Der Berichtstext in `docs/v430-1-intent-gate-parity.md` bekommt für Gate 9 eine Fußnote, die diese Trennung festhält.

### Regressionstest (neu)

Neue Test-Datei mit der Routing-Matrix als reine Prädikat-Nachbildung von `forceCinematicSync`:

| Fall | Erwartetes Routing |
|------|--------------------|
| 1 Sprecher + Portrait + Toggle AUS | `forceCinematicSync === true` (via `buttonIntendsLipSync`) |
| 1 Sprecher + Portrait + `sync-segments` | `forceCinematicSync === true` |
| 1 Sprecher + Portrait + `dialogMode` | `forceCinematicSync === true` |
| 1 Sprecher ohne Portrait | früher Guard/Return, Gate nie erreicht |
| Multi-Speaker (≥2 Blöcke) | `forceCinematicSync === false`, Routing via `useProfessionalSrs` |

Der Test prüft die Matrix **vor und nach** der Umstellung identisch — er ist der Beweis für die No-Op-Eigenschaft.

### Scanner-Allowlist

`lipSyncIntentGateScanner.test.ts`: der direkte Intent-Read in `SceneDialogStudio.tsx` entfällt an dieser Stelle; die erwartete Anzahl direkter Gates in dieser Datei wird von 3 auf 1 reduziert (Gate 9 verschwindet, `native-dialogue`-Prompt-Modus bleibt unberührt, da in `SceneCard.tsx`).

## Verifikation

1. `bunx tsgo --noEmit`
2. Composer-Suite (`src/lib/video-composer`, `src/lib/composer`) — aktuell 512 grün, danach + neue Routing-Matrix-Tests
3. Parity-Bericht regenerieren: 10/19 Gates `exact`
4. UI-Smoke: Scene Dialog Studio öffnen, Single-Speaker-Dialog mit Portrait — Routing unverändert

## Danach

v430.1 ist funktional abgeschlossen. Die verbleibenden zehn Gates (1-6, 14, 16, 19) bleiben bewusst dialoggebunden und eingefroren.
