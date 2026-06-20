## v147 — bbox-url-pro als einzige ASD-Strategie

### Ziel
Komplett weg von `auto_detect: true` (Sync.so) — `bbox-url-pro` (deterministische `bounding_boxes_url`) wird der einzige Dispatch-Pfad für Multi-Speaker Dialog-Shots. Damit eliminieren wir die `face_gate_failed:count=0` Klasse von Fehlern komplett, weil Sync.so nicht mehr selbst nach Gesichtern suchen muss.

### Warum jetzt
- v146 Forensik (Run `0b3dafc5`) hat bewiesen: Plates sind sauber, Sarah's Gesicht ist klar bei 32.6% Frame-Coverage sichtbar.
- Der einzige verbleibende Verdächtige ist Sync.so's `auto_detect`, das auf unseren stilisierten Hailuo-Plates flaky ist.
- v126 hatte `bbox-url-pro` schon mal als Primary, wurde aber wegen `provider_unknown_error` in Szene `cba18767` zurückgestellt. Wir lösen das diesmal mit korrektem Fallback + Pre-flight Validation der bbox-URL statt blind dispatchen.

---

### Scope

**Part A — `supabase/functions/compose-dialog-segments/index.ts`**
1. Ladder-Stage 1 für `speakers >= 2`: **`bbox-url-pro`** (bounding_boxes_url) statt `coords-pro` mit `auto_detect`.
2. Single-Speaker (`speakers == 1`) bleibt unverändert — kein ASD nötig.
3. Pre-Dispatch Validation:
   - Prüfen dass `bounding_boxes_url` HTTP 200 liefert und valides JSON enthält.
   - Mindestens 1 bbox pro Speaker-Turn, sonst Fallback Stage 2.
4. Fallback-Ladder (deterministisch, keine `auto_detect`-Stage mehr):
   - Stage 1: `bbox-url-pro` (primary)
   - Stage 2: `coords-pro` mit ASD-Coords aus Preclip (v99-Style explizite bbox)
   - Stage 3: Fail-fast + idempotenter Auto-Refund (kein 4× NOOP-Loop)
5. Telemetry: `asd_mode_chosen`, `bbox_count_at_dispatch`, `bbox_validation_ms` in `syncso_dispatch_log`.
6. Version bump `v147.0`.

**Part B — `supabase/functions/poll-dialog-shots/index.ts`**
- `auto_detect:true` Retry-Pfad entfernen — nur noch deterministische Modes.
- Bei Stage-2 Failure direkt zu Refund-Pfad, kein weiterer Retry.

**Part C — Memory & Docs**
- Update `mem/architecture/lipsync/sync-3-only-dialog-pipeline.md` → bbox-url-pro als Single Source.
- Update `mem/architecture/lipsync/v82-bbox-url-pro-primary.md` → reaktiviert, mit v126-Lessons-Learned Notiz.
- Neuer Eintrag `mem/architecture/lipsync/v147-bbox-url-pro-only.md`.

**Part D — UI (`src/pages/admin/LipsyncDiagnostic.tsx`)**
- `asd_mode_chosen` Spalte in der Dispatch-Log Tabelle anzeigen.
- Verdict-Hint im Forensik-Card aktualisieren: erwähnt nicht mehr `auto_detect`.

---

### Was NICHT geändert wird
- `rehostPlate` (v143)
- Hailuo Prompt-Tuning für `speakers>=3`
- Single-Speaker Pfad
- Schema (keine Migration nötig — `syncso_dispatch_log` hat schon `asd_mode_chosen`)
- Lipsync-Pro Model-Wahl (`sync/lipsync-2-pro` bleibt)
- Pricing / Credit-Refund-Logik

### Risiko & Mitigation
- **Risiko:** v126-Regression (`provider_unknown_error` bei kaputter bbox-URL).
- **Mitigation:** Pre-Dispatch Validation + Stage-2 Coords-Pro Fallback. v126 hatte keinen Fallback — v147 hat einen.

### Validierungsplan
1. `compose-dialog-segments` + `poll-dialog-shots` deployen.
2. Eine 2-Sprecher Szene auf `/video-composer` triggern.
3. `syncso_dispatch_log` checken: `asd_mode_chosen = 'bbox-url-pro'`, `bbox_count_at_dispatch >= 2`.
4. Render-Result visuell verifizieren: beide Sprecher lippen synchron.
5. Erst bei Erfolg: Forensik-Diagnostic-Lauf zur Bestätigung.

OK so umsetzen?
