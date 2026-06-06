## Diagnose

Edge-Logs für die fehlgeschlagene 1-Sprecher-Szene (`3e499f91…`):

```
windows=[[0, 2.216]]   ← Sprechfenster
totalSec=10            ← Plate-Länge
audio file: …-char0-samuel-dusatko.wav  (per-speaker, auf 10 s mit Stille gepaddet)
3× Sync.so → "An unknown error occurred."  (sync-3 → sync-3 → lipsync-2-pro)
```

Die Pipeline ist **nicht** identisch mit dem 2-Sprecher-Erfolgsfall:

| Fall  | Payload | Audio an Sync.so |
|-------|---------|------------------|
| N≥2 (funktioniert)   | Fan-out + **Tight-Slice** (`passes.length >= 2` Gate, Zeile 1884) | Per-Pass auf reine Sprechfenster geschnitten (kurz, kein Trailing-Silence) |
| N=1 (schlägt fehl)   | Fan-out, **Tight-Slice deaktiviert** | 10 s WAV mit 0–2.2 s Stimme + 7.8 s Stille |

Sync.so (sync-3 **und** lipsync-2-pro) wirft auf einer Locked-Camera-Plate mit überwiegend stiller Audio (Verhältnis ~22% Speech / 78% Silence) reproduzierbar `provider_unknown_error` — derselbe Fehlerkanal, der uns vor v60 bei N≥2 mit gepaddetem Audio plagte und der durch die Tight-WAV-Slice gelöst wurde.

## Fix-Strategie (Pfad B: "Erfolgs-Pipeline auch für N=1")

Wir bringen N=1 auf **denselben Code-Pfad**, der bei N≥2 grün läuft — kein neuer Mechanismus, nur das Gate öffnen + den Composer-Replay anpassen.

### Änderungen

**1. `supabase/functions/compose-dialog-segments/index.ts`**

- Zeile 1884: Gate von `if (passes.length >= 2 && speakerWindowsSecs.length > 0)` auf `if (speakerWindowsSecs.length > 0)` reduzieren. Damit greift v39 Tight-Slice auch für N=1.
- Für N=1: `sync_mode` zurück auf `"cut_off"` (statt v63 `loop`), weil das Tight-Audio kurz ist und wir den Output exakt auf die Sprechdauer wollen — nicht das geloopte Plate wiederholen. `loop` bleibt für N≥2 unverändert (Master-VO ist dort lang).
  - Konkret: `payloadSyncMode = passes.length >= 2 ? "loop" : "cut_off"` an den drei Dispatch-Stellen (1144, 1920, 2182, plus State-Metadata 2366).
- `audio_url_full` Snapshot bleibt — Retry-Pfad funktioniert weiter, weil `canonicalAudioUrl` schon implementiert ist.

**2. Composer-Replay (Scene-Stitch)**

Sync.so liefert jetzt für N=1 ein ~2.2 s Lipsync-Clip statt 10 s. Der Composer muss die Lücke füllen:

- Datei: `supabase/functions/compose-video-assemble/index.ts` (oder analoger Stitch-Pfad)
- Wenn `dialog_shots.clip_url` kürzer ist als `scene.duration` → erweiterten Render: `[lipsync_clip 0–2.2s]` + `[original_plate 2.2–10s]`.
- Alternativ: das Lambda-Stitching (`render-sync-segments-audio-mux`) bekommt für N=1 zusätzlich `tail_plate_url + tail_start_sec` und konkateniert in Remotion. Diese Route ist sauberer und idempotent.

**3. Memory**

- `mem/architecture/lipsync/v64-n1-tight-slice-parity.md` (neu): Erklärt warum N=1 jetzt auch Tight-Slice nutzt und sync_mode `cut_off` für N=1 reaktiviert wurde.
- `mem/architecture/lipsync/FROZEN-INVARIANTS.md`: Rule I.11 verfeinern → `sync_mode=loop` ist Default für N≥2; `cut_off` ist erlaubt **und erforderlich** für N=1 Tight-Slice, weil sonst stilles Plate-Tail die Sync.so-Engine ins Stocken bringt.
- `mem/index.md`: v64 Eintrag.

### Out of scope

- v62 sync-3 Universal Default bleibt.
- v60 Unified Multi-Speaker Pipeline bleibt unverändert.
- Retry-Ladder, ASD, Face-Gate, Refund-Pfad, Watchdog unverändert.
- Keine Änderung an Director Score / UI Warnungen.

### Verifikation

1. 1-Sprecher Cinematic-Sync Szene neu rendern → Edge-Log zeigt `tight=on windows=[[0,2.216]] sync_mode=cut_off`, Sync.so liefert 200 OK in <60s.
2. Composer-Player zeigt 0–2.2 s Lipsync + 2.2–10 s stilles Plate (keine eingefrorene Szene, VO endet sauber).
3. 2-Sprecher Szene weiterhin grün (Regression-Check) — Pfad unverändert.