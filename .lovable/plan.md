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

### 1. Codeänderung — nur das Intent-Fragment, ohne Type-Bypass

`ComposerScene` (`src/types/video-composer.ts`) deklariert alle drei Intent-Felder bereits typisiert:

| Feld | Zeile | Typ |
|------|-------|-----|
| `engineOverride` | 316 | `'auto' \| 'broll' \| 'sync-polish' \| 'cinematic-sync' \| 'sync-segments' \| 'native-dialogue'` (optional) |
| `dialogMode` | 324 | `boolean` (optional) |
| `lipSyncWithVoiceover` | 617 | `boolean` (optional) |

Der Prop ist `scene: ComposerScene` (Zeile 89). Die SSoT-Signatur erwartet `LipSyncSceneCamel` mit `engineOverride?: string \| null` — der String-Literal-Union ist darauf zuweisbar. Der Aufruf ist daher **ohne Cast** typkorrekt:

```ts
const forceCinematicSync =
  blocks.length === 1 &&
  allHavePortraits &&
  (isLipSyncIntentional(scene) || buttonIntendsLipSync);
```

Kein `as any`. Alle anderen Teile bleiben Zeichen für Zeichen unverändert: `blocks.length === 1`, `allHavePortraits`, `buttonIntendsLipSync`, die nachfolgende `if (!forceCinematicSync && ...)`-Verzweigung, alle Portrait-Guards und Toasts.

### 2. Scanner-Allowlist — der eine verbleibende Reader, eindeutig benannt

Direkte Intent-Reads in `SceneDialogStudio.tsx` heute (Allowlist-Wert 3):

| Zeile | Ausdruck | Gate |
|-------|----------|------|
| 1466 | `(scene as any).engineOverride === 'cinematic-sync'` | Gate 9 |
| 1467 | `(scene as any).lipSyncWithVoiceover === true` | Gate 9 |
| 2327 | `const engineOv = (scene as any).engineOverride as string \| undefined` | **kein Intent-Gate** |

Nach der Änderung bleibt genau **ein** Treffer: **Zeile 2327**.

Dieser Read gehört **nicht** zum Lip-Sync-Intent-Vertrag. Er speist die **Provider-Namens-Anzeige** im Studio-Footer (`isSyncSegments` → sichtbares Label „Sync-Segments" / „Cinematic-Sync" / SRS-Split-Hinweis). Er liest `engineOverride` als **Provider-Kennung**, nicht als Intent-Signal, und behandelt `undefined`/`'auto'` bewusst als `sync-segments` (siehe Kommentar Zeile 2328-2330, gespiegelt aus `recommendEngineForScene`). Eine Umstellung auf `isLipSyncIntentional()` wäre hier semantisch falsch, weil das Label den gewählten Provider benennen muss, nicht ob Lip-Sync gewollt ist.

Allowlist-Änderung in `lipSyncIntentGateScanner.test.ts:206`:

```ts
// v430.1 Gate 9: verbleibender Read = Zeile 2327, Provider-Label-Anzeige
// (engineOverride als Provider-Kennung, kein Intent-Gate — bewusst kein SSoT).
'src/components/video-composer/SceneDialogStudio.tsx': 1,
```

### 3. Testvertrag — sauber getrennt

Zwei unterschiedliche Charakterisierungen, die nicht vermischt werden:

1. **Intent-Fragment** (`dialogstudio-force-cinematic`): nach der Umstellung `exact` gegenüber `isLipSyncIntentional()`. Fixture-Prädikat in `lipSyncIntentGates.ts` → `ssot(s)`, Parity-Erwartung in `lipSyncIntentGateParity.test.ts` → `exact`.

2. **Gesamtes Routing-Gate** `forceCinematicSync`: bleibt **bewusst nicht** SSoT-paritätisch, weil `buttonIntendsLipSync` zusätzlich routet. Der Bericht bekommt für Gate 9 eine Fußnote:

   > Gate 9 charakterisiert ausschliesslich das **Intent-Fragment**. Das vollständige Routing-Gate `forceCinematicSync` ist wegen `buttonIntendsLipSync` **bewusst breiter** als die SSoT: jeder Single-Speaker-Fall mit Portrait routet in die Cinematic-Sync-Kette, auch bei Toggle-Veto. Das ist kein Paritätsverstoss, sondern der gewollte v232-Vertrag (Single-Speaker-Symmetrie).

### 4. Regressionstest (neu)

Neue Test-Datei mit der Routing-Matrix als Prädikat-Nachbildung von `forceCinematicSync` — **jeweils in der Alt- und der Neu-Fassung**, damit der Test die No-Op-Eigenschaft beweist statt sie nur zu behaupten:

| Fall | Erwartetes Routing (alt == neu) |
|------|--------------------------------|
| 1 Sprecher + Portrait + Toggle AUS | `true` (via `buttonIntendsLipSync`) |
| 1 Sprecher + Portrait + `sync-segments` | `true` |
| 1 Sprecher + Portrait + `dialogMode` | `true` |
| 1 Sprecher + Portrait + `cinematic-sync` | `true` |
| 1 Sprecher ohne Portrait | Gate nie erreicht (früher Guard/Return) |
| Multi-Speaker (≥2 Blöcke) | `false`, Routing via `useProfessionalSrs` |

Zusätzlich über das volle 45-Zeilen-Fixture-Kreuzprodukt: `forceCinematicSyncAlt(f) === forceCinematicSyncNeu(f)` für jede Kombination.

## Verifikation

1. `bunx tsgo --noEmit`
2. Composer-Suite (`src/lib/video-composer`, `src/lib/composer`) — aktuell 512 grün, danach + neue Routing-Matrix-Tests
3. Parity-Bericht regenerieren
4. UI-Smoke: Scene Dialog Studio öffnen, Single-Speaker-Dialog mit Portrait — Routing unverändert

## Abschlusszählung nach Gate 9

| Status | Anzahl | Gates |
|--------|--------|-------|
| `exact` (auf SSoT umgestellt) | **10/19** | 7, 8, 9, 10, 11, 12, 13, 15, 17, 18 |
| bewusst unverändert (dialoggebunden, eingefroren) | **9/19** | 1, 2, 3, 4, 5, 6, 14, 16, 19 |

Damit ist v430.1 funktional abgeschlossen.
