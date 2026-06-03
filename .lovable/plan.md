## Diagnose

Ich kenne den Fehler jetzt: Es ist **kein UI-Loop als Hauptursache**, sondern die neue v24-Pipeline ist immer noch provider-instabil.

Was bei Scene `4a56d6a1-2f0b-4ef1-8bef-20fa0477ff68` passiert ist:

```text
Pass 1/3: Original Scene-Plate + Samuel-Audio -> Sync.so OK
Pass 2/3: Pass-1-Output + Matthew-Audio -> Sync.so FAILED: "An unknown error occurred."
Pass 3/3: nie gestartet
```

Der entscheidende Fehler: Die aktuelle `compose-dialog-segments`-Pipeline ist **keine echte parallele Multi-Speaker-Pipeline**, sondern eine **Kette**:

```text
Original -> Speaker 1 -> Speaker 2 -> Speaker 3
```

Sync.so akzeptiert den ersten Job, lehnt aber den zweiten Job auf dem bereits von Sync.so erzeugten Zwischenvideo ab. Genau das zeigen die Logs: Pass 1 wurde re-hosted, Pass 2 mit diesem re-hosted Video wurde rejected.

Zusätzlich:
- `useTwoShotAutoTrigger.ts` routed 3+ Sprecher weiterhin explizit zu `compose-dialog-scene`; der Forwarder kaschiert das nur.
- `sync-so-webhook.ts` blockiert bei 3+ Sprechern den Auto-Fallback, deshalb endet die Szene terminal mit `syncso_segments_FAILED`.
- Die UI zeigt noch die alte/irreführende „3 Dialog-Shots“-Sprache, obwohl der aktuelle Pfad inzwischen anders arbeitet.
- Das Credit-Modell in `compose-dialog-segments` berechnet aktuell nur `ceil(duration) × 9`, obwohl bei N Sprechern N Sync.so-Jobs laufen. Das muss für korrekte Refunds/Spend-Control auf `× speakerPasses` korrigiert werden.

## Ziel

Eine robuste, dauerhafte Pipeline für 1–4 Sprecher, ohne Sync.so-Output wieder als Sync.so-Input zu verwenden.

Neue Architektur:

```text
Original Scene-Plate
  ├─ Sync.so Job A: Original + Sprecher A Full-Length-Audio
  ├─ Sync.so Job B: Original + Sprecher B Full-Length-Audio
  ├─ Sync.so Job C: Original + Sprecher C Full-Length-Audio
  └─ Sync.so Job D: Original + Sprecher D Full-Length-Audio
        ↓
Face-/Mouth-Mask-Compositor
        ↓
Final video + gemerged master audio
```

Das ist der stabile Provider-Pattern: **fan-out auf unveränderte Original-Inputs, fan-in über eigenen Compositor**. Keine Kette, keine Preclip-Drift, kein Provider-Loop.

## Umsetzungsplan

### 1. Chained Multi-Pass entfernen

In `supabase/functions/compose-dialog-segments/index.ts`:
- `passInputUrl` wird für jeden Sprecher immer `sourceClipUrl` sein.
- Kein `Pass N input = Pass N-1 output` mehr.
- Jeder Sprecher-Pass bekommt:
  - dasselbe Originalvideo,
  - seinen full-length padded WAV-Track,
  - seine eigenen `active_speaker_detection.coordinates`,
  - denselben stabilen `sync_mode`.
- State wird von „current_pass chain“ auf „fanout passes“ umgestellt:

```text
passes[] = pending/rendering/done/failed pro Sprecher
status = rendering bis alle done sind
```

### 2. Webhook auf Fan-In statt Chain umstellen

In `supabase/functions/sync-so-webhook/index.ts`:
- Bei completed pass: nur diesen pass als `done` speichern.
- Nicht mehr automatisch `advance: true` starten.
- Wenn alle passes `done` sind: neuen Compositor/Mux starten.
- Bei failed pass:
  - bounded retry pro pass,
  - danach terminal failure über `failLipSync()` mit idempotentem Refund,
  - keine automatische Rücksetzung auf `pending`.

### 3. Initiale Fan-Out-Dispatches kontrolliert starten

In `compose-dialog-segments`:
- Nach Preflight/Face-Gate werden alle Sprecher-Jobs gestartet, aber mit Sync.so-Slotlimit.
- Wenn nicht genug Slots frei sind:
  - Szene bleibt serverseitig `running/deferred`,
  - keine Client-Reset-Logik,
  - nächster Cron/Trigger dispatcht die restlichen pending passes.
- Damit gibt es keinen doppelten Start und keine orphaned Jobs.

### 4. Neuer Mask-Compositor für finale Szene

Neuer/erweiterter Render-Schritt, z. B. `render-sync-segments-audio-mux` erweitern oder neue Function `render-dialog-fanout-composite`:
- Input:
  - Original Scene-Plate,
  - alle per-speaker Sync.so Outputs,
  - Face-Box/Coords pro Sprecher,
  - master WAV aus `audio_plan.twoshot.url`.
- Render-Logik:
  - Originalvideo als Base.
  - Pro Sprecher nur den Face-/Mouth-Bereich aus seinem Sync.so-Output darüberlegen.
  - Weiche Feather-Maske, damit keine sichtbaren harten Kanten entstehen.
  - Master-Audio final muxen, damit alle Stimmen hörbar sind.
- Ergebnis schreibt wie bisher `clip_url`, `lip_sync_applied_at`, `lip_sync_status='applied'`.

### 5. Face-Box-Daten stabilisieren

In `_shared/twoshot-face-map.ts` / bestehender Face-Gate-Logik:
- Neben `coords` auch eine sichere `box` pro Sprecher speichern.
- Wenn nur ein Punkt vorhanden ist, Box deterministisch schätzen:

```text
center = speaker coords
box width ≈ 14–18% video width / speaker count adjusted
box height ≈ 22–28% video height
focus = lower face / mouth zone
```

- Für 3+ Sprecher ist das besser als Sync.so-Auto-Fallback, weil wir deterministisch die richtige Person maskieren.

### 6. Trigger-Routing bereinigen

In `src/hooks/useTwoShotAutoTrigger.ts`:
- 1–4 Sprecher gehen direkt zu `compose-dialog-segments`.
- `compose-dialog-scene` bleibt nur noch Legacy/Backcompat oder wird hart deaktiviert.
- Die Kommentarlogik, die 3+ Sprecher wieder auf `compose-dialog-scene` schickt, wird entfernt.

### 7. UI ehrlich machen

In `SceneDialogStudio` / `PipelineProgressBar`:
- Texte von „3 Dialog-Shots“ ändern zu „3 Sprecher-Lip-Syncs werden kombiniert“.
- Bei `failed` klar anzeigen:
  - echter `clip_error`,
  - „Sauber neu starten“ bleibt der einzige Restart-Weg,
  - kein automatischer Loop.

### 8. Credits/Refunds korrekt machen

In `compose-dialog-segments` und `failLipSync()`-State:
- Kosten = `ceil(totalSec) × 9 × numberOfSpeakerPasses`.
- Bei Teilerfolg + späterem Fail: voller reservierter Betrag wird einmalig refundet.
- Bei deferred Slots: keine doppelte Abbuchung.
- `dialog_shots.cost_credits` wird die einzige Refund-Quelle.

### 9. Stuck-Szenen sauber zurücksetzen

Nach Code-Fix:
- Die aktuelle failed Scene `4a56d6a1-2f0b-4ef1-8bef-20fa0477ff68` wird über den bestehenden Reset-Pfad bzw. ein gezieltes Daten-Update sauber auf `pending` zurückgesetzt.
- Alte inflight Sync.so-Jobs werden entfernt.
- Refund bleibt idempotent.

### 10. Verifikation

Ich prüfe nach Umsetzung:
- 1 Sprecher: single Sync.so pass → applied.
- 2 Sprecher: fanout oder vorhandener stabiler Pfad → applied.
- 3 Sprecher: 3 unabhängige Jobs auf Originalvideo → Composite → applied.
- 4 Sprecher: 4 unabhängige Jobs → Composite → applied.
- Sync.so-Fail: terminal failed + Refund + kein Auto-Loop.
- Reset-Button: failed → clean pending → neuer sauberer Start.

## Ergebnis

Der dauerhafte Fix ist: **keine Sync.so-Kette mehr**. Jeder Sync.so-Job bekommt nur noch das Originalvideo. Die Kombination passiert vollständig in unserer eigenen Render-Pipeline. Dadurch hängen wir nicht mehr an Sync.so-Zwischenoutputs, und der aktuelle Pass-2-Fail kann strukturell nicht mehr auftreten.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>