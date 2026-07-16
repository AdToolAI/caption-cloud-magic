## v246 – Cast-Union Prompt Fix (Lip-Sync Prompt Override)

### Ziel
Verhindern, dass `buildCinematicSyncMasterPrompt` stille Cast-Mitglieder aus dem Master-Prompt drängt. Ergebnis: Master-Plate zeigt immer **alle sichtbaren Charaktere**, nicht nur die Sprecher.

### Root Cause
`supabase/functions/compose-video-clips/index.ts` → `buildCinematicSyncMasterPrompt` baut die "Exactly N persons"-Direktive nur aus `uniqueSpeakerSlugsFromScript()`. Cast-Mitglieder ohne Dialogzeile fallen raus → Prompt kollabiert auf "Exactly 1 person".

### Fix

1. **Cast-Union statt Speaker-Only**
   - Neuer Helper `buildVisibleCastUnion(scene)`:
     - Sprecher aus Skript (per `characterId`)
     - + nicht-absente Cast-Mitglieder aus `scene.cast[]`
     - Dedup strikt per `characterId` (Fallback: normalisierter Name)
     - Reihenfolge: Sprecher zuerst, danach restlicher Cast (stabile ASD-Alignment)

2. **Prompt-Builder umstellen**
   - `buildCinematicSyncMasterPrompt` nutzt Union → "Exactly {N} distinct people: …"
   - Keine Änderung an Lip-Sync-Dispatch, Face-Detect, Sync.so-Payload

3. **Härtungen**
   - Dedup-Regel: `characterId` ist Primary Key; Namens-Match nur wenn ID fehlt
   - Log-Marker `v246_cast_union_prompt` mit `{sceneId, speakerCount, castCount, unionCount, unionIds}` in `edge_function_logs`
   - Guard: wenn `unionCount === 0` → Fallback auf alten Pfad + Warn-Log

4. **Nicht angefasst**
   - v169 Parallel-Fan-Out
   - v242 Row-Major Sort / Assignment-Lock
   - v243 Layout-Drift-Guard / Briefing-Sanitizer
   - Pricing, Credits, UI

### Verification
- Deploy `compose-video-clips`
- Testfall: Szene mit 4 Cast, 1 Sprecher → Prompt muss "Exactly 4 distinct people" enthalten
- Log-Check auf `v246_cast_union_prompt`
- Keine Regression bei reinen Solo-Szenen (unionCount === 1)

### Technische Details
- Datei: `supabase/functions/compose-video-clips/index.ts`
- Neuer Helper inline im selben File (kein neues Modul, um Edge-Function-Bundle klein zu halten)
- Kein DB-Schema-Change, keine Migration, keine Client-Änderung