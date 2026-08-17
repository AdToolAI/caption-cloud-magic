# FA-4/P0 Sync Fan-out — Deploy Gate (Deploy GO, kein Render)

Scope aus dem Deploy Review ist bestätigt und unverändert: zwei Edge-Functions,
keine Migration, kein Ledger-RPC-Deploy, kein breiter Ledger-Bundle-Rollout.

## Ausführungsreihenfolge

1. **Pre-Deploy-Gate** — 14/14 Tests unmittelbar vor dem Deploy erneut ausführen
   (`_shared/fa4-turn-pass-guard.test.ts` 10, `_shared/v431-ledger-adoption.test.ts` 4).
   Rot ⇒ Abbruch ohne Deploy.
2. **Deploy `compose-twoshot-audio`** (Producer: `turn_id` im Audio-Plan).
   Deploy-Ergebnis/Version dokumentieren. Fehlschlag ⇒ Abbruch, Schritt 3 entfällt.
3. **Deploy `compose-dialog-segments`** (Consumer: `segment_id = dialog_turn.id`,
   Fail-closed-Guard, gehärtete Adoption). Deploy-Ergebnis/Version dokumentieren.
4. **`T_FA4_P0_FANOUT_effective`** = Zeitpunkt des zweiten erfolgreichen Deploys.
5. **Boot-Smoke** beider Functions mit harmloser ungültiger Payload:
   Bundle lädt, sauberes 4xx mit JSON-Validierungsfehler, kein Import-/ReferenceError.
   Keine Render-Payload, keine Szenen-ID, keine Kosten.
6. **Statische Sanity im Report** (kein zusätzliches Gate): produktiver
   `compose-twoshot-audio`-Stand enthält `turn_id` im Turn-/Voiced-Range-Payload;
   produktiver `compose-dialog-segments`-Stand enthält `segmentId = turn_id` sowie
   den `fa4_p0_turn_pass_mismatch`-Guard. Damit ist belegt, dass Producer und
   Consumer derselben Identität gleichzeitig produktiv sind.
7. **Deploy-Report** in `docs/v433-motion-studio-final-acceptance.md` ergänzen:
   Scope, Reihenfolge, Versionen, `T_FA4_P0_FANOUT_effective`, Smoke-Ergebnisse,
   statische Sanity.

## Ausdrücklich nicht im Scope

- Keine Migration, kein Schema-Change
- Kein Ledger-RPC-Deploy, keine Redeploys der übrigen `_shared/v431-ledger.ts`-Importer
  (`compose-clip-webhook`, `compose-video-clips`, `sync-so-webhook`, `lipsync-watchdog`,
  `modelark-poll`, `recover-stuck-composer-clip`, `remotion-webhook`,
  `render-sync-segments-audio-mux`) — sie nutzen nur unveränderte Exporte
- Kein Render, kein FA-4-Retest, keine S11-Anlage
- S10 bleibt unangetastete Evidence

## Abschluss

Nach erfolgreichem Deploy + Smoke:

**FA-4/P0 SYNC FAN-OUT DEPLOY VERIFIED → STOP.**

S11 für den endgültigen FA-4-Retest erst nach separatem GO.
