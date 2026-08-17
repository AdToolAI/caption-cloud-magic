# FA-4/P0 — Deploy + Retest Gate (Deploy-Review)

## 1. Static Deploy-Scope (belegt)

Repo-weiter Nachweis der Import-Kanten des geänderten Shared-Moduls:

```text
grep "import .*pass-face-preclip"  → genau 1 Treffer:
  compose-dialog-segments/index.ts:98  import { renderPassFacePreclip }

grep "preclip-dispatch-resume"     → 3 Treffer:
  _shared/pass-face-preclip.ts            (Produktion)
  invoke-remotion-render/index.ts         (Produktion)
  _shared/preclip-dispatch-resume.test.ts (Test, nicht deploy-relevant)
```

`_shared/lipsync-frozen-contract.ts` nennt `pass-face-preclip` nur in einem
Kommentar — keine Import-Kante, kein Deploy-Anlass.

**Ergebnis: genau zwei produktive Importer.** Es gibt keinen weiteren
Deploy-Kandidaten.

| Function | Grund |
|---|---|
| `invoke-remotion-render` | eigener Code geändert (CAS-Claim) + importiert `preclip-dispatch-resume.ts` |
| `compose-dialog-segments` | eigener Code geändert (Presenter) + einziger Importer von `pass-face-preclip.ts` |

## 2. Deploy (verbindliche Reihenfolge)

Deploy genau dieser beiden Functions, keine weiteren. **Keine DB-Migration.**

1. `invoke-remotion-render` **zuerst** — so gibt es kein Zwischenfenster, in dem
   der neue Preclip-Caller gegen die alte Invoke-Semantik läuft.
2. `compose-dialog-segments` **danach**.

`T_FA4_P0_effective` = UTC-Zeitpunkt des erfolgreichen Deploys von
`compose-dialog-segments`. Zusätzlich werden — soweit vom Deploy-Werkzeug
zurückgegeben — die Edge-Deploy-Versionen/Deployment-IDs beider Functions im
Report festgehalten (kein Gate, nur Nachweis, dass der FA-4-Retest auf dem
neuen Bundle lief).


## 3. Post-Deploy Static/Boot Sanity

Harmloser Boot-/Validation-Smoke ohne echte Render-Payload: ein Aufruf je
Function mit absichtlich unvollständigem Body, erwartet wird eine saubere
Validierungsantwort (4xx/JSON) statt Boot-Fehler — damit ist belegt, dass
beide Bundles inklusive des neuen Shared-Moduls laden.

Zusätzlich Nachweis am deployten Stand (Quellenbeleg + Contracttests, kein
kostenpflichtiger Lauf):

- CAS-Claim auf `lambda_invoked_at` (UPDATE nur wenn NULL)
- gesetzter Claim ⇒ kein weiterer AWS-Start (`already_started_unresolved`)
- 5xx/Netzwerk ⇒ `dispatch_uncertain`, Row bleibt bestehen (nicht `failed`)
- Resume nutzt dieselbe `pendingRenderId`
- kein neuer `video_renders`-Row beim Resume
- `lambda_failed`, `poll_timeout`, `invalid_input`, Config/Credentials bleiben
  non-retryable
- v187 bleibt fail-closed (kein Full-Plate-Fallback)
- Refund weiterhin genau einmal (Idempotenz unverändert)
- neue DE/EN/ES-Meldungen für Infrastruktur- vs. Timeout-Fall vorhanden

Erneuter Lauf von `preclip-dispatch-resume.test.ts` (8/8) als Regressionsbeleg.

## 4. STOP

Kein FA-4-Render in diesem Schritt. Bei grün Meldung
**FA-4/P0 DEPLOY VERIFIED** und Ende des Turns. FA-1 bis FA-3 bleiben PASS.

Der FA-4-Retest erfolgt separat mit einer **frischen** 4-Speaker-/6-Turn-Szene
(neuer Pre-Start-Snapshot, genau ein Render); die fehlgeschlagene Szene wird
nicht wiederverwendet, damit RS3-Resetpfad und Failed-State-Artefakte den
Test nicht verfälschen.

## Technische Details

- Deploy-Werkzeug: Edge-Function-Deploy für `invoke-remotion-render` und
  `compose-dialog-segments`; Shared-Dateien werden mit jedem Bundle
  mitgeliefert, deshalb reicht der Deploy der beiden Importer.
- Dokumentation: `docs/v433-motion-studio-final-acceptance.md` erhält den
  Abschnitt „FA-4/P0 — Deploy Verification" mit Scope-Beleg,
  `T_FA4_P0_effective`, Smoke-Ergebnis und der Sanity-Checkliste.
