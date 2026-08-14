# v430.1 — Gate-9 Provider-/Routing-Nachweis

## Gate-Profil

| Feld | Wert |
|------|------|
| Gate-ID | `dialogstudio-force-cinematic` |
| Ort | `src/components/video-composer/SceneDialogStudio.tsx:1463-1468` |
| Zweck | Einzelblock-Dialog erzwingt die Cinematic-Sync-Kette statt Inline-VO |
| Heutige Bedingung (Intent-Anteil) | `engineOverride === 'cinematic-sync' \|\| lipSyncWithVoiceover === true` |
| Vollständige heutige Bedingung | `blocks.length === 1 && allHavePortraits && (engineOverride === 'cinematic-sync' \|\| lipSyncWithVoiceover === true \|\| buttonIntendsLipSync)` |

## Was das Gate steuert

`forceCinematicSync` entscheidet, ob ein Single-Speaker-Dialog in den **professionellen SRS/Cinematic-Sync-Pfad** (`compose-video-clips` + dedizierter Lip-Sync) oder in den **Inline-VO/HeyGen-Talking-Head-Pfad** läuft.

```text
forceCinematicSync = true  → PROFESSIONAL multi-speaker lip-sync (SRS)
forceCinematicSync = false → handleGenerateInline() (Inline-VO)
```

## Wichtiger Kontext: `buttonIntendsLipSync`

Die heutige Bedingung enthält neben dem Intent-Anteil einen zusätzlichen OR-Zweig:

```ts
const buttonIntendsLipSync =
  (blocks.length === 1 && allHavePortraits) ||
  (blocks.length >= 2 && allHavePortraits && !renderAsSeparateScenes);
```

Für **Single-Speaker-Szenen mit Portraits** ist `buttonIntendsLipSync` **immer true**. Das bedeutet:

- Alle erreichbaren Single-Speaker-Fälle (d.h. `blocks.length === 1 && allHavePortraits`) werden **bereits heute** in den Cinematic-Sync-Pfad gezwungen.
- Der Intent-Anteil (`engineOverride` / `lipSyncWithVoiceover`) ist in der aktuellen Logik für Single-Speaker-Szenen **faktisch tot** — `buttonIntendsLipSync` dominiert.
- Für Multi-Speaker-Szenen ist `forceCinematicSync` irrelevant, weil `blocks.length === 1` dort nie zutrifft; das Routing regelt `useProfessionalSrs`.

## Fixture-Vergleich: heute vs. `isLipSyncIntentional()`

Die Fixture-Matrix umfasst 45 Kombinationen aus `lipSyncWithVoiceover`, `dialogMode` und `engineOverride`.

### False Positives (heute true, SSoT false)

**Keine.** Die heutige Bedingung prüft nur `cinematic-sync` oder `lipSyncWithVoiceover === true`. `isLipSyncIntentional()` erkennt dieselben Fälle plus weitere Opt-in-Signale — sie ist also **breiter**, nicht enger.

### False Negatives (heute false, SSoT true)

| Auslöser | Beispiel-Fixture | Bedeutung für Routing |
|----------|------------------|----------------------|
| `dialogMode === true` ohne Toggle/Engine | `L<u>-D<t>-E<u>` | Würde nach SSoT Cinematic-Sync erzwingen. |
| `engineOverride === 'sync-segments'` | `L<u>-D<f>-E<ss>` | Würde nach SSoT Cinematic-Sync erzwingen. |
| `engineOverride === 'native-dialogue'` | `L<u>-D<f>-E<nd>` | Würde nach SSoT Cinematic-Sync erzwingen. |

**Aber:** Für Single-Speaker-Szenen mit Portraits macht `buttonIntendsLipSync` diese Unterschiede praktisch irrelevant — die Szenen landen ohnehin im Cinematic-Sync-Pfad. Für alle anderen Fälle (kein Portrait, Multi-Speaker) greift `forceCinematicSync` gar nicht.

## Provider-/Routing-Auswirkung

| Szenario | Heute | Nach `isLipSyncIntentional()` | Routing-Änderung? |
|----------|-------|------------------------------|-------------------|
| Single-Speaker + Portraits | Cinematic-Sync (via `buttonIntendsLipSync`) | Cinematic-Sync (via `buttonIntendsLipSync`) | **Nein** |
| Single-Speaker + `engineOverride='sync-segments'` | Cinematic-Sync (via `buttonIntendsLipSync`) | Cinematic-Sync (via `buttonIntendsLipSync` oder SSoT) | **Nein** |
| Single-Speaker + `dialogMode=true` | Cinematic-Sync (via `buttonIntendsLipSync`) | Cinematic-Sync (via `buttonIntendsLipSync` oder SSoT) | **Nein** |
| Single-Speaker ohne Portraits | Früher Toast/Return | Früher Toast/Return | **Nein** |
| Multi-Speaker | Routing via `useProfessionalSrs` | Routing via `useProfessionalSrs` | **Nein** |

## Fazit

Eine Umstellung des Intent-Anteils von Gate 9 auf `isLipSyncIntentional()` wäre aus **Provider-/Routing-Sicht heute eine No-Op-Änderung**. Das tatsächliche Routing wird von `buttonIntendsLipSync` dominiert, das für alle erreichbaren Single-Speaker-Fälle bereits true ist.

### Empfehlung

Trotzdem **empfohlen**, den Intent-Anteil auf `isLipSyncIntentional()` umzustellen:

1. **Robustheit:** Falls `buttonIntendsLipSync` in Zukunft entfernt oder eingeschränkt wird, verhindert die SSoT, dass `sync-segments`, `native-dialogue` oder `dialogMode` versehentlich in den Inline-VO-Pfad rutschen.
2. **Vertragstreue:** `cinematic-sync`, `sync-segments` und `native-dialogue` sind allesamt Lip-Sync-Engines und sollten konsistent behandelt werden.
3. **Konsistenz:** Alle anderen Display-/Routing-Gates (7, 10-13, 15, 17, 8, 18) wurden bereits auf die SSoT umgestellt.

### Keine Codeänderung in diesem Schritt

Dieser Bericht ist rein analytisch. Umsetzung von Gate 9 erst nach deiner Freigabe.
