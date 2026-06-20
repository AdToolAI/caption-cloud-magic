## Ehrliche Antwort zu deiner Frage

Deine Einschätzung (40-50% Sync.so / 50-60% Pipeline) ist auf Basis dessen, was im Code steht, **nicht mehr fair zu Sync.so**. Stand heute liegt das Verhältnis bei uns realistischer eher bei:

- **~70-80% Pipeline-Komplexität**
- **~20-30% echte Sync.so-Edge-Cases** (z.B. silent NOOP bei `auto_detect:true` auf kleinen Crops — das ist real)

Der Hauptgrund: wir haben eine sehr saubere Idee (Single-Face-Crop + tight audio + sync-3 + cut_off) unter 80+ Versionsschichten (v41 bis v137) begraben. Die Pipeline ist nicht falsch — sie ist **überlagert**.

## Was die Audits zeigen

- `compose-dialog-segments/index.ts` hat **5.766 Zeilen** für eine konzeptionell kleine Aufgabe.
- In `mem/architecture/lipsync/` liegen **80+ Memory-Dateien** zu derselben Pipeline (v41 bis v137).
- Es gibt mindestens **5 parallel lebende ASD-Strategien** (auto_detect, bbox-url, bbox-inline, coords, coords-pro, v131.4 forced auto, v136 centered) — die meisten widersprechen sich teilweise.
- Im `sync-so-webhook` liegen **~110 Zeilen toter Retry-Code** hinter `canRetry = false`.
- Die NOOP-Eskalationsleiter (v134) kann ein NOOP-Ergebnis als `done` akzeptieren, wenn `canEscalate=false` getroffen wird — genau das, was bei Samuel & Matthew passiert ist.

## Konkrete Ursache des aktuellen Runs (Szene `70555e30…`, 17 min)

1. **Sprecher 3+4 sprechen, 1+2 nicht** → Pass 0 und 1 sind durch den `COMPLETED_NOOP_SUSPECT`-Pfad gelaufen und am Ende trotzdem als `done` geschrieben worden. Das ist nicht Sync.so, das ist unser eigener "soft accept".
2. **17 statt 6-8 Minuten** → Plan-D-Fanout war im letzten Run weiterhin **nicht aktiv** (Logs zeigen `PLAN_D_FANOUT_BLOCKED_V128`), obwohl die DB-Flags `true` sind. Bedeutet: deployte Funktion las den neuen DB-Switch noch nicht. Plus 1-2 NOOP-Retry-Zyklen pro betroffenem Sprecher = `~3-5 min` extra pro Sprecher.
3. **`audio_vs_video_delta_sec = 5-8s`** ist nicht das Problem — das ist nur ein Diagnose-Feld (Voll-WAV vs Preclip-Dauer) und unter `cut_off` normal.

## Antwort auf deine Kernfrage

> Haben wir die Pipeline sauber genug aufgesetzt?

Konzept: **ja**. Implementierung: **nein, nicht mehr**. Wir haben jede Stufe sauber gebaut, aber nie zurückgeschnitten. Jeder neue Fix lebt parallel zu den alten Fixen. Das ist der eigentliche Grund, warum "alles, was schiefgehen kann, schiefgeht": es gibt zu viele Pfade, von denen mehrere veraltet sind.

## Plan v138 — Konsolidierung statt nochmal-Fix

Drei Sachen, keine vierte.

### A. Konsolidieren (Code shrinken, kein neues Feature)

`compose-dialog-segments` auf einen einzigen Dispatch-Pfad reduzieren:

```text
für jeden Sprecher-Turn:
  1. plate-face-identity (Hungarian) lockt coords  [behalten]
  2. Single-Face-Preclip rendern                   [behalten]
  3. tight WAV slicen                              [behalten]
  4. Sync.so payload:
       model: sync-3
       sync_mode: cut_off
       active_speaker_detection:
         auto_detect: false
         frame_number: 0
         coordinates: [[size/2, size/2]]           [v136, einziger Pfad]
  5. dispatch
```

Was rausfliegt:
- `resolveSceneFaceMap` (Anchor-Faces) — wird seit v129.20 von `resolvePlateFaceIdentities` ersetzt
- `bbox-url-pro`, `coords-pro-box`, `auto-pro`, `auto-standard` als First-Dispatch-Varianten
- v131.4-`auto_detect:true`-Pfad auf Preclips
- Full-Plate-Coords-Fallback ohne Preclip
- Toter Retry-Ladder im sync-so-webhook (`canRetry = false`-Block)
- `isV41Retry`, `forceMultipass`, `retryNoAsd` Body-Flags

Resultat-Erwartung: `compose-dialog-segments` von ~5.700 auf ~2.000-2.500 Zeilen.

### B. NOOP ist niemals "done"

Im sync-so-webhook:
- Wenn `noopSuspect && !canEscalate` → **immer** hart failen + refunden, nicht still als done akzeptieren.
- v134-Ladder bleibt, aber endet entweder bei klarem Erfolg oder klarem Fail. Nie bei "vielleicht ok".

### C. Plan-D-Fanout wirklich aktivieren und verifizieren

- Code-Default in `compose-dialog-segments` umdrehen: `parallelFlagOn` defaultet auf `true`, `concurrencyCap=2`, env-Killswitch wird nur als Notfall-Abschalter genutzt.
- Nach Deploy einmal mit einem 3-Sprecher-Run im Log verifizieren, dass `plan_d_parallel_dispatch_start` erscheint und `PLAN_D_FANOUT_BLOCKED_V128` nicht.

### Erwartete Wirkung

- 4-Sprecher-Szene: **~6-10 Minuten** statt 17-23 (Fanout cap=2 + entfallene NOOP-Retries auf Pässen, die unter v136 sauber laufen).
- Kein "alle done, aber 2 Sprecher bewegen die Lippen nicht" mehr — entweder alle sprechen oder die Szene failt sichtbar mit Refund.
- Wartbarkeit drastisch besser: 1 Dispatch-Pfad, 1 ASD-Strategie, 1 NOOP-Endzustand.

### Was ich NICHT vorschlage

- Provider-Wechsel
- Hin- und Herwechsel zwischen sync-3 und lipsync-2-pro
- Noch eine weitere v138/v139/v140-Schicht ÜBER dem aktuellen Code
- Neue Gates oder neue ASD-Modi

### Memory-Hygiene parallel dazu

Die 80+ vXXX-Memory-Dateien werden auf eine kompakte Wahrheitsquelle zusammengeschnitten:
- `mem/architecture/lipsync/CANONICAL.md` — eine Seite, was die Pipeline tut
- `mem/architecture/lipsync/FROZEN-INVARIANTS.md` — bleibt
- Alles dazwischen (v41-v137 außer aktiv referenzierten) wird als historisch markiert oder gelöscht, sobald v138 stabil läuft.

### Risiko

Konsolidierung ist invasiv. Konkretes Sicherheitsnetz:
- Vorher Snapshot der aktuellen Edge-Functions
- Eine 3-Sprecher- und eine 4-Sprecher-Szene als Smoke-Test direkt nach Deploy
- Wenn ein Smoke-Test failt: sofort zurück zur Pre-v138-Version, nichts hängt am User-Run

### Dateien, die ich im Build-Modus anfassen würde

- `supabase/functions/compose-dialog-segments/index.ts` (massive Reduktion)
- `supabase/functions/sync-so-webhook/index.ts` (NOOP-Endzustand + toten Retry-Code raus)
- `supabase/functions/_shared/twoshot-face-map.ts` (nur noch `pickSpeakerCoordinates` als Fallback)
- `mem/architecture/lipsync/CANONICAL.md` (neu) + `mem/index.md`

Kein neuer Provider, keine neue Strategie, keine neue Gate-Schicht. Nur das, was wir schon haben, in **eine** Spur bringen und Plan-D wirklich an.