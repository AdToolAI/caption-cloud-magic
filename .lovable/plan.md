## Plan v261 — Segments-Aggregation Fix (echte Ursache gefunden)

### Bestätigte Diagnose

Untersuchung der letzten Szene (`composer_scenes.id = 7469bca3-cb52-4b48-9202-e3941d43f18d`, 4 Sprecher, 19.07.2026 23:28):

- Alle 4 Sync.so-Passes: `status=done`, gültige `output_url`, korrekte `characterId` (Samuel/Matthew/Sarah/Kailee).
- Gemini-Identitätsauflösung: `plate_identity.resolvedCount=4`, `assignmentLock` sauber gesetzt, alle 4 mit `matchConfidence=0.85`.
- Mund-Koordinaten pro Pass: korrekt zum jeweiligen Charakter zugeordnet.
- Sync.so-Output-Probe (Pass 3): `syncOutputUnchanged=false` — Sync.so hat animiert.

**Aber:** `dialog_shots.segments` (Top-Level) enthält nur einen einzigen Eintrag — den letzten fertig gewordenen Pass. Die `passes[i].segments[]` sind alle 4 korrekt gefüllt.

Der `dialog-stitch-muxed`-Step liest die Top-Level-Liste. Er komponiert deshalb nur Kailees Sync.so-Output über das Master-Video. Die anderen 3 fertigen, korrekt animierten Sync.so-Outputs werden nie ins Endvideo gemischt.

**Root cause:** In `supabase/functions/compose-dialog-segments/index.ts` wird `dialog_shots.segments` beim Pass-Update mit `[currentSegment]` überschrieben statt appended.

Das erklärt jede bisherige Beobachtung („mal Sprecher 3, mal ein anderer" = immer der zuletzt fertig gewordene Pass, Race-abhängig).

### Was NICHT gebaut wird

Verworfen, weil die Diagnosen falsch waren:
- v260 Speaker-Priority-Framing Phase 2 (Focus-Plates in Face-Gate) — Face-Gate war nie das Problem.
- AWS `CompareFaces` als zweites Identitätssignal — Gemini-Identity war korrekt.
- Never-Fail/SOFT_DEGRADE — kein Sprecher wurde abgewiesen.

Die bestehende Pipeline (Sync.so + AWS Rekognition + Gemini-Identity + v242 Row-Major + Character-Assignment-Lock) ist **korrekt**. Nur die Aggregation zum Stitcher ist kaputt.

### Fix

**Datei 1:** `supabase/functions/compose-dialog-segments/index.ts`
- Beim Persistieren nach jedem Pass: `segments` aus `passes[*].segments` **rekonstruieren** (flat map + dedup by speakerIdx, aufsteigend nach startTime), nicht überschreiben.
- Concurrent-Safe: Rekonstruktion aus dem Passes-Array statt aus einer akkumulierten Variable, damit parallel laufende Passes sich nicht überschreiben.
- Explizite Assertion vor `audio_mux`-Dispatch: `segments.length === passes.filter(p => p.status==='done').length`, sonst Log-Warning + Reconstruct.

**Datei 2:** `supabase/functions/dialog-stitch-muxed/index.ts` (Verifikation)
- Prüfen, dass die Funktion tatsächlich `dialog_shots.segments` (Top-Level) als Wahrheitsquelle nutzt und alle Einträge iteriert. Falls sie stattdessen per-Pass-Arrays lesen kann, direkt darauf umstellen (robuster).

**Datei 3:** `supabase/functions/_shared/dialog-segments-repair.ts` (neu, ~30 Zeilen)
- Utility `rebuildTopLevelSegments(dialogShots)`: liest alle `passes[*].segments`, dedupt by speakerIdx, sortiert by startTime, gibt Top-Level-Array zurück. Wird in Datei 1 verwendet und ist zusätzlich als Repair-Helper aufrufbar.

### Backfill für die kaputte Szene

Ein einmaliger Repair-Call für Scene `7469bca3-cb52-4b48-9202-e3941d43f18d`:
1. `segments` aus `passes[*].segments` rekonstruieren, in `dialog_shots` schreiben.
2. `dialog-stitch-muxed` erneut triggern.
3. Ergebnis: alle 4 Sprecher sollten animierte Lippen zeigen.

Das ist der Beweis-Test, dass die Diagnose stimmt — **bevor** wir irgendwelche neuen Provider-Änderungen anfassen.

### Rollout

1. Fix deployen (`compose-dialog-segments`).
2. Backfill für die eine Test-Szene ausführen, Video ansehen.
3. Bei Erfolg: nächste 4-Sprecher-Szene neu generieren und prüfen.
4. Kein Feature-Flag nötig — es ist ein reiner Bugfix.

### Restrisiko

Wenn `dialog-stitch-muxed` bereits die per-Pass-Arrays korrekt liest und der Bug woanders sitzt (z. B. im Composer-Frontend, das die Segments zusammenbaut), verschiebt sich der Fix in Datei 2 oder ins Frontend. Das klärt Datei 2 als erster Schritt der Umsetzung — 10 Minuten Lesearbeit — bevor wir Datei 1 anfassen.

### Erwartetes Ergebnis

Die Büro-Szene mit 4 Sprechern zeigt nach dem Backfill 4 animierte Münder statt einem. Zukünftige Szenen laufen ohne diesen Aggregations-Bug.
