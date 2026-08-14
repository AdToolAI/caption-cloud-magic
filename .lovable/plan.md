# v430.1 — Lip-Sync-Intent-Gates: Semantik einfrieren (Schritt 1 von 2)

v430 ist eingefroren. Dieser Auftrag ändert **kein** Produktionsverhalten. Es wird ausschließlich die heutige Sichtbarkeits-/Aktivierungssemantik in einer Fixture-Matrix festgeschrieben und ein Paritätsbericht erstellt. Die eigentliche Umstellung auf `isLipSyncIntentional()` ist Schritt 2 und startet erst nach Freigabe des Berichts.

## Ausgangslage

`src/lib/video-composer/lipSyncIntent.ts` ist die SSoT und liest in dieser Reihenfolge:

```text
lipSyncWithVoiceover === false  -> false   (v245 Toggle-Veto, hart)
lipSyncWithVoiceover === true   -> true
dialogMode === true             -> true
engineOverride in {cinematic-sync, sync-segments, native-dialogue} -> true
sonst                           -> false
```

Daneben existieren weiterhin direkte Gates, die nur ein Teilkriterium prüfen — z. B. `engineOverride === 'cinematic-sync'` allein (ohne `sync-segments`, `native-dialogue`, ohne Toggle-Veto) oder `dialogMode === true` allein. Genau diese Differenz soll der Bericht beziffern.

## Umfang: nur Sichtbarkeits- und Aktivierungsgates

Aufgenommen werden ausschließlich **lesende** Gates, die entscheiden, ob etwas sichtbar/aktiv ist. Nicht aufgenommen werden schreibende Stellen (Toggles, Persistenz, Payload-Bau, Rollback) — die setzen die Felder und dürfen nicht durch den Resolver ersetzt werden.

Inventarisierte Kandidaten (wird beim Bericht auf Vollständigkeit geprüft):

| Datei | Stellen | Heutiges Gate |
|---|---|---|
| `SceneCard.tsx` | 510, 833, 1353, 1703, 2273, 2355, 2385 | `isLipsyncEngine(engineOverride)`, `engineOverride === 'native-dialogue'`, `dialogMode === true`, `engineOverride === 'cinematic-sync'` |
| `SceneDialogStudio.tsx` | 1335, 1465, 2326 | `lipSyncWithVoiceover === true \|\| dialogMode === true`, `engineOverride === 'cinematic-sync'` |
| `SceneClipProgress.tsx` | 126, 132 | `engineOverride === 'cinematic-sync'`, `dialogMode === true` |
| `SceneInlinePlayer.tsx` | 76, 224 | `engineOverride === 'cinematic-sync'` |
| `ClipsTab.tsx` | 445, 550, 602, 639, 848 | `engineOverride === 'cinematic-sync' \| 'sync-segments'` |
| `RenderPreFlightDialog.tsx` | 148 | `dialogMode` |
| `usePipelineProgress.ts` | 922 | `engineOverride === 'cinematic-sync'` |
| `useGenerateAllClips.ts` | 62, 125, 199, 208, 250 | `engineOverride === 'cinematic-sync'` |
| `useMouthYavgProbe.ts` | 41 | `engineOverride === 'cinematic-sync'` |

## Fixture-Matrix

Eine gemeinsame Fixture-Liste in `src/lib/video-composer/__tests__/fixtures/lipSyncIntentMatrix.ts` mit dem vollen Kreuzprodukt:

- `lipSyncWithVoiceover`: `true | false | null/undefined`
- `dialogMode`: `true | false | null/undefined`
- `engineOverride`: `auto | cinematic-sync | sync-segments | native-dialogue | undefined`

= 45 Zeilen. Jede Zeile bekommt eine stabile ID und den erwarteten `isLipSyncIntentional()`-Wert.

## Charakterisierungstests (frieren den Ist-Zustand ein)

Neu: `src/lib/video-composer/__tests__/lipSyncIntentGateParity.test.ts`.

Jedes Gate aus der Tabelle wird als reines Prädikat nachgebildet (exakt die heutige Bedingung, kein Refactor der Quelle) und über die 45 Fixtures ausgewertet. Der Test schreibt die heutige Wahrheitstabelle fest und schlägt fehl, sobald jemand ein Gate ändert, ohne diesen Vertrag anzufassen. Zusätzlich wird pro Gate die Differenzmenge zu `isLipSyncIntentional()` als Snapshot festgehalten — leere Differenz = paritätisch.

Ergänzend ein AST-Scanner-Test, der **jede lesende Verwendung** der Intent-Felder (`dialogMode`, `dialog_mode`, `engineOverride`, `engine_override`, `lipSyncWithVoiceover`, `lip_sync_with_voiceover`) in einem Bedingungskontext erfasst — nicht nur eine Vergleichssyntax. Erfasst werden mindestens:

- `x === '…'`, `x !== '…'`
- Truthiness: `if (dialogMode)`, `!dialogMode`, `&&`/`||`-Operanden
- Ternäre Ausdrücke und boolesche Zuweisungen (`const isX = …`)
- Helferaufrufe mit dem Feld als Argument: `isLipsyncEngine(engineOverride)`
- Mengenprüfungen: `[…].includes(engineOverride)`, `SET.has(engineOverride)`

Ausgenommen bleiben Writer und Mapping: Objekt-Property-Zuweisungen (`engineOverride: …`), Payload-/Snapshot-Bau, Persistenz und Rollback. Alle heute vorhandenen Lesegates stehen in einer Allowlist; jeder neue Treffer lässt den Test rot laufen.

## Bericht (Ergebnis dieses Auftrags)

`docs/v430-1-intent-gate-parity.md` mit einer Zeile pro Gate:

- Datei:Zeile und Zweck (was wird sichtbar/aktiv)
- heutige Bedingung
- `parity = exact | broader | narrower | mixed` gegenüber `isLipSyncIntentional()`
- **False-positive Fixture-IDs** (Gate true, SSoT false) und **False-negative Fixture-IDs** (SSoT true, Gate false) — getrennt ausgewiesen, auch wenn beide Mengen gleichzeitig belegt sind (`mixed`)
- pro Differenzmenge: ob die Änderung nutzerseitig sichtbar wäre
- Empfehlung für Schritt 2: umstellen / bewusst belassen (mit Begründung)

Erwartete Muster, die der Bericht belegen muss:
- `engineOverride === 'cinematic-sync'`-Gates sind `mixed`: false-positive bei `lipSyncWithVoiceover=false + cinematic-sync` (Gate true, SSoT false) und false-negative bei `lipSyncWithVoiceover=true` ohne cinematic-sync sowie bei `sync-segments`/`native-dialogue`.
- `dialogMode`-Gates sind mindestens false-positive gegenüber dem Toggle-Veto (`lipSyncWithVoiceover=false + dialogMode=true`).

## Abgrenzung

- Keine Änderung an bestehenden Komponenten, Hooks, Edge-Functions oder DB.
- Keine Änderung an der Lip-Sync-Kette (v425-Providervertrag, v400-Anker) und nicht an v430-Output-Semantik.
- Die drei bekannten v430-Nacharbeiten (8 Legacy-Output-Zeilen, `compose-video-assemble` auf `resolveSceneOutput()`, 36 verwaiste Credit-Reservierungen) und die Testschuld `scene-state-write-contract` (qa-watchdog, recover-stuck-composer-clip) werden im Bericht als offene Posten für v431 nur referenziert, nicht bearbeitet.

## Abschluss

Tests + `tsgo` + Composer-Suite grün, Bericht geschrieben, dann **STOP**. Schritt 2 (tatsächliche Umstellung der als „umstellen" empfohlenen Gates) startet erst nach deiner Freigabe.
