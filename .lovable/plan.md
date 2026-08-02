## Ziel
Der gesamte Composer-Pfad (Clip-Erzeugung → Lip-Sync → Webhooks → Frontend-Trigger) geht strikt auf Commit `58060cffe` (27.07.2026). Alles außerhalb dieses Pfads bleibt unberührt.

## Ausgangslage (per Diff verifiziert)
- `compose-dialog-segments`, `sync-so-webhook`, `lipsync-watchdog` sind bereits 1:1 Juli-Stand (nur Versions-String weicht ab).
- Der Plate-Erzeuger ist es **nicht** — daher der Fehler „Plate-Quality-Gate (v117): 0 von 4 erkannt": Ein Post-Juli-Close-up/Dialog-Director-Framing liefert Plates, die das Juli-Gate zwangsläufig ablehnt.

## Schritt 1 — Backend-Clip-Pfad zurücksetzen
Strikt auf `58060cffe`:
- `supabase/functions/compose-video-clips/index.ts`
- `supabase/functions/compose-clip-webhook/index.ts`
- `supabase/functions/compose-twoshot-audio/index.ts`
- `supabase/functions/compose-scene-anchor/index.ts`
- `supabase/functions/compose-stitch-and-handoff/index.ts`
- `supabase/functions/compose-video-assemble/index.ts`
- `supabase/functions/auto-director-compose/index.ts`
- `supabase/functions/_shared/happyhorse-green-net.ts`
- `supabase/functions/_shared/render-concurrency.ts`

## Schritt 2 — Post-Juli-Shared-Module aus dem Pfad entfernen
Module, die es am 27.07. nicht gab und die nur der Composer nutzt, werden entfernt bzw. nicht mehr importiert: `dialog-director.ts`, `lipsync-closeup-contract.ts`, `camera-path.ts`, `face-track.ts`, `frame-space.ts`, `preclip-*.ts` (Geometry-Contract, Identity-Binding, Safe-Region, Transform, Provider-Boxes, Mouth-Geometry, Reprojection-Contract), `mouth-motion-verdict.ts`, `plate-attempt.ts`, `plate-identity-split.ts`, `cast-identity-lock.ts`, `rekognition-face-collection.ts`, `rek-image-space.ts`, `still-sanity.ts`, `aws-frame-probe.ts`, `generation-provenance.ts`, `twoshot-audio-contract.ts`, `scene-hard-reset.ts`, `clip-terminal-failure.ts`, `assignment-lock.ts`, `cast-clause.ts`, `canonical-cast.ts`, `scene-run.ts`, `scene-state.ts` plus deren Tests.
Vor jedem Löschen wird per Grep geprüft, ob Autopilot-Funktionen (`autopilot-*`, `_shared/autopilot*.ts`) das Modul importieren. Falls ja: Modul bleibt im Repo bestehen, wird aber aus dem Composer-Pfad herausgelöst — nichts, was Autopilot braucht, wird entfernt.

## Schritt 3 — Post-Juli-Endpunkte stilllegen
`composer-start-scene-generation`, `composer-hard-reset-scene`, `composer-reset-selftest` werden vom Frontend nicht mehr aufgerufen (Juli-Frontend ruft `compose-video-clips` direkt). Die Funktionen bleiben deployed, falls Autopilot sie nutzt; werden sie nirgends referenziert, werden sie gelöscht.

## Schritt 4 — Frontend-Trigger zurücksetzen
Strikt auf `58060cffe`:
- `src/hooks/useTwoShotAutoTrigger.ts`
- `src/hooks/useSceneGenerate.ts`
- `src/hooks/usePipelineProgress.ts`
- `src/hooks/useGenerateAllClips.ts`
- `src/hooks/useComposerPersistence.ts`
- `src/hooks/useApplyProductionPlan.ts`, `useMouthYavgProbe.ts`, `useAccessibleCharacters.ts` (nur die composer-relevanten Teile)
- `src/lib/composer/sceneState.ts` und die zugehörigen Contract-Tests, sofern sie erst nach dem 27.07. entstanden sind

Jede Datei wird vorher auf Importe aus Autopilot-UI, Voice Studio oder Music Studio geprüft. Wo eine zurückgesetzte Datei von neueren Features gebraucht wird, bleibt ein dünner Adapter erhalten, statt das neue Feature zu brechen.

## Schritt 5 — Datenbank-Verträge
Keine Migration, die Spalten entfernt. Die Bridge `composer_scene_state_bridge` spiegelt Legacy-Status-Writes weiter in den Enum, der Guard bleibt reine Telemetrie. Damit schreibt der Juli-Code wieder seine Legacy-Spalten, ohne dass Enum-abhängige neuere Ansichten brechen.

## Schritt 6 — Verifikation vor jedem Testlauf
1. `git diff --stat 58060cffe` über den gesamten Composer-Pfad muss leer sein (Ausnahme: Versions-Strings und bewusst belassene Adapter — beide werden einzeln aufgelistet).
2. `tsgo` sauber, Deno-Tests der verbleibenden Shared-Module grün.
3. Alle betroffenen Edge Functions deployen.
4. Erst dann ein echter Lauf mit einer 4-Sprecher-Szene; Auswertung der Logs von `compose-video-clips`, `compose-dialog-segments`, `sync-so-webhook` — ohne weitere Code-Änderung, bevor das Ergebnis vorliegt.

## Technische Hinweise
- Der Rollback erfolgt datei-granular über `git checkout 58060cffe -- <pfad>`, nicht über einen History-Revert — dadurch bleibt der Rest der Woche unangetastet.
- Sicherheitsnetz: Das Ergebnis von Schritt 6.1 wird dir als Liste gezeigt, bevor irgendetwas deployed wird.

## Erhalten bleibt
Autopilot, Stripe/Founders-Rabatt, Voice Studio + Voice Library, Music Studio, Landing Page, Cast & World, UCC, Directors Cut, Analytics, Admin.

## Bewusst verloren
Post-Juli-Verbesserungen im Clip-Pfad: Dialog-Director-Framing, Close-up-Contract, Cast-Identity-Lock via Rekognition, Single-Run-Vertrag, Hard-Reset-Endpunkt sowie das erweiterte HappyHorse-Prompt-Hardening.
