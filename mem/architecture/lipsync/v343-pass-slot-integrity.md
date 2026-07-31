---
name: v343 Pass-Slot-Integrity + terminaler Sanity-Block
description: Leere {}-Pass-Slots (RPC-Padding) blockierten Szenen endlos; Padding trägt jetzt idx/status, Slots werden beim Lesen geheilt, der v87-Sanity-Block wird nach 3 Versuchen terminal
type: feature
---

**Verifizierter Root Cause (Szene 69d56a49, 31.07.2026 23:09–23:18):**
`public.update_dialog_pass_slot()` füllte das `passes`-Array beim Schreiben eines
höheren Index mit bare `'{}'` auf. In einer 4-Sprecher-Szene blieb dadurch
`passes[0] = {}` zurück — ohne `idx`, ohne `speaker_idx`, ohne `status`, während
Pass 1–3 sauber `done` waren.

Folge: Jeder Redispatch von Pass 0 las `speaker_idx=undefined` →
`coordSources[-1]` → `"none"` → v87-Sanity-Block in
`compose-dialog-segments/index.ts` → **HTTP 202 `awaiting_face_detection`**.
Nicht-terminal, kein `syncso_inflight_jobs`-Row, kein Pass-Status. Der Watchdog
hatte nichts zu rekonzilieren, die Szene konnte weder fertig werden noch
scheitern — UI hing dauerhaft auf „Lip-Sync läuft… Pass 4/4".

**Regeln:**
1. `update_dialog_pass_slot()` padded nie mit `{}`, sondern mit
   `{idx: n, status: 'pending', slot_padded: true}`. Beim echten Schreiben wird
   `slot_padded` entfernt und `idx` garantiert gesetzt.
2. `compose-dialog-segments` heilt beim Einlesen jeden strukturell kaputten Slot
   (kein numerisches `idx` oder `speaker_idx`) aus dem frisch gebauten
   Turn-Skeleton — Log/Dispatch-Log-Marker `v343_slot_integrity_healed` bzw.
   `SLOT_INTEGRITY_HEALED`.
3. Der v87-Sanity-Block (`coords_heuristic_unverified`) zählt pro Pass in
   `dialog_shots.sanity_block_count_<idx>` und wird nach 3 Versuchen **terminal**:
   `lip_sync_status='failed'` + einmaliger Refund. Kein Pfad darf einen Pass mehr
   unbegrenzt im 202-No-Op halten.

Invariante: **Jeder Pass endet terminal oder liefert ein Output** — ein
Zwischenzustand ohne Inflight-Row und ohne Status ist ein Bug.
