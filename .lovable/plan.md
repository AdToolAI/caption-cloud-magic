# FA-4 Forensischer Audit übernehmen + Visuelles Review

Ziel: Den bereits erhobenen forensischen Audit des Runs `b9acfae3-8121-45ba-950a-9a1ad5373f5a` (S11) in `docs/v433-motion-studio-final-acceptance.md` einbauen, den Status auf **TECHNICAL PASS / VISUAL REVIEW PENDING** setzen und anschließend den finalen Clip visuell/auditiv prüfen.

Keine Code-Änderungen, kein neuer Render, keine Retry/Reset-Operationen.

---

## 1. Dokumentation: Audit in v433-FA-Dokument einbauen

**Datei:** `docs/v433-motion-studio-final-acceptance.md`

### 1.1 Überschrift und Status korrigieren
- Den Abschnitt `## FA-4 FINAL RETEST RENDER (S11) — Ergebnis: **PASS**` umbenennen in:
  `## FA-4 FINAL RETEST RENDER (S11) — Ergebnis: **TECHNICAL PASS / VISUAL REVIEW PENDING**`
- Den Einleitungssatz anpassen: technische Pipeline-Kriterien bestanden, finale visuelle/auditive Prüfung steht noch aus.

### 1.2 Bestehende "Visuelle Prüfung" ersetzen
- Die aktuelle `### Visuelle Prüfung` (Zeilen 1411–1417) entfernen/überschreiben.
- Ersatz durch einen neutralen Absatz, der erklärt, dass die visuelle Prüfung noch aussteht und separat dokumentiert wird.

### 1.3 Neuer Unterabschnitt: `### Forensischer Audit (read-only)`
Inhalt aus `.lovable/plan/fa-4-forensischer-audit-run-b9acfae3-read-only-keine-änderun-2026-08-17.md` übernehmen, komprimiert auf die 10 Audit-Punkte:

1. Run / Scene (run_id, scene_id, Zeiten, Status)
2. Erwartete vs. tatsächliche Dauer
3. Jobs dieses Runs (Ledger, chronologisch)
4. Dialog-Turns (6, kanonisch)
5. Sync-Segmente (segment_id == dialog_turn.id)
6. Stitch (kein separater Job, Teil von audio_mux)
7. Audio-Mux (Fakten)
8. Finaler Output (ffprobe)
9. Output-Kette
10. Neutraler Abschluss

### 1.4 Auffälligkeiten neutral dokumentieren
- **3,751 s Stille am Szenenende**: als Beobachtung dokumentieren, keine P0/P1-Bewertung; erst visuell/auditiv bewerten.
- **face_probe_unavailable ×6**: als non-blocking Warning dokumentieren; nicht hochstufen, solange Face-/Identity-Zuordnung im finalen Clip korrekt ist.
- **keine composer_scene_runs-Row**: als Beobachtung dokumentieren, kein FA-4-Blocker, solange der aktuelle produktive Run-/Ledger-Vertrag diese Tabelle nicht als SoT voraussetzt.

### 1.5 Abschlussstatus im Dokument
Einen klaren Abschlussblock einfügen:

```text
FA-4 FINAL RETEST — TECHNICAL PASS / VISUAL REVIEW PENDING

Technische Pipeline-Kriterien bestanden: Plate, Preclip, 6/6 turn-backed Sync-Segmente, Audio-Mux, finaler Output und Ledger-Kardinalität korrekt.
Noch offen: finale visuelle/auditive Prüfung auf richtige Stimme ↔ Character-Zuordnung, richtigen Mund, stabile Face-/Slot-Zuordnung und sichtbare Artefakte.
Kein weiterer Render, kein Retry, kein Reset.
```

---

## 2. Visuelles/auditives Review des finalen Clips

**Vorgehen:** Playwright gegen die laufende App, authentifizierter Zugriff auf Szene S11 (`e658509d-cdeb-40f7-bd33-98e74144fdc5`).

### 2.1 Vorbereitung
- Session aus `LOVABLE_BROWSER_SUPABASE_*` wiederherstellen (sofern vorhanden) oder via `lovable auth-session --json` eine Session für `info@useadtool.ai` minten.
- Zur Szene S11 im Studio navigieren (`/video-composer` oder direkter Szenen-Link).
- Den finalen Output (`processed_video_url`) abrufen und in einem frischen Browser-Tab laden.

### 2.2 Prüfpunkte während der Wiedergabe
- Video abspielen (Ton eingeschaltet).
- Screenshots bei ca. 0,5 s / 2 s / 4 s / 6 s / 8,5 s / 10,5 s / 13 s (je nach Turn-Fenstern).
- Folgendes bewerten:
  - [ ] Alle 4 Personen (Sarah, Samuel, Matthew, Kay) sind im Frame und behalten ihre Position/Slot.
  - [ ] Sarah spricht in Turn 1 und Turn 5, behält dabei denselben Character/Slot.
  - [ ] Samuel spricht in Turn 2 und Turn 6, behält dabei denselben Character/Slot.
  - [ ] Matthew (Turn 3) und Kay (Turn 4) sprechen korrekt zugeordnet.
  - [ ] Stimmen passen zur Voice-Map (Lena/Stefan/Markus/Klaus).
  - [ ] Mundbewegung ist nur beim aktiven Sprecher sichtbar; Listener bleiben ruhig.
  - [ ] Keine sichtbaren Artefakte (Flackern, Slot-Sprünge, Doppelgesichter, Ränder).
  - [ ] Die 3,751 s Stille am Ende wirken nicht störend (normales Ausklingen der 15-s-Platte).

### 2.3 Ergebnisdokumentation
- Befund in `docs/v433-motion-studio-final-acceptance.md` unter einem neuen `### Visuelles Review` eintragen.
- Screenshots unter `/tmp/browser/fa4-visual-review/` speichern und im Bericht referenzieren.

---

## 3. Finaler Status nach visuellem Review

### Falls alle Prüfpunkte bestanden
- Abschnitt `## FA-4 FINAL RETEST RENDER (S11)` auf `**PASS**` ändern.
- `FA-4 FINAL RETEST = PASS.` eintragen.

### Falls Auffälligkeiten
- Status bleibt `TECHNICAL PASS / VISUAL REVIEW PENDING` oder wird zu `VISUAL REVIEW: ISSUES`.
- Jede Auffälligkeit neutral beschrieben, mit Timestamp/Screenshot.
- Kein automatischer Retry/Fix/Render ohne separates GO.

---

## Abgrenzung / Nicht im Scope

- Keine Code-Änderungen an der Lip-Sync-Pipeline, dem Composer, dem Ledger oder dem UI.
- Kein neuer Render, kein Retry, kein RS3-Reset, keine manuellen DB-Writes.
- Keine weiteren FA-Blöcke (FA-1, FA-2, FA-3) werden neu bewertet.
