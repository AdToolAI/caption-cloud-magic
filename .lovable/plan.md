## Wurzelursache (DB-verifiziert an Szene 7d45c852)

`plate_identity`:
- 4 Gesichter mit `characterId` + `matchConfidence: 0.85` erkannt (alle 4 Speaker sauber gemappt)
- **aber** `resolvedCount: 0`

Konsequenz in `compose-dialog-segments`:
- `haveBboxUrlPathForEdge` / preclip-eligibility Guards prüfen u.a. `(plateIdentityMap.resolvedCount ?? 0) > 0` → false
- Pipeline verwarf die 4 fertigen Preclips (`preclip_used: false`) und schaltete auf `retry_variant: bbox-url-pro`
- Es lief nur **1 Sync.so-Job** (`sync_job_id: eb2e25b8`) über die volle 1284×718-Plate mit 4 per-frame Bboxes
- Sync.so sync-3 animiert im Full-Plate-Mode mit 4 gleichzeitigen Bboxes typischerweise nur 2 Gesichter zuverlässig — genau die 2 links im Bild
- Alle 4 Passes werden `done` markiert, weil der Single-Job als „gesamter Output" für die Szene gilt

## Fix — 2 Ebenen, minimaler Blast Radius

### A) Wurzelfix: `resolvedCount` korrekt berechnen
**Datei:** `supabase/functions/_shared/plate-face-identity.ts`

Aktuell wird `resolvedCount` unabhängig von der Anzahl der tatsächlich zugewiesenen `characterId`s auf 0 gesetzt (oder von einer Extra-Bedingung abhängig gemacht, die 0.85-Confidence-Matches verwirft). Wir ändern das auf:

```ts
resolvedCount = faces.filter(f => !!f.characterId && f.matchConfidence >= MATCH_CONFIDENCE_MIN).length
```

Mit `MATCH_CONFIDENCE_MIN = 0.7` (die real gemessenen 0.85 fallen zuverlässig darüber; 0.7 ist der Wert, den v160 bereits als „identity-matched" ansieht).

### B) Defense-in-depth im Composer
**Datei:** `supabase/functions/compose-dialog-segments/index.ts`, Bereich um Zeile 4674-4678 und beim v204-Multipass-Fallback

Zusätzliche Bedingung: **wenn** alle 4 Preclips bereits erfolgreich gerendert sind (`passes[i].preclip_url && passes[i].preclip_crop` vorhanden) **und** die Anzahl matched `characterId`s ≥ speakers.length ist, **dann** darf der Full-Plate `bbox-url-pro`-Fallback nicht mehr gewählt werden — stattdessen den Preclip-Pfad dispatchen (jeder Speaker bekommt seinen eigenen Sync.so-Job).

Dieser Guard ist unabhängig von `resolvedCount` und schützt zusätzlich gegen andere Regressionen, die den `resolvedCount`-Zähler nullen.

### C) Diagnose-Log
Ein einziger Log-Eintrag pro Szene beim Pfad-Entscheid:
```
[v222_pipeline_choice] scene=<id> preclipsReady=N/M matchedIds=N/M chosen=preclip|bbox-url-pro reason=<...>
```
Damit die nächste Regression innerhalb einer Log-Zeile erkennbar wird — nicht wie diesmal erst nach DB-Forensik.

## Verifikation

1. `CLIENT_PIPELINE_VERSION` / `COMPOSE_DIALOG_SEGMENTS_VERSION` auf `v222` bumpen
2. `compose-dialog-segments` deployen
3. User setzt die Szene `7d45c852` mit `useResetLipSync` zurück, Composer startet automatisch
4. Erwartung in DB nach ~90s:
   - `preclip_used: true`
   - **4 verschiedene** `sync_job_id`s (einer pro Pass), nicht ein globaler
   - `retry_variant: null` oder `preclip+bbox-explicit`, nicht `bbox-url-pro`
   - `resolvedCount: 4`
5. Visuell: alle 4 Münder animiert

## Was NICHT angefasst wird

- Briefing/Storyboard-Pipeline (v221-Fixes sind produktiv, Thema abgeschlossen)
- v88/v99/v122-Historie (Preclip-Geometrie ist sauber, kein Fix nötig)
- Sync.so-Payload-Vertrag, Mux-Timeline, Audio-Tight-Slicer
- Voice/Cast-UUID-Binding (Wurzel war Pipeline-Choice, nicht Speaker-Zuweisung)

## Zeitplan

Einmaliger Fix, keine Migration. Deploy → Reset → Verify in einem Turn.
