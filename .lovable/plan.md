## v153.2 — Plate-Identity-Hydration für ALLE Passes (Advance + Retry)

### Root-Cause-Analyse (aus den echten Edge-Logs)

WIRE_PAYLOAD-Logs vom letzten Run zeigen für Pass 1, 2, 3:
```
WIRE_PAYLOAD version=v153.1 model=sync-3 options={"sync_mode":"cut_off","active_speaker_detection":{"auto_detect":true}}
```

Es fehlt komplett der erwartete `v153.1_unified_bbox_primary`-Log und auch der `v153_preflight_BLOCK`-Log. Heißt: die v153-Gates triggern für keinen einzigen Pass. Grund liegt in `compose-dialog-segments/index.ts`:

- **Zeile 1232**: `resolvePlateFaceIdentities` läuft nur wenn `!isAdvance`. → für Pass 2/3/4 (Advance-Dispatches) wird `plateIdentityMap` nie geladen, `speakerPlateBboxes` bleibt komplett `null`.
- **Zeile 1334**: Pre-Flight-Hard-Fail-Gate ist auf `!isAdvance && !isRetry` beschränkt — feuert für Advance-Passes nicht.
- **Zeile 2911**: `v153UnifiedBboxEligible` verlangt `v153HasPlateBox` → false weil `speakerPlateBboxes` leer → Fallthrough in den Legacy-`else`-Branch bei Zeile 4651, der hart `{ auto_detect: true }` setzt.

**Konsequenz heute**: nur Pass 1 (der erste, der mit der vollen Plate-Identity-Resolution startet) bekäme den Bbox-Pfad — aber selbst der nicht, weil Pass 1 ebenfalls bereits als Advance-Dispatch reinkommen kann sobald die Composer-UI den ersten Pass bereits aus einem früheren Lauf kennt. Resultat: ALLE Sprecher landen auf `auto_detect`, was Sync.so erneut die falschen Mouths animieren lässt und die Gesamtzeit identisch hält (kein Speedup, weil weiterhin auto_detect statt deterministischem Bbox-Path läuft).

### Fix-Plan

1. **`speakerPlateBboxes` in `dialog_shots` persistieren** (neue Felder im scene-state):
   - Beim allerersten Dispatch nach erfolgreicher `resolvePlateFaceIdentities` schreiben wir `dialog_shots.plate_identity = { dims, bboxes: speakerPlateBboxes, faces: plateIdentityMap.faces, resolvedCount }` in die DB.
   - Jeder nachfolgende Advance/Retry-Dispatch liest diesen Snapshot zuerst und füllt `speakerPlateBboxes` + `plateDims` daraus, **bevor** die v153-Gates greifen.

2. **Fallback: Live-Hydration für Advance/Retry**:
   - Wenn der persistierte Snapshot fehlt (Legacy-Scenes), entfernen wir die `!isAdvance`-Schranke bei Zeile 1232 und lassen `resolvePlateFaceIdentities` auch für Advance/Retry laufen (ist bereits per `(scene_id, plate_url)` gecached → günstig).

3. **Pre-Flight-Hard-Fail-Gate generalisieren** (Zeile 1334):
   - Bedingung von `!isAdvance && !isRetry` auf `speakers.length >= 1 && !!plateDims` ändern.
   - Jeder Pass — egal Fresh, Advance oder Retry — muss seine eigene plate-native Box haben oder es feuert sofort der Hard-Fail + Credit-Refund.

4. **v153 Eligibility-Gate vereinheitlichen** (Zeile 2911):
   - `body?.noop_auto_escalation !== true` Bedingung bleibt.
   - Nach Schritt 1+2 ist `v153HasPlateBox` jetzt für jeden Pass true → `_v153BboxPrimary = true` für ALLE Passes → Dispatch geht zwingend in `bbox-url-pro`.

5. **Legacy-`else`-Branch bei Zeile 4650 endgültig dichtmachen**:
   - Statt `syncOptions.active_speaker_detection = { auto_detect: true }` ein `failBeforeProviderDispatch("v153_unexpected_legacy_branch", …)` mit Credit-Refund — sodass kein einziger Pfad mehr stille `auto_detect:true`-Dispatches absetzen kann.

6. **Versions-Bump auf `v153.2`** und neuer Diagnose-Log `v153.2_plate_hydration source=persisted|live|missing` pro Pass.

### Erwartetes Verhalten

- WIRE_PAYLOAD enthält für JEDEN Pass `{"auto_detect":false,"bounding_boxes_url":"…"}` — niemals mehr `auto_detect:true`.
- Wenn Plate-Identity nicht eindeutig auflösbar ist, **bricht der erste betroffene Pass sofort hart ab + refundet alle Credits** statt 20-30 min weiterzulaufen → spürbarer Speedup.
- Sprecher-Swap-Bug („Sprecher 1 spricht für Sprecher 1+2") ist ausgeschlossen, weil jeder Pass deterministisch seine eigene plate-native Box bekommt.

### Files

- `supabase/functions/compose-dialog-segments/index.ts` (Hydration, Gate-Erweiterung, Legacy-else dichtmachen, Versions-Bump)
- `mem/architecture/lipsync/v153-single-path-bbox-pipeline.md` (Update auf v153.2 inkl. Persist+Hydrate)
- `mem/index.md` (Eintrag aktualisieren)
- Deploy: `compose-dialog-segments`