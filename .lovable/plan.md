## Ziel

Cinematic-Sync Lip-Sync **mit 3 (und perspektivisch N≥3) Charakteren** stabil und kosteneffizient bauen — auf der bestehenden v5 Sync-Segments Pipeline, ohne die funktionierenden 1- und 2-Sprecher-Pfade zu zerstören.

## Ausgangslage

Was wir heute haben (alles produktiv):

```text
compose-video-clips
   → compose-scene-anchor (Nano Banana 2, Two-Shot, outfit-aware)
   → Hailuo i2v Master-Clip (eine geteilte Plate mit allen Köpfen)
compose-twoshot-audio
   → 1 Master-WAV + 1 WAV pro Sprecher + voicedRange.turns[]
compose-dialog-segments (Sync.so v5, Multi-Pass)
   → 1 Pass pro Sprecher, Face-Targeting via twoshot-face-map
sync-so-webhook
   → letzter Pass: render-sync-segments-audio-mux
   → Lambda muxt Master-WAV (alle Stimmen) auf das lipsynced Video
```

Beschränkungen, die heute genau bei 3 Charakteren brechen:

1. **`twoshot-face-map.ts` ist hart auf `side: "left" | "right"` codiert** — bei 3 Gesichtern wird einer dauerhaft falsch zugeordnet.
2. **`askGeminiForIdentityMatch` returnt nur `{ left, right }`** — kein „center" / kein N-Slot.
3. **`pickSpeakerCoordinates` fällt bei N≥3 auf `faces[speakerIdx]`** zurück, was nach Sortierung zwar nach x funktioniert, aber ohne Identitäts-Match driftet (z.B. wenn zwei Charaktere ähnlich aussehen oder die Plate eine andere Reihenfolge zeigt als der Cast).
4. **Anchor-Compose**: Nano Banana 2 mit 3 Portraits in einer Plate ist machbar, aber „equal screen share, alle Münder frei, keine Hand vorm Mund" wird unzuverlässig — wir brauchen ein N-aware Prompt-Template + strengeres Face-Count-Audit (`faces ≥ 3`).
5. **Sync.so-Kosten**: Multi-Pass-Chain → 3 Sprecher = 3 Sync.so-Calls auf demselben Master-Video (~3 × Dauer × 9 credits). Kein Bug, aber wichtig zu wissen für die Tier-Limitierung.
6. **Reliability**: 3 sequentielle Sync.so-Pässe + Lambda-Mux = mehr Failure-Punkte, längere Watchdog-Timeouts nötig.

## Empfohlene Strategie

**Inkrementell auf der bestehenden v5-Pipeline aufbohren — kein neuer Pfad, kein separates „3-Charakter-Modul".**

Begründung: Die Pipeline ist bereits N-fähig konzipiert (Multi-Pass, Segments-API, Audio-Mux am Ende). Nur das **Face-Targeting** und das **Anchor-Audit** sind hart auf 2 verdrahtet. Ein zweites Modul würde die ohnehin schon komplexe Diagnose verdoppeln.

### Phase A — Face-Map auf N-Slots umstellen *(Kern-Fix)*

`supabase/functions/_shared/twoshot-face-map.ts`:

- `FaceMapFace.side` ersetzen durch `slotIndex: number` (0..N-1, x-sortiert) und `slotLabel: "left" | "center-1" | "center-2" | … | "right"` rein zur Diagnose.
- `askGeminiForFaces`-Prompt: Schema → `{"faces":[{slot:<int>,center:[nx,ny],bbox:[…]}]}`, „slot = index after sorting by normalized x ascending, starting at 0".
- `askGeminiForIdentityMatch`: neues Schema `{"assignments":[{slot:<int>, characterId:<id|null>}], "confidence":<0..1>}`. Charaktere werden als nummerierte Liste mit Portrait-URLs übergeben.
- `pickSpeakerCoordinates(faceMap, speakerIdx, characterId)`: Priorität bleibt **(1) Identity-Match per `characterId` → (2) `slotIndex === speakerIdx` Fallback → (3) heuristisch `faces[min(speakerIdx, len-1)]`**.
- Backwards-Compat: alte Caches mit `side` lazy migrieren (`slotIndex = side === "left" ? 0 : 1`), sonst Cache verwerfen.

**Wirkung:** 2-Sprecher-Pipeline läuft byte-identisch weiter (slot 0 = left, slot 1 = right), 3+ Sprecher bekommen sauberes per-Slot-Targeting.

### Phase B — Anchor für N≥3 härten

`supabase/functions/compose-scene-anchor` (bzw. der `neutralTwoShotPrompt`-Helper):

- Neue Helper-Funktion `neutralGroupShotPrompt(names, count)` mit Regelsatz:
  - „Wide medium shot, all N characters visible left-to-right, equal screen share"
  - „Each character's full face and mouth clearly visible, no hand in front of mouth, no occlusion, no overlap"
  - „Identical lighting on every face"
- `compose-video-clips` wählt Prompt nach `portraitUrls.length`:
  - 1 → Solo-Plate (unverändert)
  - 2 → `neutralTwoShotPrompt` (unverändert)
  - ≥3 → `neutralGroupShotPrompt`
- Face-Count-Audit auf `>= expected` (statt `>= 2`); bei Fehler 1× Strict-Retry mit explizitem „render exactly N faces". Danach `anchor_missing_speakers` Marker + Refund.
- `ANCHOR_AUDIT_VERSION = 6` bumpen, damit alte v5-Two-Shot-Plates für jetzt 3-Sprecher-Szenen neu komponiert werden.

### Phase C — Sync.so Multi-Pass für N Sprecher

`compose-dialog-segments` ist bereits Multi-Pass (`passes[]`), muss nur:

- `passSpeakers` baut N Pässe statt 2 (existiert konzeptionell schon — verifizieren, dass `speakers.length` nicht irgendwo auf 2 gecapped wird, insb. in `audio_plan.twoshot.faceMap`-Persistierung).
- Pro Pass `options.activeSpeakerDetection.coordinates` aus `pickSpeakerCoordinates(map, speakerIdx, characterId)`.
- **Reihenfolge**: Sprecher mit den meisten Sekunden zuerst → reduziert Chain-Drift (jede Pass-Output ist Input der nächsten, weniger Re-Encoding-Verlust für den prominentesten Speaker).

### Phase D — Audio-Mux & Webhook unverändert

`render-sync-segments-audio-mux` + `sync-so-webhook` letzter-Pass-Branch funktionieren bereits N-agnostisch (`passes.length >= 2` triggert Mux). Nur prüfen, dass:

- `audio_plan.twoshot.url` (Merged-Master-WAV mit allen N Stimmen) korrekt von `compose-twoshot-audio` geliefert wird → das tut sie heute schon, weil `compose-twoshot-audio` über `blocks[]` iteriert und nicht auf 2 limitiert ist.
- `dialog_shots.audio_mux.render_id` idempotent bleibt.

### Phase E — Reliability & Limits

- **Watchdog**: per-shot 8-min Sync.so-Timeout × N Pässe → Gesamt-Hard-Cap für die Szene auf `8 * N + 5` Minuten anheben (heute Konstante in `poll-dialog-shots`).
- **Credit-Refund**: Pro Pass-Failure → Sync.so anteilig refunden (existierender Pricing-Layer kann das, nur `passes.length` als Multiplikator durchreichen).
- **Soft-Limit N=4**: Mehr als 4 Sprecher in einer Szene erstmal blockieren (UX-Toast „Bitte Dialog in 2 Szenen splitten"). Begründung: Anchor-Qualität fällt mit >4 Köpfen drastisch, Kosten explodieren linear.
- **Beobachtbarkeit**: `dialog_shots.passes[].speaker_id`, `coords_source` (`identity` / `slot` / `heuristic`) + `face_match_confidence` persistieren → späteres Debugging „warum hat Charakter B die Lippen für Charakter C bewegt".

### Phase F — UI / Composer

`src/components/video-composer/SceneDialogStudio.tsx` + `SceneCard.tsx`:

- Cast-Picker erlaubt bereits N — nur ein expliziter Hinweis „3 Sprecher: längere Render-Zeit, höhere Credit-Kosten (~N × Dauer × 9)".
- Pipeline-Progress: `usePipelineProgress` zählt schon `dialog_shots.passes[].status` — verifizieren, dass der Soft-Floor nicht bei 2/N pinnt.

## Was nicht angefasst wird

- 1-Sprecher Cinematic-Sync (gerade stabilisiert).
- 2-Sprecher v5 Pipeline (Side-basiertes Targeting läuft als Spezialfall der neuen slot-basierten Logik weiter).
- Engine-Override-Normalisierung, Auto-Director, Universal-Creator.
- HeyGen Talking-Head (eigener Pfad, kein Multi-Speaker).

## Reihenfolge der Umsetzung (Build-Mode)

1. Phase A (Face-Map N-Slots) — kein UI, voll backward-kompatibel
2. Phase B (Anchor Group-Shot + Audit v6) — auf Test-Szene mit 3 Charakteren verifizieren
3. Phase C (Sync.so N-Pass verifizieren, ggf. Caps entfernen)
4. Phase E (Watchdog/Credits/Soft-Limit 4)
5. Phase F (UI-Hinweis)
6. Phase D ist No-Op, nur QA

## Test-Plan

- 1-Sprecher Cinematic-Sync — Regression, muss unverändert grün bleiben.
- 2-Sprecher — Regression mit migriertem `side→slotIndex` Cache.
- 3-Sprecher Dialog (z.B. Interviewer + 2 Gäste) — neuer Happy-Path.
- 3-Sprecher mit visuell ähnlichen Charakteren — stresst Identity-Match.
- 4-Sprecher — Grenzfall, sollte gerade noch laufen.
- 5-Sprecher — muss durch Soft-Limit-Toast geblockt werden.
