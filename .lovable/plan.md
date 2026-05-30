## Befund

Der Fehler ist jetzt klar sichtbar: `raw_talking_head_source_blocked` ist kein neuer Provider-Ausfall, sondern ein Schutzmechanismus, der korrekt verhindert, dass Lip-Sync auf einem rohen Talking-Head-Avatar startet.

Der konkrete kaputte Datensatz ist eine Cinematic-Sync-Szene mit:

- `clip_source = ai-happyhorse`
- `engine_override = cinematic-sync`
- `clip_status = ready`
- `clip_url = .../talking-head-renders/...mp4`
- `reference_image_url = null`
- `lip_sync_status = failed`
- `twoshot_stage = failed`

Damit ist die Ursache: Der Clip-Schritt wurde fälschlich als „ready“ akzeptiert, obwohl der fertige Clip kein echter Szenen-Master ist, sondern ein Talking-Head-Render. Danach blockt v5 Lip-Sync absichtlich.

Do I know what the issue is? Ja.

## Was ich ändern werde

### 1. Auto-Trigger darf Talking-Head nicht als Master-Plate behandeln

In `src/hooks/useTwoShotAutoTrigger.ts`:

- Vor Audio-Prep und Lip-Sync-Kandidatenprüfung wird `talking-head-renders` als ungültige Master-Quelle erkannt.
- Solche Szenen werden nicht erneut an `compose-dialog-segments` geschickt.
- Stattdessen wird der Zustand auf „Clip muss neu gerendert werden“ zurückgesetzt:
  - `clip_url = null`
  - `clip_status = pending`
  - `lip_sync_status = pending/null`
  - `twoshot_stage = null`
  - `lip_sync_source_clip_url = null`
  - `replicate_prediction_id = null`
- Dadurch triggert „Alle generieren“ wieder zuerst den echten Clip-/Scene-Plate-Schritt, statt direkt wieder Lip-Sync auf dem Avatar zu versuchen.

### 2. `compose-dialog-segments` blockt nicht nur, sondern heilt den Zustand

In `supabase/functions/compose-dialog-segments/index.ts`:

- Wenn `clip_url` oder `lip_sync_source_clip_url` ein `talking-head-renders`-Video ist, wird nicht nur `lip_sync_status='failed'` gesetzt.
- Der Clip wird zusätzlich als ungültiger Master markiert und zum Neu-Rendern freigegeben.
- Rückgabe bleibt klar: `raw_talking_head_source_blocked`, aber die UI kann danach sauber über Clip-Render neu starten.

### 3. `compose-video-clips` darf Cinematic-Sync nie ohne Anchor weiterlaufen lassen

In `supabase/functions/compose-video-clips/index.ts`:

- Für Cinematic-Sync mit Dialog/Charakter gilt künftig hart:
  - kein `reference_image_url` aus `/scene-anchors/` oder `/composer-anchors/` → kein HappyHorse/Hailuo-Dispatch.
  - kein stilles Text-to-Video-Fallback.
- Wenn die Charakterauflösung scheitert, wird der Clip sichtbar mit `anchor_missing`/`cinematic_sync_anchor_missing` abgebrochen.
- Für HappyHorse-Cinematic-Sync bleibt der Master-Render nur erlaubt, wenn ein komponierter Anchor existiert.

### 4. Bestehende kaputte Szene bereinigen

Ich werde die aktuell kaputte Szene `c95a44c4-6e85-403b-9d47-ebd25391e936` zurücksetzen:

- rohen `talking-head-renders`-Clip entfernen
- Lip-Sync-Fehlerstatus entfernen
- stale Sync-/Dialog-Felder leeren
- Scene-Anchor-Cache für diese Szene löschen

Danach kann „Alle generieren“ den korrekten Ablauf starten:

```text
Scene-aware Anchor → echter Master-Clip → Lip-Sync
```

### 5. Validierung

Nach Umsetzung prüfe ich:

- Die Datenbank enthält keinen `talking-head-renders`-Master mehr für diese Cinematic-Sync-Szene.
- Der Auto-Trigger startet nicht mehr direkt Lip-Sync auf rohen Avatar-Clips.
- Der Fortschrittsbalken zeigt den Fehler nicht mehr als verschwindenden Zustand, sondern bleibt als Clip/Lip-Sync-Workflow nachvollziehbar.
- Die betroffenen Edge Functions werden neu deployed.