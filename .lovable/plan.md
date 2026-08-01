## Zielarchitektur (unverändert)

Lip-Sync läuft ausschließlich auf **Einzelsprecher-Close-up-Plates**. Der Gruppen-Wide bleibt als stummes Establishing erhalten. Damit ist "Gesicht zu klein" kein Laufzeitzustand mehr, sondern strukturell unmöglich, und `pass-face-preclip.ts` wird zur reinen Assertion.

1. **Per-Speaker-Plates als Normalfall** (`compose-video-clips`): pro Sprecher ein Close-up, Referenz aus dem Cast-Identity-Lock (v349).
2. **Harter Anchor-Gate** (`anchor-min-face-size.ts`): `minWidthRatio = 0.30`, 2 Framing-Retries, danach blockierender Abbruch **vor** dem Video-Render.
3. **Post-Render-Verifikation**: erster Frame des echten Clips via `_shared/aws-frame-probe.ts`, ein Re-Render, sonst Abbruch vor dem Sync.so-Dispatch.
4. **Preclip trivial**: Center-Crop auf 720×720; Schwellen bleiben nur als Assertion (`contract_violation_upstream`).
5. **Schnitt**: Establishing (stumm) + Close-up je Dialog-Turn, Timing aus `dialog_turns`.

## Risiko-Analyse: was die Änderung anderswo trifft

Der Umbau berührt sechs bestehende Mechanismen. Jeder bekommt eine explizite Absicherung, sonst kippt an anderer Stelle etwas um.

**a) Pass-Verkettung und `update_dialog_pass_slot`**
Heute ist Pass N−1 der Video-Input für Pass N; `compose-dialog-segments/index.ts` verwaltet das über Slot-Indizes (v343-Integrity-Guard). Mit Einzelplates entfällt die Verkettung — Passes werden unabhängig. Risiko: der Guard und die Wartelogik (`waitIdx`, Slot-Padding) gehen von einer geordneten Kette aus.
*Absicherung*: Slot-Schema bleibt unverändert (ein Slot pro Sprecher), nur die Input-Quelle wechselt von "vorheriger Pass" auf "eigene Plate". Der Integrity-Guard bleibt aktiv und wird durch den bestehenden Test abgedeckt.

**b) Sync.so-Slot-Leasing (v351)**
Parallele statt sequenzieller Passes erhöhen den gleichzeitigen Bedarf von 1 auf bis zu N. Bei Limit 3 und N = 4 droht ein neuer Stau.
*Absicherung*: Concurrency-Cap bleibt bei 3, Passes laufen als Warteschlange gegen den Lease-Pool. Der Orphan-Sweeper bleibt unverändert.

**c) Motion-Verdict (v347/v348)**
Misst Luminanz-Delta im Mundbereich. Auf Close-ups wird das Signal deutlich stärker — bestehende Schwellen (`outVsIn < 3.0`) sind für kleine Gesichter kalibriert und könnten jetzt zu lasch sein.
*Absicherung*: Schwellen in diesem Plan **nicht** ändern; nach dem Umbau anhand realer Läufe nachmessen. Nur die Telemetrie wird um die Face-Ratio erweitert.

**d) Audio-Mux und WYSIWYG-Parität**
`render-sync-segments-audio-mux` mischt heute N Passes über einer durchgehenden Plate. Künftig ist eine Schnittfolge zu rendern. Risiko: Director's-Cut-Parität und das `rawMediaMode`-Invariant.
*Absicherung*: Schnittzeiten kommen ausschließlich aus `dialog_turns`; `rawMediaMode: true` und die Raw-Media-Invariante bleiben unangetastet.

**e) Kosten und Credits**
N Close-up-Renders statt einer Wide-Plate erhöhen die Video-Kosten pro Szene.
*Absicherung*: Kosten-Preview bei T1 auf die neue Formel umstellen (Establishing + N Close-ups). Refund-Automatik unverändert; Abbrüche wandern nach vorn und werden dadurch billiger.

**f) Autopilot und `plateFaceSlotRouter`**
`_shared/autopilotLipSync.ts` und `plateFaceSlotRouter.ts` setzen auf Multi-Face-Plates auf.
*Absicherung*: Router wird auf die Establishing-Plate reduziert, nicht gelöscht; Autopilot ruft denselben Composer-Pfad und erbt das Verhalten.

## Technische Details

Betroffen: `compose-video-clips/index.ts`, `compose-dialog-segments/index.ts`, `_shared/anchor-min-face-size.ts`, `_shared/pass-face-preclip.ts`, `_shared/plateFaceSlotRouter.ts`, `_shared/autopilotLipSync.ts`, `render-sync-segments-audio-mux`.
Nicht angefasst: `_shared/mouth-motion-verdict.ts`, `sync-so-webhook`, `lipsync-watchdog`, Refund-Automatik.

Tests:
- `_shared/closeup-contract.test.ts` — Close-up-Vertrag, kein Lip-Sync-Pfad auf Wide-Plates, Assertion-Only-Preclip
- Bestehende `lipsync-noop-policy.test.ts` bleibt grün (Ladder leer, Floor ≥ 144 px)

## Rollout

Hinter einem Feature-Flag (`LIPSYNC_CLOSEUP_ONLY`), Default an, mit Möglichkeit zum sofortigen Rückfall auf den Wide-Plate-Pfad, falls eine der Nebenwirkungen oben in der Praxis auftritt.
