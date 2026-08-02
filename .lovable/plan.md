## Kurzantwort

Ja — die Ursache ist belegt, nicht vermutet:

- Der Webhook hat pass 4 um 09:09:32 verarbeitet (`status=COMPLETED`), also kein Hänger und kein verlorener Callback. Die „4/4"-Anzeige war das ~90 s Warten zwischen Dispatch (09:08:02) und Provider-Antwort.
- Der Abbruch kam aus der Verdikt-Logik: `verdict=passthrough score=84.38 outVsIn=2.3105 … max_delta=2.311<3`.
- Pass 4 hatte damit die **stärkste** gemessene Mundbewegung aller vier Pässe (84 vs. 44 bei dem Pass, der durchging) und wurde trotzdem terminal verworfen, weil eine einzelne Magic Number (`PASSTHROUGH_MAX_SCORE = 3.0`) den Ausschlag gab. Der im Code dokumentierte Rauschbereich echter Passthroughs liegt bei 1.1–2.1 — 2.31 liegt im Rauschen, nicht im Beweis.

Die sauberste Lösung ist deshalb **nicht**, die Schwelle zu senken (das macht die nächste Grenzwert-Lotterie auf), sondern das Verdikt auf mehrere unabhängige Kriterien zu stellen und Unsicherheit als `unknown` (Telemetrie, kein Abbruch) statt als Hard-Fail zu behandeln.

---

## Plan v371 — Evidenzbasiertes Passthrough statt Einzelschwelle

### 1. Verdikt-Logik (`supabase/functions/_shared/mouth-motion-verdict.ts`)
- Passthrough nur bei **Übereinstimmung mehrerer Kriterien**:
  - `max(outVsIn) < PASSTHROUGH_HARD_MAX` (2.0 = gemessenes Re-Encode-Rauschen), **und**
  - `median(outVsIn) < 1.5` (nicht ein einzelner Ausreißer-Frame), **und**
  - kein Veto durch Eigenbewegung.
- **Eigenbewegungs-Veto:** `score >= STRONG_MOTION_SCORE` (12) und `max(outVsIn) > 1.8` → `moved`. Ein Provider, der den Input zurückgibt, kann nicht gleichzeitig ein stark bewegtes Mundband und messbaren Abstand zum Input liefern.
- Graubereich (schwache Eigenbewegung, `outVsIn` zwischen den Bändern) → `unknown`. `unknown` bleibt wie in v348 reine Telemetrie und blockiert den Mux nicht.

### 2. Messqualität
- Sampling strikt in das Sprechfenster des Turns (`windowStartSec`/`windowEndSec`), Frames außerhalb verwerfen; Samples von 4 auf 6.
- Alle `outVsIn`-Deltas plus das entscheidende Kriterium in die Pass-Forensik (`_v371_verdict`) schreiben — kein Log-Graben mehr beim nächsten Fall.

### 3. Webhook (`supabase/functions/sync-so-webhook/index.ts`)
- Hard-Fail nur bei `passthrough` oder `static`; `unknown` läuft weiter.
- Fehlertext um die Messwerte ergänzen (`outVsIn`, `score`, Frames), damit die UI-Meldung belegbar ist.

### 4. Zustands-Konsistenz
Die Szene steht nach dem Hard-Fail auf `lip_sync_status='failed'` + `twoshot_stage='needs_clip_rerender'`, gleichzeitig aber auf `clip_status='ready'` mit gesetzter `clip_url` (in der DB verifiziert). Beim Hard-Fail zusätzlich `clip_status='failed'` setzen, damit die UI keinen widersprüchlichen „fertig"-Zustand rendert.

### 5. UI-Wartefenster (`src/hooks/usePipelineProgress.ts` + Lip-Sync-Badge)
- Statt fixer 95 % im letzten Pass: Fortschritt aus `done/total` der Pässe, plus verstrichene Zeit des laufenden Passes („Pass 4/4 · 1:12").
- Nach 4 Minuten ohne Provider-Antwort ein sichtbares „Provider antwortet nicht — Watchdog übernimmt"-Label statt eines eingefrorenen Balkens.

### Verifikation
- Regressionstests der Verdikt-Matrix: (84 / 2.31) → `moved`; (3 / 1.2) → `passthrough`; (44 / 4.08) → `moved`; Grauzone → `unknown`.
- Danach ein 4-Sprecher-Lauf derselben Szene und Kontrolle der Pass-Verdikte in der DB.

### Technische Notiz
Keine Änderung an Dispatch-, Preclip- oder Geometrie-Pfad (v355/v356/v359 bleiben unangetastet). Die Änderung betrifft ausschließlich die Bewertung des Provider-Ergebnisses, die Statuskonsistenz und die Anzeige.
